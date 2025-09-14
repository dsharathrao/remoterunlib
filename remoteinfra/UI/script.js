class RemoteRunApp {
    constructor() {
        this.machines = [];
        this.currentSection = 'machines';
        this.logs = [];
        this.websocket = null;
        this.socket = null;
        this.editors = {};
        this.editingContext = null; // For tracking file editing state

        // Dashboard state
        this.dashboardFilters = {
            machine_id: '',
            type: '',
            status: ''
        };

        // Auto-logs state management
        this.logsState = {
            isExecuting: false,
            userInteractingWithLogs: false,
            lastUserAction: null,
            autoMinimizeTimeout: null,
            executionStartTime: null,
            manuallyCollapsed: false
        };

        // Running executions tracking
        this.runningExecutions = new Map();
        this.notificationQueue = [];

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupSocketIO();
        this.loadMachines();
        this.populateMachineSelects();
        this.setupFileUploads();
        this.setupTabs();
        this.setupCodeEditors();
        this.setupDockerInterface();
        this.startPingInterval();
        this.setupNotificationSystem();

        // Hierarchical directory enhancements (breadcrumbs, subdirectory + ZIP)
        setTimeout(() => this.setupZipAndSubdirListeners(), 600);

        // Initialize running executions display (ensures spinner starts correctly)
        this.updateRunningExecutionsDisplay();

        // Add event listener for Execute Command button
        const execBtn = document.getElementById('execute-command-btn');
        if (execBtn) {
            execBtn.addEventListener('click', () => this.executeCommand());
        }

        // Add event listener for Run Python button (ensure only one handler)
        const runPythonBtn = document.getElementById('run-python-btn');
        if (runPythonBtn) {
            runPythonBtn.onclick = null;
            runPythonBtn.addEventListener('click', () => this.runPythonScript());
        }

        // Add event listener for Save Python button
        const savePythonBtn = document.getElementById('save-python-btn');
        if (savePythonBtn) {
            savePythonBtn.onclick = null;
            savePythonBtn.addEventListener('click', () => this.savePythonScript());
        }

        // Add event listener for Run Ansible button (ensure only one handler)
        const runAnsibleBtn = document.getElementById('run-ansible-btn');
        if (runAnsibleBtn) {
            runAnsibleBtn.onclick = null;
            runAnsibleBtn.addEventListener('click', () => this.runAnsible());
        }

        // Add event listener for Save Ansible button
        const saveAnsibleBtn = document.getElementById('save-ansible-btn');
        if (saveAnsibleBtn) {
            saveAnsibleBtn.onclick = null;
            saveAnsibleBtn.addEventListener('click', () => this.saveAnsibleScript());
        }

        // Add event listener for Save Terraform button
        const saveTerraformBtn = document.getElementById('save-terraform-btn');
        if (saveTerraformBtn) {
            saveTerraformBtn.onclick = null;
            saveTerraformBtn.addEventListener('click', () => this.saveTerraformScript());
        }

        // Docker Save button
        const saveDockerBtn = document.getElementById('save-docker-btn');
        if (saveDockerBtn) {
            saveDockerBtn.onclick = null;
            saveDockerBtn.addEventListener('click', () => this.saveDockerScript());
        }

        // Add event listeners for Clear buttons
        const clearCommandBtn = document.getElementById('clear-command-btn');
        if (clearCommandBtn) {
            clearCommandBtn.addEventListener('click', () => this.clearCommand());
        }

        const clearPythonBtn = document.getElementById('clear-python-btn');
        if (clearPythonBtn) {
            clearPythonBtn.addEventListener('click', () => this.clearPython());
        }

        const clearTerraformBtn = document.getElementById('clear-terraform-btn');
        if (clearTerraformBtn) {
            clearTerraformBtn.addEventListener('click', () => this.clearTerraform());
        }

        // Docker Clear button
        const clearDockerBtn = document.getElementById('clear-docker-editor-btn');
        if (clearDockerBtn) {
            clearDockerBtn.addEventListener('click', () => this.clearDocker());
        }

        // SSH Key upload handlers (deferred to ensure modal elements exist)
        setTimeout(() => {
            const uploadBtn = document.getElementById('upload-key-btn');
            const fileInput = document.getElementById('machine-key-file');
            const clearBtn = document.getElementById('clear-key-btn');
            if (uploadBtn && fileInput) {
                uploadBtn.addEventListener('click', () => fileInput.click());
                fileInput.addEventListener('change', (e) => {
                    const file = e.target.files?.[0];
                    if (file) this.uploadSSHKeyFile(file);
                });
            }
            if (clearBtn) {
                clearBtn.addEventListener('click', () => {
                    const keyInput = document.getElementById('machine-key');
                    if (keyInput) keyInput.value = '';
                    if (fileInput) fileInput.value = '';
                    clearBtn.style.display = 'none';
                    this.addLog('Cleared uploaded SSH key reference', 'info');
                });
            }
        }, 400);

        // Add event listeners for new tab-specific buttons
        // Python Upload and Editor buttons
        const runPythonUploadBtn = document.getElementById('run-python-upload-btn');
        if (runPythonUploadBtn) {
            runPythonUploadBtn.addEventListener('click', () => this.runPythonScript());
        }

        const clearPythonUploadBtn = document.getElementById('clear-python-upload-btn');
        if (clearPythonUploadBtn) {
            clearPythonUploadBtn.addEventListener('click', () => this.clearPython());
        }

        const runPythonEditorBtn = document.getElementById('run-python-editor-btn');
        if (runPythonEditorBtn) {
            runPythonEditorBtn.addEventListener('click', () => this.runPythonScript());
        }

        const clearPythonEditorBtn = document.getElementById('clear-python-editor-btn');
        if (clearPythonEditorBtn) {
            clearPythonEditorBtn.addEventListener('click', () => this.clearPython());
        }

        // Generic Editor New / Close buttons
        this.bindEditorFileControls();

        // Ansible Upload and Editor buttons
        const runAnsibleUploadBtn = document.getElementById('run-ansible-upload-btn');
        if (runAnsibleUploadBtn) {
            runAnsibleUploadBtn.addEventListener('click', () => this.runAnsible());
        }

        const clearAnsibleUploadBtn = document.getElementById('clear-ansible-upload-btn');
        if (clearAnsibleUploadBtn) {
            clearAnsibleUploadBtn.addEventListener('click', () => this.clearAnsible());
        }

        const runAnsibleEditorBtn = document.getElementById('run-ansible-editor-btn');
        if (runAnsibleEditorBtn) {
            runAnsibleEditorBtn.addEventListener('click', () => this.runAnsible());
        }

        const clearAnsibleEditorBtn = document.getElementById('clear-ansible-editor-btn');
        if (clearAnsibleEditorBtn) {
            clearAnsibleEditorBtn.addEventListener('click', () => this.clearAnsible());
        }

        // Docker editor buttons
        const runDockerEditorBtn = document.getElementById('run-docker-editor-btn');
        if (runDockerEditorBtn) {
            runDockerEditorBtn.addEventListener('click', () => this.runDockerScript());
        }

        // Ansible Ad-hoc buttons
        const runAnsibleAdhocBtn = document.getElementById('run-ansible-adhoc-btn');
        if (runAnsibleAdhocBtn) {
            runAnsibleAdhocBtn.addEventListener('click', () => this.runAnsible());
        }

        const clearAnsibleAdhocBtn = document.getElementById('clear-ansible-adhoc-btn');
        if (clearAnsibleAdhocBtn) {
            clearAnsibleAdhocBtn.addEventListener('click', () => this.clearAnsible());
        }

        // Simplified Terraform: unified Execute Project button within directory view handles all workflows

        // (Legacy upload Run button kept for compatibility but will route through unified handler if present)
        const runTerraformUploadBtn = document.getElementById('run-terraform-upload-btn');
        if (runTerraformUploadBtn) {
            runTerraformUploadBtn.addEventListener('click', () => this.executeTerraformWorkflowFromEditor?.('plan'));
        }
        const clearTerraformUploadBtn = document.getElementById('clear-terraform-upload-btn');
        if (clearTerraformUploadBtn) {
            clearTerraformUploadBtn.addEventListener('click', () => this.clearTerraform?.());
        }

        // Fix: Add event listeners for Ansible mode toggle buttons (removed - using direct tab switching now)

        // Load existing files on startup
        this.loadExistingFiles('python');
        this.loadExistingFiles('ansible');
        this.loadExistingFiles('terraform');

        // Initialize directory management
        this.initDirectoryManagement();

        // Dashboard
        this.initDashboard();

        // Modal close for execution details
        document.getElementById('close-execution-details-btn').addEventListener('click', () => {
            this.hideModal('execution-details-modal');
        });

        // Download buttons for execution details
        document.getElementById('download-output-btn').addEventListener('click', () => {
            this.downloadExecutionData('output');
        });

        document.getElementById('download-logs-btn').addEventListener('click', () => {
            this.downloadExecutionData('logs');
        });

        // Save Machine button event (for add new)
        const saveBtn = document.getElementById('save-machine-btn');
        if (saveBtn) {
            saveBtn.textContent = 'Save Machine';
            saveBtn.onclick = () => this.saveMachine();
            this._saveMachineHandler = saveBtn.onclick;
        }

        // Fix: Add event listener for Test Connection button in modal
        const testBtn = document.getElementById('test-connection-btn');
        if (testBtn) {
            // Remove any previous event listeners to avoid stacking
            testBtn.onclick = null;
            testBtn.addEventListener('click', (e) => {
                e.preventDefault();
                // Always use the machine-id from the modal form
                const machineId = document.getElementById('machine-id').value;
                if (!machineId) {
                    alert('Please fill in the machine details and save first.');
                    return;
                }
                // Call testMachineConnection with the correct id
                this.testMachineConnection(machineId);
            });
        }

        // Initialize privilege controls
        this.initPrivilegeControls();

        // Initialize overview functionality
        this.initOverviewFunctionality();

        // Initialize auto-logs behavior
        this.initAutoLogsManagement();
    }

    // === UTILITY METHODS ===
    bindEditorFileControls() {
        // Mapping of editors
        const editors = [
            {
                type: 'python', ext: '.py', editorId: 'python-editor', nameId: 'python-tab-name', filenameInput: 'python-filename', newBtn: 'python-new-file-btn', closeBtn: 'python-close-file-btn', placeholder: '# New Python script...\n', defaultName: 'script.py'
            },
            {
                type: 'ansible', ext: '.yml', editorId: 'ansible-editor', nameId: 'ansible-tab-name', filenameInput: 'ansible-filename', newBtn: 'ansible-new-file-btn', closeBtn: 'ansible-close-file-btn', placeholder: '# New Ansible playbook...\n---\n- hosts: all\n  tasks:\n    - debug: msg="Hello"\n', defaultName: 'playbook.yml'
            },
            {
                type: 'terraform', ext: '.tf', editorId: 'terraform-editor', nameId: 'terraform-tab-name', filenameInput: 'terraform-filename', newBtn: 'terraform-new-file-btn', closeBtn: 'terraform-close-file-btn', placeholder: '# New Terraform config...\n', defaultName: 'main.tf'
            },
            {
                type: 'docker', ext: '.yml', editorId: 'docker-editor', nameId: 'docker-tab-name', filenameInput: 'docker-filename', newBtn: 'docker-new-file-btn', closeBtn: 'docker-close-file-btn', placeholder: '# New Docker compose or Dockerfile content...\n', defaultName: 'docker-compose.yml'
            }
        ];

        editors.forEach(cfg => {
            const newBtn = document.getElementById(cfg.newBtn);
            if (newBtn && !newBtn._bound) {
                newBtn.addEventListener('click', () => {
                    const name = prompt(`Enter new ${cfg.type} file name:`, cfg.defaultName);
                    if (!name) return;
                    document.getElementById(cfg.editorId).value = cfg.placeholder;
                    const tabName = document.getElementById(cfg.nameId);
                    if (tabName) tabName.textContent = name;
                    const fnameInput = document.getElementById(cfg.filenameInput);
                    if (fnameInput) fnameInput.value = name;
                    this.addLog(`${cfg.type} new file ready: ${name}`, 'info');
                });
                newBtn._bound = true;
            }
            const closeBtn = document.getElementById(cfg.closeBtn);
            if (closeBtn && !closeBtn._bound) {
                closeBtn.addEventListener('click', () => {
                    if (!confirm('Close current file (unsaved changes will be lost)?')) return;
                    document.getElementById(cfg.editorId).value = '';
                    const tabName = document.getElementById(cfg.nameId);
                    if (tabName) tabName.textContent = cfg.defaultName;
                    const fnameInput = document.getElementById(cfg.filenameInput);
                    if (fnameInput) fnameInput.value = '';
                    this.addLog(`${cfg.type} file closed`, 'info');
                });
                closeBtn._bound = true;
            }
        });
    }
    escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') {
            return String(unsafe || '');
        }
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // === PRIVILEGE CONTROLS MANAGEMENT ===
    initPrivilegeControls() {
        // Initialize all privilege control checkboxes
        const privilegeCheckboxes = [
            'ansible-adhoc-become',
            'ansible-upload-become',
            'ansible-editor-become'
        ];

        privilegeCheckboxes.forEach(checkboxId => {
            const checkbox = document.getElementById(checkboxId);
            if (checkbox) {
                // Get the parent privilege control container
                const controlContainer = checkbox.closest('.privilege-control');

                // Add change event listener
                checkbox.addEventListener('change', (e) => {
                    this.updatePrivilegeControlState(controlContainer, e.target.checked);
                });

                // Set initial state
                this.updatePrivilegeControlState(controlContainer, checkbox.checked);
            }
        });
    }

    updatePrivilegeControlState(container, isEnabled) {
        if (!container) return;

        if (isEnabled) {
            container.classList.add('enabled');
            // Optional: Add subtle animation
            container.style.transform = 'scale(1.02)';
            setTimeout(() => {
                container.style.transform = '';
            }, 200);
        } else {
            container.classList.remove('enabled');
        }
    }

    // === OVERVIEW FUNCTIONALITY INITIALIZATION ===
    initOverviewFunctionality() {
        // Python overview refresh button
        const refreshPythonOverviewBtn = document.getElementById('refresh-python-overview-btn');
        if (refreshPythonOverviewBtn) {
            refreshPythonOverviewBtn.addEventListener('click', () => this.refreshPythonOverview(true));
        }

        // Ansible overview refresh button
        const refreshAnsibleOverviewBtn = document.getElementById('refresh-ansible-overview-btn');
        if (refreshAnsibleOverviewBtn) {
            refreshAnsibleOverviewBtn.addEventListener('click', () => this.refreshAnsibleOverview(true));
        }

        // Terraform overview refresh button
        const refreshTerraformOverviewBtn = document.getElementById('refresh-terraform-overview-btn');
        if (refreshTerraformOverviewBtn) {
            refreshTerraformOverviewBtn.addEventListener('click', () => this.refreshTerraformOverview(true));
        }

        // Machine selection change handlers for overview auto-refresh
        const pythonMachineSelect = document.getElementById('python-machine-select');
        if (pythonMachineSelect) {
            pythonMachineSelect.addEventListener('change', () => {
                // Check if overview tab is active
                const overviewTab = document.querySelector('#python-section .tab-btn[data-tab="overview-python"]');
                if (overviewTab && overviewTab.classList.contains('active')) {
                    this.refreshPythonOverview();
                }
            });
        }

        const ansibleMachineSelect = document.getElementById('ansible-machine-select');
        if (ansibleMachineSelect) {
            ansibleMachineSelect.addEventListener('change', () => {
                // Check if overview tab is active
                const overviewTab = document.querySelector('#ansible-section .tab-btn[data-tab="overview-ansible"]');
                if (overviewTab && overviewTab.classList.contains('active')) {
                    this.refreshAnsibleOverview();
                }
            });
        }

        const terraformMachineSelect = document.getElementById('terraform-machine-select');
        if (terraformMachineSelect) {
            terraformMachineSelect.addEventListener('change', () => {
                // Check if overview tab is active
                const overviewTab = document.querySelector('#terraform-section .tab-btn[data-tab="overview-terraform"]');
                if (overviewTab && overviewTab.classList.contains('active')) {
                    this.refreshTerraformOverview();
                }
            });
        }

        const dockerMachineSelect = document.getElementById('docker-machine-select');
        if (dockerMachineSelect) {
            dockerMachineSelect.addEventListener('change', () => {
                const overviewTab = document.querySelector('#docker-section .tab-btn[data-tab="overview-docker"]');
                if (overviewTab && overviewTab.classList.contains('active')) {
                    this.refreshDockerInfo();
                }
            });
        }

        // Tab switching handlers for overview auto-load
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('tab-btn')) {
                const tabName = e.target.dataset.tab;

                if (tabName === 'overview-python') {
                    setTimeout(() => this.refreshPythonOverview(), 100);
                } else if (tabName === 'overview-ansible') {
                    setTimeout(() => this.refreshAnsibleOverview(), 100);
                } else if (tabName === 'overview-terraform') {
                    setTimeout(() => this.refreshTerraformOverview(), 100);
                } else if (tabName === 'overview-docker') {
                    setTimeout(() => this.refreshDockerInfo(), 100);
                }
            }
        });
    }

    // === AUTO-LOGS MANAGEMENT SYSTEM ===
    initAutoLogsManagement() {
        // Set up logs panel interaction detection
        const logsPanel = document.getElementById('logs-panel');
        if (logsPanel) {
            // Detect user interaction with logs panel
            logsPanel.addEventListener('mouseenter', () => {
                this.logsState.userInteractingWithLogs = true;
                this.clearAutoMinimizeTimeout();
            });

            logsPanel.addEventListener('mouseleave', () => {
                // Delay before considering user no longer interacting
                setTimeout(() => {
                    this.logsState.userInteractingWithLogs = false;
                    this.scheduleAutoMinimizeIfIdle();
                }, 1000);
            });

            // Track clicks within logs panel
            logsPanel.addEventListener('click', (e) => {
                this.logsState.userInteractingWithLogs = true;
                this.clearAutoMinimizeTimeout();

                // If user manually collapsed, remember this preference
                if (e.target.closest('#toggle-logs-btn')) {
                    this.logsState.manuallyCollapsed = logsPanel.classList.contains('collapsed');
                }
            });
        }

        // Track general user activity that should minimize logs
        this.setupActivityTracking();

        // Start with logs minimized
        this.autoMinimizeLogs(false);
    }

    setupActivityTracking() {
        // Track navigation clicks
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                this.handleUserActivity('navigation');
            });
        });

        // Track tab switches
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('tab-btn')) {
                this.handleUserActivity('tab-switch');
            }
        });

        // Track typing in editors
        document.querySelectorAll('.code-editor, input, textarea').forEach(element => {
            element.addEventListener('focus', () => {
                this.handleUserActivity('editing');
            });
        });

        // Track form interactions
        document.addEventListener('click', (e) => {
            if (e.target.closest('.form-control, .btn:not(.logs-controls .btn)')) {
                // Exclude logs control buttons
                if (!e.target.closest('.logs-panel')) {
                    this.handleUserActivity('form-interaction');
                }
            }
        });
    }

    handleUserActivity(activityType) {
        this.logsState.lastUserAction = {
            type: activityType,
            timestamp: Date.now()
        };

        // Auto-minimize if not executing and not already manually collapsed
        if (!this.logsState.isExecuting && !this.logsState.userInteractingWithLogs) {
            this.scheduleAutoMinimize();
        }
    }

    scheduleAutoMinimize() {
        this.clearAutoMinimizeTimeout();

        // Wait 2 seconds before auto-minimizing
        this.logsState.autoMinimizeTimeout = setTimeout(() => {
            if (!this.logsState.isExecuting && !this.logsState.userInteractingWithLogs) {
                this.autoMinimizeLogs(true);
            }
        }, 2000);
    }

    scheduleAutoMinimizeIfIdle() {
        // Only schedule if execution is done and user is not actively using logs
        if (!this.logsState.isExecuting && !this.logsState.userInteractingWithLogs) {
            this.scheduleAutoMinimize();
        }
    }

    clearAutoMinimizeTimeout() {
        if (this.logsState.autoMinimizeTimeout) {
            clearTimeout(this.logsState.autoMinimizeTimeout);
            this.logsState.autoMinimizeTimeout = null;
        }
    }

    autoOpenLogs() {
        const logsPanel = document.getElementById('logs-panel');
        if (logsPanel && logsPanel.classList.contains('collapsed')) {
            // Only auto-open if user didn't manually collapse during this execution
            if (!this.logsState.manuallyCollapsed) {
                logsPanel.classList.remove('collapsed');

                // Update toggle button
                const toggleBtn = document.getElementById('toggle-logs-btn');
                if (toggleBtn) {
                    const icon = toggleBtn.querySelector('i');
                    if (icon) {
                        icon.className = 'fas fa-chevron-down';
                        toggleBtn.title = 'Collapse';
                    }
                }

                this.addLog('🔍 Auto-opened logs for execution monitoring', 'info');
            }
        }
    }

    displayOutput(elementId, result) {
        // Auto-open logs for better visibility
        this.autoOpenLogs();

        // Display the output using the existing log system
        if (result.success) {
            if (result.output) {
                // Format output with proper line breaks
                const formattedOutput = result.output.replace(/\n/g, '\n    ');
                this.addLog(`📋 Output:\n    ${formattedOutput}`, 'success');
            }
        } else {
            // Display error information
            const errorMsg = result.error || result.errors || 'Unknown error';
            this.addLog(`❌ Error: ${errorMsg}`, 'error');

            // Also display any output that might be available
            if (result.output) {
                const formattedOutput = result.output.replace(/\n/g, '\n    ');
                this.addLog(`📋 Output:\n    ${formattedOutput}`, 'info');
            }
        }
    }

    autoMinimizeLogs(showMessage = false) {
        const logsPanel = document.getElementById('logs-panel');
        if (logsPanel && !logsPanel.classList.contains('collapsed')) {
            // Only auto-minimize if user is not interacting with logs
            if (!this.logsState.userInteractingWithLogs) {
                logsPanel.classList.add('collapsed');

                // Update toggle button
                const toggleBtn = document.getElementById('toggle-logs-btn');
                if (toggleBtn) {
                    const icon = toggleBtn.querySelector('i');
                    if (icon) {
                        icon.className = 'fas fa-chevron-up';
                        toggleBtn.title = 'Expand';
                    }
                }

                if (showMessage) {
                    this.addLog('📝 Auto-minimized logs (click to expand)', 'info');
                }
            }
        }
    }

    startExecution(executionType = 'command') {
        this.logsState.isExecuting = true;
        this.logsState.executionStartTime = Date.now();
        this.logsState.manuallyCollapsed = false; // Reset manual collapse preference
        this.clearAutoMinimizeTimeout();

        // Auto-open logs for execution
        this.autoOpenLogs();

        this.addLog(`🚀 Starting ${executionType} execution...`, 'info');
    }

    endExecution(success = true) {
        this.logsState.isExecuting = false;
        const duration = this.logsState.executionStartTime ?
            ((Date.now() - this.logsState.executionStartTime) / 1000).toFixed(1) : 'unknown';

        const message = success ?
            `✅ Execution completed successfully (${duration}s)` :
            `❌ Execution failed (${duration}s)`;

        this.addLog(message, success ? 'success' : 'error');

        // Schedule auto-minimize after execution is done (wait 5 seconds)
        setTimeout(() => {
            this.scheduleAutoMinimizeIfIdle();
        }, 5000);
    }

    // --- Dashboard logic ---
    initDashboard() {
        // Initial load
        this.loadDashboardStats();
        this.loadDashboardHistory();
        // Update running executions display
        this.updateRunningExecutionsDisplay();
        // Populate machine filter
        this.populateDashboardMachineFilter();
        // Filter change listeners
        document.getElementById('machine-filter').addEventListener('change', (e) => {
            this.dashboardFilters.machine_id = e.target.value;
            this.loadDashboardHistory();
        });
        document.getElementById('type-filter').addEventListener('change', (e) => {
            this.dashboardFilters.type = e.target.value;
            this.loadDashboardHistory();
        });
        document.getElementById('status-filter').addEventListener('change', (e) => {
            this.dashboardFilters.status = e.target.value;
            this.loadDashboardHistory();
        });
        document.getElementById('refresh-dashboard-btn').addEventListener('click', () => {
            this.loadDashboardStats();
            this.loadDashboardHistory();
        });
        document.getElementById('clear-history-btn').addEventListener('click', () => {
            if (confirm('Clear all execution history?')) {
                this.clearExecutionHistory();
            }
        });
    }

    async loadDashboardStats() {
        try {
            const res = await fetch('/api/execution-stats');
            if (!res.ok) return;
            const stats = await res.json();
            document.getElementById('successful-executions').textContent = stats.successful_executions || 0;
            document.getElementById('failed-executions').textContent = stats.failed_executions || 0;
            document.getElementById('active-machines').textContent = stats.active_machines || 0;
            document.getElementById('recent-executions').textContent = stats.recent_executions || 0;
            // Use client-side running executions count instead of backend
            document.getElementById('running-executions').textContent = this.runningExecutions.size;
        } catch (e) {
            // ignore
        }
    }

    async loadDashboardHistory() {
        const params = [];
        if (this.dashboardFilters.machine_id) params.push('machine_id=' + encodeURIComponent(this.dashboardFilters.machine_id));
        if (this.dashboardFilters.type) params.push('type=' + encodeURIComponent(this.dashboardFilters.type));
        if (this.dashboardFilters.status) params.push('status=' + encodeURIComponent(this.dashboardFilters.status));
        // Always show last 24h by default
        params.push('last_24h=1');
        const url = '/api/execution-history' + (params.length ? '?' + params.join('&') : '');
        try {
            const res = await fetch(url);
            if (!res.ok) return;
            const history = await res.json();
            this.renderDashboardHistory(history);
        } catch (e) {
            // ignore
        }
    }

    renderDashboardHistory(history) {
        const list = document.getElementById('execution-list');
        list.innerHTML = '';
        if (!history || !history.length) {
            list.innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i><p>No executions found</p></div>`;
            return;
        }
        for (const item of history) {
            const div = document.createElement('div');
            div.className = 'execution-item';
            div.innerHTML = `
                <div class="execution-status ${item.status === 'success' ? 'success' : (item.status === 'failed' ? 'failed' : 'running')}"></div>
                <div class="execution-info">
                    <div class="execution-main">
                        <div class="execution-title">${item.command ? item.command.substring(0, 40) : ''}</div>
                        <div class="execution-subtitle">${item.machine_id || ''} <span class="machine-host"></span></div>
                    </div>
                    <div class="execution-type ${item.type}">${item.type || ''}</div>
                    <div class="execution-duration">${item.duration ? item.duration.toFixed(1) + 's' : ''}</div>
                    <div class="execution-time">${item.started_at ? this.formatDate(item.started_at) : ''}</div>
                    <div class="execution-time">${item.status || ''}</div>
                </div>
                <div class="execution-actions"></div>
            `;
            // Store execution id for click and cancel functionality
            div.dataset.execId = item.id;
            div.dataset.executionId = item.id;
            // Fetch and show machine host
            if (item.machine_id === "local" && item.type === "terraform") {
                // For terraform local executions, show "Local" as host
                div.querySelector('.machine-host').innerHTML = `<b>(Local)</b>`;
            } else {
                const machine = this.machines.find(m => m.id === item.machine_id);
                if (machine) {
                    div.querySelector('.machine-host').innerHTML = `<b>(${machine.host})</b>`;
                }
            }
            // Click to show details modal
            div.addEventListener('click', () => this.showExecutionDetails(item.id));
            list.appendChild(div);
        }

        // Apply running status indicators after rendering
        this.updateExecutionHistoryWithRunningStatus();
    }

    async showExecutionDetails(execId) {
        try {
            this.showLoading();
            const res = await fetch(`/api/execution/${execId}`);
            if (!res.ok) {
                alert('Failed to load execution details');
                this.hideLoading();
                return;
            }
            const data = await res.json();
            // Fill modal fields
            document.getElementById('execution-modal-title').textContent = `Execution Details`;
            document.getElementById('detail-machine').textContent = data.machine_name
                ? `${data.machine_name} (${data.machine_host})`
                : data.machine_host || data.machine_id;
            document.getElementById('detail-type').textContent = data.type || '';
            document.getElementById('detail-status').textContent = data.status || '';
            document.getElementById('detail-duration').textContent = data.duration ? data.duration.toFixed(1) + 's' : '';
            document.getElementById('detail-started').textContent = data.started_at || '';
            document.getElementById('detail-completed').textContent = data.completed_at || '';
            document.getElementById('detail-command').textContent = data.command || '';
            document.getElementById('detail-output').textContent = data.output || '';
            document.getElementById('detail-logs').textContent = data.logs || '';

            // Store current execution data for downloads
            this.currentExecutionData = data;

            this.showModal('execution-details-modal');
        } catch (e) {
            alert('Failed to load execution details');
        } finally {
            this.hideLoading();
        }
    }

    downloadExecutionData(type) {
        if (!this.currentExecutionData) {
            alert('No execution data available');
            return;
        }

        let content = '';
        let filename = '';
        let mimeType = 'text/plain';

        const executionInfo = {
            machine: this.currentExecutionData.machine_name
                ? `${this.currentExecutionData.machine_name} (${this.currentExecutionData.machine_host})`
                : this.currentExecutionData.machine_host || this.currentExecutionData.machine_id,
            type: this.currentExecutionData.type || 'unknown',
            status: this.currentExecutionData.status || 'unknown',
            started: this.currentExecutionData.started_at || 'unknown',
            completed: this.currentExecutionData.completed_at || 'unknown',
            duration: this.currentExecutionData.duration ? this.currentExecutionData.duration.toFixed(1) + 's' : 'unknown'
        };

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

        // Create professional filename with machine info
        const machineIdentifier = this.currentExecutionData.machine_name
            ? this.currentExecutionData.machine_name.replace(/[^a-zA-Z0-9-_]/g, '_')
            : (this.currentExecutionData.machine_host || this.currentExecutionData.machine_id || 'unknown')
                .replace(/[^a-zA-Z0-9-_.]/g, '_');

        const executionType = (this.currentExecutionData.type || 'command').replace(/[^a-zA-Z0-9-_]/g, '_');
        const statusSuffix = this.currentExecutionData.status === 'success' ? 'SUCCESS' :
            this.currentExecutionData.status === 'failed' ? 'FAILED' : 'UNKNOWN';

        if (type === 'output') {
            content = `# Execution Output Report\n`;
            content += `# Generated: ${new Date().toLocaleString()}\n`;
            content += `# remoteinfra Enterprise Edition\n`;
            content += `${'='.repeat(60)}\n\n`;
            content += `Machine: ${executionInfo.machine}\n`;
            content += `Type: ${executionInfo.type}\n`;
            content += `Status: ${executionInfo.status}\n`;
            content += `Started: ${executionInfo.started}\n`;
            content += `Completed: ${executionInfo.completed}\n`;
            content += `Duration: ${executionInfo.duration}\n`;
            content += `\n${'='.repeat(60)}\n`;
            content += `# COMMAND/SCRIPT EXECUTED:\n${'='.repeat(60)}\n${this.currentExecutionData.command || 'N/A'}\n`;
            content += `\n${'='.repeat(60)}\n`;
            content += `# EXECUTION OUTPUT:\n${'='.repeat(60)}\n${this.currentExecutionData.output || 'No output available'}`;
            filename = `remoteinfra_${machineIdentifier}_${executionType}_OUTPUT_${statusSuffix}_${timestamp}.txt`;
        } else if (type === 'logs') {
            content = `# Execution Logs Report\n`;
            content += `# Generated: ${new Date().toLocaleString()}\n`;
            content += `# remoteinfra Enterprise Edition\n`;
            content += `${'='.repeat(60)}\n\n`;
            content += `Machine: ${executionInfo.machine}\n`;
            content += `Type: ${executionInfo.type}\n`;
            content += `Status: ${executionInfo.status}\n`;
            content += `Started: ${executionInfo.started}\n`;
            content += `Completed: ${executionInfo.completed}\n`;
            content += `Duration: ${executionInfo.duration}\n`;
            content += `\n${'='.repeat(60)}\n`;
            content += `# EXECUTION LOGS:\n${'='.repeat(60)}\n${this.currentExecutionData.logs || 'No logs available'}`;
            filename = `remoteinfra_${machineIdentifier}_${executionType}_LOGS_${statusSuffix}_${timestamp}.txt`;
        }

        // Create and trigger download
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.addLog(`Downloaded ${type} for execution`, 'info');
    }

    formatDate(dt) {
        // dt: ISO string or sqlite timestamp
        if (!dt) return '';
        const d = new Date(dt.replace(' ', 'T'));
        return d.toLocaleString();
    }

    async populateDashboardMachineFilter() {
        // Populate machine filter dropdown
        try {
            const res = await fetch('/api/machines');
            if (!res.ok) return;
            const machines = await res.json();
            const sel = document.getElementById('machine-filter');
            sel.innerHTML = '<option value="">All Machines</option>';
            for (const m of machines) {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = m.name ? `${m.name} (${m.host})` : m.host;
                sel.appendChild(opt);
            }
        } catch (e) { }
    }

    async clearExecutionHistory() {
        // Call backend to clear all execution history
        try {
            const res = await fetch('/api/execution-history', { method: 'DELETE' });
            if (res.ok) {
                document.getElementById('execution-list').innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i><p>No executions found</p></div>`;
                // Refresh dashboard stats after clearing
                this.loadDashboardStats();
            } else {
                alert('Failed to clear execution history');
            }
        } catch (e) {
            alert('Failed to clear execution history');
        }
    }

    startPingInterval() {
        // Set up background ping every 3 minutes (no immediate ping; first run occurs after initial sequential check)
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
            this.pingAllMachines();
        }, 3 * 60000); // 180,000 ms = 3 minutes

        // Refresh dashboard stats every 10 seconds when on dashboard (unchanged)
        if (this.dashboardStatsInterval) clearInterval(this.dashboardStatsInterval);
        this.dashboardStatsInterval = setInterval(() => {
            if (this.currentSection === 'dashboard') {
                this.loadDashboardStats();
            }
        }, 10000); // 10 seconds

        // Update machine status note every 2 minutes to show last refreshed time
        if (this.machineStatusNoteInterval) clearInterval(this.machineStatusNoteInterval);
        this.updateMachineStatusNote(); // initial
        this.machineStatusNoteInterval = setInterval(() => {
            this.updateMachineStatusNote();
        }, 2 * 60000); // 120,000 ms = 2 minutes
    }

    updateMachineStatusNote() {
        const note = document.getElementById('machine-status-refresh-note');
        if (!note) return;
        if (!this._lastPingTimestamp) {
            note.innerHTML = `<i class="fas fa-broadcast-tower"></i> Machine connectivity will be tested on first visit. Initial connectivity check pending...`;
            return;
        }
        const last = new Date(this._lastPingTimestamp);
        const next = new Date(this._lastPingTimestamp + 3 * 60000);
        // If next check crosses to a different calendar day, include the date for clarity
        let nextDisplay = next.toLocaleTimeString();
        if (next.toDateString() !== last.toDateString()) {
            nextDisplay = `${next.toLocaleDateString()} ${nextDisplay}`;
        }
        note.innerHTML = `<i class="fas fa-broadcast-tower"></i> Machine connectivity auto-tested every <strong>3 min</strong>. Last check: <strong>${last.toLocaleTimeString()}</strong>. Next automatic check at <strong>${nextDisplay}</strong>.`;
    }

    timeUntilNextPing() {
        // Rough seconds until next ping (if interval set)
        if (!this.pingInterval) return 0;
        // Not tracking exact elapsed; provide approximate 180s window countdown using timestamp
        if (!this._lastPingTimestamp) return 180;
        const elapsed = Math.floor((Date.now() - this._lastPingTimestamp) / 1000);
        return Math.max(0, 180 - elapsed);
    }

    async pingAllMachines() {
        this._lastPingTimestamp = Date.now();
        for (const machine of this.machines) {
            this.pingMachine(machine.id);
        }
        // Update note after batch ping
        this.updateMachineStatusNote();
    }

    /**
     * Perform the initial sequential connectivity test (one-by-one) on first visit to Machines section
     */
    async initialSequentialPing() {
        if (this._machinesFirstVisitDone) return;
        if (!this.machines || !this.machines.length) return; // nothing to do yet
        this._machinesFirstVisitDone = true;
        // Sequentially test each machine so user can see progressive updates
        for (const machine of this.machines) {
            try {
                await this.pingMachine(machine.id);
            } catch (e) { /* ignore individual failures; status handled in pingMachine */ }
        }
        this._lastPingTimestamp = Date.now();
        this.updateMachineStatusNote();
    }

    async pingMachine(machineId) {
        try {
            const response = await fetch(`/api/ping-machine`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ machine_id: machineId })
            });
            const result = await response.json();
            const machine = this.machines.find(m => m.id === machineId);
            if (machine) {
                machine.status = result.success ? 'online' : 'offline';
                this.renderMachines();
            }
        } catch (error) {
            const machine = this.machines.find(m => m.id === machineId);
            if (machine) {
                machine.status = 'offline';
                this.renderMachines();
            }
        }
    }

    setupEventListeners() {
        // Navigation (always present)
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                this.switchSection(e.currentTarget.dataset.section);
            });
        });

        // Modal close (always present)
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.hideModal(e.target.closest('.modal').id);
            });
        });

        // Click outside modal to close (always present)
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideModal(modal.id);
                }
            });
        });

        // Authentication type toggle (always present)
        const authType = document.getElementById('machine-auth-type');
        if (authType) {
            authType.addEventListener('change', (e) => {
                this.toggleAuthType(e.target.value);
            });
        }

        // Filename updates for tab names (always present)
        const pyFile = document.getElementById('python-filename');
        if (pyFile) {
            pyFile.addEventListener('input', (e) => {
                this.updateTabName('python-tab-name', e.target.value || 'script.py');
            });
        }
        const ansFile = document.getElementById('ansible-filename');
        if (ansFile) {
            ansFile.addEventListener('input', (e) => {
                this.updateTabName('ansible-tab-name', e.target.value || 'playbook.yml');
            });
        }
        const tfFile = document.getElementById('terraform-filename');
        if (tfFile) {
            tfFile.addEventListener('input', (e) => {
                this.updateTabName('terraform-tab-name', e.target.value || 'main.tf');
            });
        }

        // Enhanced Logs controls (always present)
        const toggleLogsBtn = document.getElementById('toggle-logs-btn');
        if (toggleLogsBtn) toggleLogsBtn.addEventListener('click', () => this.toggleLogs());
        const maximizeLogsBtn = document.getElementById('maximize-logs-btn');
        if (maximizeLogsBtn) maximizeLogsBtn.addEventListener('click', () => this.maximizeLogs());
        const minimizeLogsBtn = document.getElementById('minimize-logs-btn');
        if (minimizeLogsBtn) minimizeLogsBtn.addEventListener('click', () => this.minimizeLogs());
        const clearLogsBtn = document.getElementById('clear-logs-btn');
        if (clearLogsBtn) clearLogsBtn.addEventListener('click', () => this.clearLogs());
    }

    setupSocketIO() {
        // Use Socket.IO client for Flask-SocketIO backend
        if (window.io && typeof io === 'function') {
            try {
                // Connect to /ws namespace
                this.socket = io('/ws', { transports: ['websocket', 'polling'] });

                this.socket.on('connect', () => {
                    this.addLog('Connected to remoteinfra Dashboard', 'success');
                });

                this.socket.on('connected', (data) => {
                    this.addLog(data.message, 'info');
                });

                this.socket.on('log', (data) => {
                    this.addLog(data.message, data.level || 'info');
                });

                // Handle execution status updates
                this.socket.on('execution_status_update', (data) => {
                    this.handleExecutionStatusUpdate(data);
                });

                // Handle execution started events
                this.socket.on('execution_started', (data) => {
                    this.handleExecutionStarted(data);
                });

                // Handle notifications
                this.socket.on('notification', (data) => {
                    this.showNotification(data.message, data.type, data.duration);
                });

                this.socket.on('disconnect', () => {
                    this.addLog('Disconnected from live logs', 'warning');
                    setTimeout(() => this.setupSocketIO(), 5000);
                });

                this.socket.on('connect_error', (error) => {
                    this.addLog('Socket.IO connection error', 'error');
                    console.error('Socket.IO error:', error);
                });
            } catch (error) {
                this.addLog('Socket.IO not available, using WebSocket fallback', 'warning');
                this.setupWebSocket();
            }
        } else {
            this.addLog('Socket.IO client not loaded, using WebSocket fallback', 'warning');
            this.setupWebSocket();
        }
    }

    setupNotificationSystem() {
        // Create notification container if it doesn't exist
        if (!document.getElementById('notification-container')) {
            const container = document.createElement('div');
            container.id = 'notification-container';
            container.className = 'notification-container';
            document.body.appendChild(container);
        }
    }

    showNotification(message, type = 'info', duration = 5000) {
        const container = document.getElementById('notification-container');
        if (!container) return;

        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;

        const icon = this.getNotificationIcon(type);
        notification.innerHTML = `
            <div class="notification-content">
                <i class="${icon}"></i>
                <span>${message}</span>
            </div>
            <button class="notification-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;

        container.appendChild(notification);

        // Auto-remove after duration
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, duration);

        // Add to notification queue for tracking
        this.notificationQueue.push({
            message,
            type,
            timestamp: new Date()
        });

        // Keep only last 10 notifications in queue
        if (this.notificationQueue.length > 10) {
            this.notificationQueue.shift();
        }
    }

    getNotificationIcon(type) {
        switch (type) {
            case 'success': return 'fas fa-check-circle';
            case 'error': return 'fas fa-exclamation-circle';
            case 'warning': return 'fas fa-exclamation-triangle';
            case 'info':
            default: return 'fas fa-info-circle';
        }
    }

    handleExecutionStarted(data) {
        const { execution_id, type, command, machine_id } = data;

        // Add to running executions
        this.runningExecutions.set(execution_id, {
            type,
            command,
            machine_id,
            started_at: new Date(),
            status: 'running'
        });

        // Add log entry
        this.addLog(`🚀 ${type.toUpperCase()} execution started: ${command}`, 'info');

        // Activity indicator integration for long-running background executions
        try {
            if (typeof this._incrementActivity === 'function') {
                if (!this.activityExecutionMap) this.activityExecutionMap = {};
                // Derive category and title
                const categoryMap = {
                    command: 'command',
                    python: 'python',
                    ansible: 'ansible',
                    terraform: 'terraform',
                    docker: 'docker'
                };
                const category = categoryMap[type] || 'generic';
                const shortCmd = (command || '').length > 60 ? command.slice(0, 57) + '…' : (command || 'Running');
                const title = `${type.toUpperCase()} – ${shortCmd}`;
                const opId = this._incrementActivity(category, { title });
                // Enrich activity operation with extra metadata
                const op = this._activity && this._activity.operations && this._activity.operations[opId];
                if (op) {
                    op.execution_id = execution_id;
                    op.command = command;
                    op.machine_id = machine_id;
                }
                this.activityExecutionMap[execution_id] = opId;
            }
        } catch (e) { /* non-fatal */ }

        // Auto-popup logs panel for new executions
        this.autoShowLogs();

        // Update dashboard if on dashboard section
        if (this.currentSection === 'dashboard') {
            this.loadDashboardHistory();
            this.loadDashboardStats(); // Refresh stats to update running count
        }

        // Update running executions display
        this.updateRunningExecutionsDisplay();
    }

    handleExecutionStatusUpdate(data) {
        const { execution_id, status, output, errors, completed_at } = data;

        if (this.runningExecutions.has(execution_id)) {
            const execution = this.runningExecutions.get(execution_id);
            execution.status = status;
            execution.completed_at = completed_at;

            // If execution is complete, show results and remove from running
            if (status === 'success' || status === 'failed' || status === 'cancelled') {
                const isSuccess = status === 'success';
                const icon = isSuccess ? '✅' : (status === 'cancelled' ? '🚫' : '❌');
                const logLevel = isSuccess ? 'success' : 'error';

                this.addLog(`${icon} ${execution.type.toUpperCase()} execution ${status}: ${execution.command}`, logLevel);

                if (output) {
                    this.addLog(`📋 Output:\n${output}`, 'info');
                }

                if (errors) {
                    this.addLog(`⚠️ Errors:\n${errors}`, 'error');
                }

                // Remove from running executions
                this.runningExecutions.delete(execution_id);

                // Complete corresponding activity indicator entry
                if (this.activityExecutionMap && this.activityExecutionMap[execution_id] && typeof this._decrementActivity === 'function') {
                    const opId = this.activityExecutionMap[execution_id];
                    const successFlag = status === 'success';
                    this._decrementActivity(opId, successFlag);
                    delete this.activityExecutionMap[execution_id];
                }
            }

            // Update displays
            this.updateRunningExecutionsDisplay();

            if (this.currentSection === 'dashboard') {
                this.loadDashboardHistory();
                this.loadDashboardStats(); // Refresh stats when execution completes
            }
        }
    }

    updateRunningExecutionsDisplay() {
        // Update dashboard stats to show running executions
        const runningCount = this.runningExecutions.size;
        const runningElement = document.getElementById('running-executions');
        if (runningElement) {
            runningElement.textContent = runningCount;
        }

        // Update spinner visibility based on running executions count
        const spinnerIcon = document.querySelector('.stat-card .stat-icon.running i');
        if (spinnerIcon) {
            if (runningCount > 0) {
                spinnerIcon.classList.add('fa-spin');
            } else {
                spinnerIcon.classList.remove('fa-spin');
            }
        }

        // Also refresh dashboard stats from backend to ensure synchronization
        if (this.currentSection === 'dashboard') {
            this.loadDashboardStats();
        }

        // Update execution history with loading indicators
        this.updateExecutionHistoryWithRunningStatus();
    }

    updateExecutionHistoryWithRunningStatus() {
        const executionItems = document.querySelectorAll('.execution-item');
        executionItems.forEach(item => {
            const statusElement = item.querySelector('.execution-status');
            const actionsElement = item.querySelector('.execution-actions');

            // Check if this execution is running
            const executionId = item.dataset.executionId;
            if (executionId && this.runningExecutions.has(executionId)) {
                // Add spinning indicator
                statusElement.classList.add('running');
                statusElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

                // Add cancel button if not already present
                if (!actionsElement.querySelector('.cancel-btn')) {
                    const cancelBtn = document.createElement('button');
                    cancelBtn.className = 'cancel-btn';
                    cancelBtn.innerHTML = '<i class="fas fa-stop"></i> Cancel';
                    cancelBtn.onclick = () => this.cancelExecution(executionId);
                    actionsElement.appendChild(cancelBtn);
                }
            } else {
                // Remove spinning indicator and cancel button
                statusElement.classList.remove('running');
                statusElement.innerHTML = '';
                const cancelBtn = actionsElement?.querySelector('.cancel-btn');
                if (cancelBtn) {
                    cancelBtn.remove();
                }
            }
        });
    }

    async cancelExecution(executionId) {
        try {
            const response = await fetch(`/api/executions/${executionId}/cancel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const result = await response.json();
            if (result.success) {
                this.addLog(`🚫 Cancelled execution: ${executionId}`, 'warning');
                this.runningExecutions.delete(executionId);
                this.updateRunningExecutionsDisplay();
            } else {
                this.addLog(`❌ Failed to cancel execution: ${result.message}`, 'error');
            }
        } catch (error) {
            this.addLog(`❌ Error cancelling execution: ${error.message}`, 'error');
        }
    }

    setupWebSocket() {
        // Fallback WebSocket connection
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;

        try {
            this.websocket = new WebSocket(wsUrl);

            this.websocket.onopen = () => {
                this.addLog('Connected to live logs via WebSocket', 'success');
            };

            this.websocket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                this.addLog(data.message, data.level || 'info');
            };

            this.websocket.onclose = () => {
                this.addLog('Disconnected from live logs', 'warning');
                setTimeout(() => this.setupWebSocket(), 5000);
            };

            this.websocket.onerror = (error) => {
                this.addLog('WebSocket error occurred', 'error');
            };
        } catch (error) {
            console.log('WebSocket not available');
        }
    }

    setupFileUploads() {
        this.setupDropZone('python-drop-zone', 'python-file-input', ['.py']);
        this.setupDropZone('ansible-drop-zone', 'ansible-file-input', ['.yml', '.yaml']);
        this.setupDropZone('terraform-drop-zone', 'terraform-file-input', ['.tf', '.tfvars']);
    }

    setupDropZone(dropZoneId, fileInputId, acceptedTypes) {
        const dropZone = document.getElementById(dropZoneId);
        const fileInput = document.getElementById(fileInputId);

        dropZone.addEventListener('click', () => fileInput.click());

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');

            const files = Array.from(e.dataTransfer.files);
            this.handleFileUpload(files, acceptedTypes);
        });

        fileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            this.handleFileUpload(files, acceptedTypes);
        });
    }

    setupTabs() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabName = e.target.dataset.tab;
                const tabContainer = e.target.closest('.file-upload-section') || e.target.closest('.script-panel');

                tabContainer.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                tabContainer.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

                e.target.classList.add('active');
                const targetPane = document.getElementById(`${tabName}-tab`) || document.getElementById(tabName);
                if (targetPane) {
                    targetPane.classList.add('active');
                }

                // Load existing files when switching to "existing" tabs
                if (tabName === 'existing') {
                    this.loadExistingFiles('python');
                } else if (tabName === 'existing-ansible') {
                    this.loadExistingFiles('ansible');
                } else if (tabName === 'existing-tf') {
                    this.loadExistingFiles('terraform');
                } else if (tabName === 'directories-python') {
                    this.loadDirectories('python');
                } else if (tabName === 'directories-ansible') {
                    this.loadDirectories('ansible');
                } else if (tabName === 'directories-tf') {
                    this.loadDirectories('terraform');
                } else if (tabName === 'directories-docker') {
                    this.loadDirectories('docker');
                }

                // Load overview data when switching to overview tabs
                if (tabName === 'overview-python') {
                    this.refreshPythonOverview();
                } else if (tabName === 'overview-ansible') {
                    this.refreshAnsibleOverview();
                } else if (tabName === 'overview-terraform') {
                    this.refreshTerraformOverview();
                }
            });
        });
    }

    setupCodeEditors() {
        // Setup line numbers and enhanced functionality for code editors
        const editors = ['python-editor', 'ansible-editor', 'terraform-editor', 'docker-editor'];

        editors.forEach(editorId => {
            const editor = document.getElementById(editorId);
            const lineNumbersId = editorId.replace('-editor', '-line-numbers');
            const lineNumbers = document.getElementById(lineNumbersId);

            if (editor && lineNumbers) {
                this.editors[editorId] = {
                    element: editor,
                    lineNumbers: lineNumbers
                };

                // Update line numbers on input
                editor.addEventListener('input', () => {
                    this.updateLineNumbers(editorId);
                });

                // Update line numbers on scroll
                editor.addEventListener('scroll', () => {
                    lineNumbers.scrollTop = editor.scrollTop;
                });

                // Handle tab key for proper indentation
                editor.addEventListener('keydown', (e) => {
                    this.handleEditorKeydown(e, editorId);
                });

                // Initial line numbers
                this.updateLineNumbers(editorId);

                // Auto-resize editor
                editor.addEventListener('input', () => {
                    this.autoResizeEditor(editorId);
                });
            }
        });
    }

    updateLineNumbers(editorId) {
        const editor = this.editors[editorId];
        if (!editor) return;

        const lines = editor.element.value.split('\n');
        const lineCount = lines.length;

        let lineNumbersHtml = '';
        for (let i = 1; i <= lineCount; i++) {
            lineNumbersHtml += i + '\n';
        }

        editor.lineNumbers.textContent = lineNumbersHtml;
    }

    handleEditorKeydown(e, editorId) {
        const editor = this.editors[editorId].element;

        // Handle Tab key for indentation
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = editor.selectionStart;
            const end = editor.selectionEnd;

            if (e.shiftKey) {
                // Shift+Tab: Remove indentation
                const beforeCursor = editor.value.substring(0, start);
                const afterCursor = editor.value.substring(end);
                const lines = beforeCursor.split('\n');
                const currentLine = lines[lines.length - 1];

                if (currentLine.startsWith('    ')) {
                    lines[lines.length - 1] = currentLine.substring(4);
                    editor.value = lines.join('\n') + afterCursor;
                    editor.selectionStart = editor.selectionEnd = start - 4;
                } else if (currentLine.startsWith('\t')) {
                    lines[lines.length - 1] = currentLine.substring(1);
                    editor.value = lines.join('\n') + afterCursor;
                    editor.selectionStart = editor.selectionEnd = start - 1;
                }
            } else {
                // Tab: Add indentation
                const indent = '    '; // 4 spaces
                editor.value = editor.value.substring(0, start) + indent + editor.value.substring(end);
                editor.selectionStart = editor.selectionEnd = start + indent.length;
            }

            this.updateLineNumbers(editorId);
        }

        // Handle Enter key for auto-indentation
        if (e.key === 'Enter') {
            const start = editor.selectionStart;
            const beforeCursor = editor.value.substring(0, start);
            const lines = beforeCursor.split('\n');
            const currentLine = lines[lines.length - 1];

            // Get current indentation
            const indentMatch = currentLine.match(/^(\s*)/);
            const currentIndent = indentMatch ? indentMatch[1] : '';

            // Add extra indentation for certain patterns
            let extraIndent = '';
            if (currentLine.trim().endsWith(':') ||
                currentLine.trim().endsWith('{') ||
                currentLine.trim().endsWith('[')) {
                extraIndent = '    ';
            }

            setTimeout(() => {
                const newStart = editor.selectionStart;
                const newIndent = currentIndent + extraIndent;
                editor.value = editor.value.substring(0, newStart) + newIndent + editor.value.substring(newStart);
                editor.selectionStart = editor.selectionEnd = newStart + newIndent.length;
                this.updateLineNumbers(editorId);
            }, 0);
        }
    }

    autoResizeEditor(editorId) {
        const editor = this.editors[editorId].element;
        const lines = editor.value.split('\n').length;
        const minHeight = 400;
        const lineHeight = 21; // Approximate line height
        const newHeight = Math.max(minHeight, lines * lineHeight + 30);

        editor.style.height = newHeight + 'px';
        this.editors[editorId].lineNumbers.style.height = newHeight + 'px';
    }

    updateTabName(tabNameId, filename) {
        const tabName = document.getElementById(tabNameId);
        if (tabName) {
            tabName.textContent = filename;
        }
    }

    // Enhanced Logs Panel Methods
    toggleLogs() {
        const logsPanel = document.getElementById('logs-panel');
        const toggleBtn = document.getElementById('toggle-logs-btn');

        logsPanel.classList.toggle('collapsed');

        const icon = toggleBtn.querySelector('i');
        if (logsPanel.classList.contains('collapsed')) {
            icon.className = 'fas fa-chevron-up';
            toggleBtn.title = 'Expand';
        } else {
            icon.className = 'fas fa-chevron-down';
            toggleBtn.title = 'Collapse';
        }
    }

    maximizeLogs() {
        const logsPanel = document.getElementById('logs-panel');
        const maximizeBtn = document.getElementById('maximize-logs-btn');
        const minimizeBtn = document.getElementById('minimize-logs-btn');

        logsPanel.classList.add('maximized');
        logsPanel.classList.remove('collapsed');

        maximizeBtn.style.display = 'none';
        minimizeBtn.style.display = 'inline-flex';

        // Update toggle button
        const toggleBtn = document.getElementById('toggle-logs-btn');
        const icon = toggleBtn.querySelector('i');
        icon.className = 'fas fa-chevron-down';
        toggleBtn.title = 'Collapse';
    }

    minimizeLogs() {
        const logsPanel = document.getElementById('logs-panel');
        const maximizeBtn = document.getElementById('maximize-logs-btn');
        const minimizeBtn = document.getElementById('minimize-logs-btn');

        logsPanel.classList.remove('maximized');

        maximizeBtn.style.display = 'inline-flex';
        minimizeBtn.style.display = 'none';
    }

    autoShowLogs() {
        // Auto-popup the logs panel when execution starts
        const logsPanel = document.getElementById('logs-panel');
        const toggleBtn = document.getElementById('toggle-logs-btn');

        if (logsPanel && logsPanel.classList.contains('collapsed')) {
            logsPanel.classList.remove('collapsed');

            // Update toggle button
            if (toggleBtn) {
                const icon = toggleBtn.querySelector('i');
                if (icon) {
                    icon.className = 'fas fa-chevron-down';
                    toggleBtn.title = 'Collapse';
                }
            }

            // Add a visual indicator that logs auto-opened
            this.addLog('📋 Live logs auto-opened for execution monitoring', 'info');
        }
    }

    switchSection(section) {
        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-section="${section}"]`).classList.add('active');

        // Update content
        document.querySelectorAll('.content-section').forEach(sec => {
            sec.classList.remove('active');
        });
        document.getElementById(`${section}-section`).classList.add('active');

        // Update page title
        const titles = {
            machines: 'Machine Management',
            commands: 'Execute Commands',
            python: 'Python Scripts',
            ansible: 'Ansible Playbooks',
            terraform: 'Terraform',
            docker: 'Docker Management'
        };
        document.getElementById('page-title').textContent = titles[section];

        // Update header button
        const headerActions = document.querySelector('.header-actions');
        headerActions.innerHTML = '';

        if (section === 'machines') {
            headerActions.innerHTML = `
                <button class="btn btn-primary" id="add-machine-btn">
                    <i class="fas fa-plus"></i> Add Machine
                </button>
            `;
            document.getElementById('add-machine-btn').addEventListener('click', () => {
                this.showModal('add-machine-modal');
            });

            // Load OS information for all machines (only once per session)
            this.loadAllMachineOSInfo();

            // Kick off initial sequential connectivity test only once
            this.initialSequentialPing();
        }

        // Load existing files when switching to script sections
        if (section === 'python') {
            this.loadExistingFiles('python');
        } else if (section === 'ansible') {
            this.loadExistingFiles('ansible');
        } else if (section === 'terraform') {
            this.loadExistingFiles('terraform');
        } else if (section === 'docker') {
            // Auto refresh docker overview & containers when entering section if machine selected
            const m = document.getElementById('docker-machine-select')?.value;
            if (m) {
                // Kick off parallel refreshes (non-blocking)
                this.refreshDockerInfo?.();
                this.refreshDockerImages?.();
                this.refreshDockerContainers?.();
                this.refreshDockerVolumes?.();
                this.refreshDockerNetworks?.();
            }
        }

        this.currentSection = section;

        // Dashboard reload
        if (section === 'dashboard') {
            this.loadDashboardStats();
            this.loadDashboardHistory();
            this.populateDashboardMachineFilter();
            // Update running executions count with client-side data
            this.updateRunningExecutionsDisplay();
        }
    }

    async loadMachines() {
        try {
            const response = await fetch('/api/machines');
            if (response.ok) {
                this.machines = await response.json();
                this.renderMachines();
                this.populateMachineSelects();
                // If user is currently viewing machines and first visit ping not done, trigger it now
                if (this.currentSection === 'machines') {
                    this.initialSequentialPing();
                }
            }
        } catch (error) {
            this.addLog('Failed to load machines', 'error');
        }
    }

    renderMachines() {
        const grid = document.getElementById('machines-grid');
        grid.innerHTML = '';

        this.machines.forEach(machine => {
            // Fallbacks for missing fields
            const name = machine.name || machine.host || '';
            const port = machine.port || 22;
            const authType = machine.auth_type || 'password';
            const status = machine.status === 'online' ? 'online' : 'offline';
            const statusText = machine.status ? machine.status : 'offline';

            const card = document.createElement('div');
            card.className = 'machine-card';
            card.innerHTML = `
                <div class="machine-header">
                    <div class="machine-name">${name}</div>
                    <div class="machine-status status-${status}">
                        ${statusText}
                    </div>
                </div>
                <div class="machine-info">
                    <p><strong>Host:</strong> ${machine.host}:${port}</p>
                    <p><strong>Username:</strong> ${machine.username || ''}</p>
                    <p><strong>Auth:</strong> ${authType}</p>
                    <p><strong>OS:</strong> <span id="os-info-${machine.id}" class="loading-text">Loading...</span></p>
                </div>
                <div class="machine-actions">
                    <button class="action-btn" onclick="app.testMachineConnection('${machine.id}')" title="Test Connection">
                        <i class="fas fa-plug"></i>
                    </button>
                    <button class="action-btn" onclick="app.editMachine('${machine.id}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn" onclick="app.executeMachineCommand('${machine.id}')" title="Execute Command">
                        <i class="fas fa-terminal"></i>
                    </button>
                    <button class="action-btn" onclick="app.deleteMachine('${machine.id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            grid.appendChild(card);

            // Load OS information asynchronously
            this.loadMachineOSInfo(machine.id, machine.host);
        });
    }

    async loadMachineOSInfo(machineId, machineHost) {
        const osInfoElement = document.getElementById(`os-info-${machineId}`);
        if (!osInfoElement) return;

        try {
            const response = await fetch('/api/machine/os-info', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ machine_id: machineId })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            if (data.success && data.os_info) {
                const osInfo = data.os_info;
                let osDisplay = 'None';

                // Try different fields to build a meaningful display
                if (osInfo.distribution && osInfo.distribution !== 'Unknown') {
                    osDisplay = osInfo.distribution;

                    // Add kernel/version info if available and meaningful
                    if (osInfo.kernel_version && osInfo.kernel_version !== 'Unknown') {
                        // For Windows, kernel_version might contain version info
                        if (osInfo.os_type === 'windows') {
                            // Don't repeat if distribution already contains version info
                            if (!osInfo.distribution.includes(osInfo.kernel_version)) {
                                osDisplay += ` (${osInfo.kernel_version})`;
                            }
                        } else {
                            // For Linux, show kernel version separately
                            osDisplay += ` (${osInfo.kernel_version})`;
                        }
                    }
                } else if (osInfo.os_type && osInfo.os_type !== 'Unknown') {
                    osDisplay = osInfo.os_type.charAt(0).toUpperCase() + osInfo.os_type.slice(1);
                } else if (osInfo.platform) {
                    osDisplay = osInfo.platform;
                }

                osInfoElement.textContent = osDisplay;
                osInfoElement.className = 'os-info-loaded';
                osInfoElement.title = `OS: ${osInfo.os_type || 'Unknown'}\nDistribution: ${osInfo.distribution || 'Unknown'}\nArchitecture: ${osInfo.architecture || 'Unknown'}\nMemory: ${osInfo.total_memory || 'Unknown'}`;
            } else {
                osInfoElement.textContent = 'None';
                osInfoElement.className = 'os-info-error';
                console.warn('OS info response:', data);
            }
        } catch (error) {
            console.warn(`Failed to load OS info for machine ${machineId}:`, error);
            osInfoElement.textContent = 'None';
            osInfoElement.className = 'os-info-error';
        }
    }

    loadAllMachineOSInfo() {
        // Track which machines have already been loaded to avoid repeated calls
        if (!this.osInfoLoadedMachines) {
            this.osInfoLoadedMachines = new Set();
        }

        this.machines.forEach(machine => {
            // Only load OS info if not already loaded for this machine
            if (!this.osInfoLoadedMachines.has(machine.id)) {
                this.osInfoLoadedMachines.add(machine.id);
                this.loadMachineOSInfo(machine.id, machine.host);
            }
        });
    }

    populateMachineSelects() {
        const selects = [
            'command-machine-select',
            'python-machine-select',
            'ansible-machine-select',
            'terraform-machine-select',
            'docker-machine-select'
        ];

        selects.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (!select) return;

            // Save the currently selected value using the DOM value property (most reliable)
            const prevValue = select.value || '';

            // Clear and repopulate options
            select.innerHTML = '';
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = 'Choose a machine...';
            select.appendChild(defaultOption);

            // Add Local/Localhost option for Terraform and Docker
            if (selectId === 'terraform-machine-select') {
                const localOption = document.createElement('option');
                localOption.value = 'localhost';
                localOption.textContent = 'Local (Dashboard Host)';
                select.appendChild(localOption);
            } else if (selectId === 'docker-machine-select') {
                const localhostOption = document.createElement('option');
                localhostOption.value = 'localhost';
                localhostOption.textContent = 'Localhost (Dashboard Host)';
                select.appendChild(localhostOption);
            }

            this.machines.forEach(machine => {
                const option = document.createElement('option');
                option.value = machine.id;
                option.textContent = `${machine.name} (${machine.host})`;
                select.appendChild(option);
            });

            // Restore previous selection if the machine still exists or is 'local'/'localhost'
            if (selectId === 'terraform-machine-select' && (!prevValue || prevValue === 'local' || prevValue === 'localhost')) {
                // Default to Local/localhost for Terraform
                select.value = 'localhost';
            } else if (selectId === 'docker-machine-select' && prevValue === 'localhost') {
                // Only restore localhost for Docker if it was previously selected
                select.value = 'localhost';
            } else if (prevValue && (prevValue === 'local' || prevValue === 'localhost' || this.machines.some(m => m.id === prevValue))) {
                select.value = prevValue;
            } else {
                // Set to default based on type
                if (selectId === 'terraform-machine-select') {
                    select.value = 'localhost';
                } else if (selectId === 'docker-machine-select') {
                    // Keep default "Choose a machine..." option for Docker
                    select.value = '';
                } else {
                    select.value = '';
                }
            }
        });

        // Trigger initial overviews if already selected
        const tfSelect = document.getElementById('terraform-machine-select');
        if (tfSelect && tfSelect.value === 'localhost') {
            this.refreshTerraformOverview();
        }
        const dkSelect = document.getElementById('docker-machine-select');
        if (dkSelect && dkSelect.value === 'localhost') {
            this.refreshDockerInfo();
        }
    }

    /**
     * Initialize Add Machine modal controls (cancel button)
     */
    initAddMachineModal() {
        const cancelBtn = document.getElementById('cancel-machine-btn');
        if (cancelBtn && !cancelBtn._bound) {
            cancelBtn.addEventListener('click', (e) => {
                e.preventDefault();
                // Reset form fields
                const form = document.getElementById('add-machine-form');
                if (form) form.reset();
                // Clear id & key path
                const idEl = document.getElementById('machine-id');
                if (idEl) idEl.value = '';
                const keyEl = document.getElementById('machine-key');
                if (keyEl) keyEl.value = '';
                const clearKeyBtn = document.getElementById('clear-key-btn');
                if (clearKeyBtn) clearKeyBtn.style.display = 'none';
                // Reset auth selection to password and hide key group
                const authSelect = document.getElementById('machine-auth-type');
                const keyGroup = document.getElementById('key-group');
                const passwordGroup = document.getElementById('password-group');
                if (authSelect) authSelect.value = 'password';
                if (keyGroup) keyGroup.classList.add('hidden');
                if (passwordGroup) passwordGroup.classList.remove('hidden');
                this.hideModal('add-machine-modal');
            });
            cancelBtn._bound = true;
        }
    }

    async saveMachine() {
        const formData = {
            id: document.getElementById('machine-id').value,
            name: document.getElementById('machine-name').value,
            host: document.getElementById('machine-host').value.trim(),
            port: document.getElementById('machine-port').value,
            username: document.getElementById('machine-username').value.trim(),
            auth_type: document.getElementById('machine-auth-type').value,
            password: document.getElementById('machine-password').value,
            key_path: document.getElementById('machine-key').value
        };

        if (!formData.name || !formData.host || !formData.username) {
            alert('Please fill in all required fields');
            return;
        }

        // Only check for duplicates if adding a new machine (no id)
        if (!formData.id) {
            const duplicate = this.machines.find(m =>
                m.host.trim().toLowerCase() === formData.host.toLowerCase() &&
                m.username.trim().toLowerCase() === formData.username.toLowerCase()
            );
            if (duplicate) {
                alert('Machine with the same host and username already exists.');
                return;
            }
        }

        // Show generic loading for machine save (previously referenced undefined 'mode')
        this.showLoading('generic', formData.id ? 'Updating Machine' : 'Adding Machine');

        try {
            const method = formData.id ? 'PUT' : 'POST';
            const url = formData.id ? `/api/machines/${formData.id}` : '/api/machines';

            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                // Fetch the updated list of machines from the backend
                await this.loadMachines();

                const result = await response.json();
                const machine = result.machine ? result.machine : result;

                if (method === 'POST') {
                    this.addLog(`Machine ${machine.name} added successfully`, 'success');
                } else {
                    this.addLog(`Machine ${machine.name} updated successfully`, 'success');
                }

                this.hideModal('add-machine-modal');
            } else {
                const error = await response.json();
                alert(`Error: ${error.message}`);
            }
        } catch (error) {
            alert('Failed to save machine');
            this.addLog('Failed to save machine', 'error');
        } finally {
            this.hideLoading();
        }
    }

    executeMachineCommand(machineId) {
        const select = document.getElementById('command-machine-select');
        if (select) {
            select.value = machineId;
        }
        this.switchSection('commands');
        const cmdInput = document.getElementById('command-input');
        if (cmdInput) {
            cmdInput.focus();
        }
    }

    async testConnection() {
        // Use the selected machine from the machines list, not the modal form
        let machineId = document.getElementById('machine-id')?.value;
        // If not present, try to get from the select dropdown (for add)
        if (!machineId) {
            const select = document.getElementById('command-machine-select');
            if (select) machineId = select.value;
        }
        if (!machineId) {
            alert('No machine selected for connection test');
            return;
        }
        this.showLoading('generic', 'Testing Connection');
        try {
            const response = await fetch('/api/test-connection', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ machine_id: machineId })
            });
            // Accept both 200 and 404 as valid responses to parse JSON
            let result = {};
            try {
                result = await response.json();
            } catch (e) { }
            if (response.ok && result.success) {
                alert('Connection successful!');
                this.addLog('Connection test successful', 'success');
            } else {
                alert(`Connection failed: ${result.message || 'Unknown error'}`);
                this.addLog('Connection test failed: ' + (result.message || 'Unknown error'), 'error');
            }
        } catch (error) {
            alert('Connection test failed');
            this.addLog('Connection test failed', 'error');
        } finally {
            this.hideLoading();
        }
    }

    toggleAuthType(authType) {
        const passwordGroup = document.getElementById('password-group');
        const keyGroup = document.getElementById('key-group');

        if (authType === 'password') {
            passwordGroup.classList.remove('hidden');
            keyGroup.classList.add('hidden');
        } else {
            passwordGroup.classList.add('hidden');
            keyGroup.classList.remove('hidden');
        }
    }

    async uploadSSHKeyFile(file) {
        if (!file) return null;
        try {
            const formData = new FormData();
            formData.append('key_file', file);
            this.showLoading('generic', 'Uploading SSH key');
            const res = await fetch('/api/upload-key', { method: 'POST', body: formData });
            const data = await res.json();
            if (res.ok && data.success) {
                document.getElementById('machine-key').value = data.path;
                this.addLog('SSH key uploaded and stored securely', 'success');
                const clearBtn = document.getElementById('clear-key-btn');
                if (clearBtn) clearBtn.style.display = 'inline-flex';
                return data.path;
            } else {
                this.addLog('SSH key upload failed: ' + (data.error || 'Unknown error'), 'error');
                alert('Key upload failed: ' + (data.error || 'Unknown error'));
            }
        } catch (e) {
            this.addLog('SSH key upload exception: ' + e.message, 'error');
            alert('SSH key upload error: ' + e.message);
        } finally {
            this.hideLoading();
        }
        return null;
    }

    async executeCommand() {
        const machineId = document.getElementById('command-machine-select').value;
        const command = document.getElementById('command-input').value;
        const timeout = document.getElementById('command-timeout').value;

        if (!machineId || !command) {
            alert('Please select a machine and enter a command');
            return;
        }

        try {
            const response = await fetch('/api/execute-command', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    machine_id: machineId,
                    command: command,
                    timeout: parseInt(timeout)
                })
            });

            const result = await response.json();

            if (result.success) {
                this.addLog(`Command execution started: ${result.execution_id}`, 'info');
                // No need to show loading overlay - execution runs in background
            } else {
                this.addLog(`Failed to start command execution: ${result.message}`, 'error');
            }
        } catch (error) {
            this.addLog('Failed to start command execution', 'error');
        }
    }

    clearCommand() {
        document.getElementById('command-input').value = '';
        document.getElementById('command-machine-select').value = '';
        document.getElementById('command-timeout').value = '30';
    }

    async runPythonScript() {
        const machineId = document.getElementById('python-machine-select').value;

        if (!machineId) {
            alert('Please select a machine');
            return;
        }

        const activeTab = document.querySelector('#python-section .tab-btn.active').dataset.tab;
        let scriptContent = '';
        let filename = '';
        let timeout = 60; // Default timeout

        if (activeTab === 'editor') {
            scriptContent = document.getElementById('python-editor').value;
            filename = document.getElementById('python-filename').value || 'script.py';

            // Get timeout value from input
            const timeoutInput = document.getElementById('python-timeout');
            if (timeoutInput && timeoutInput.value) {
                timeout = parseInt(timeoutInput.value) || 60;
            }
        } else if (activeTab === 'upload') {
            const fileInput = document.getElementById('python-file-input');
            if (fileInput.files.length === 0) {
                alert('Please upload a Python file');
                return;
            }
        }

        if (!scriptContent && activeTab === 'editor') {
            alert('Please enter a Python script');
            return;
        }

        try {
            const response = await fetch('/api/run-python', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    machine_id: machineId,
                    script_content: scriptContent,
                    filename: filename,
                    timeout: timeout
                })
            });

            const result = await response.json();

            if (result.success) {
                this.addLog(`Python script execution started: ${result.execution_id} (timeout: ${timeout}s)`, 'info');
                // No need to show loading overlay - execution runs in background
            } else {
                this.addLog(`Failed to start Python script execution: ${result.message}`, 'error');
            }
        } catch (error) {
            this.addLog('Failed to start Python script execution', 'error');
        }
    }

    async savePythonScript() {
        const scriptContent = document.getElementById('python-editor').value;
        const filename = document.getElementById('python-filename').value;

        if (!scriptContent || !filename) {
            alert('Please enter script content and filename');
            return;
        }

        try {
            let response;

            // Check if we're editing a directory file
            if (this.editingContext && this.editingContext.isDirectoryFile && this.editingContext.type === 'python') {
                // Save to directory using directory API
                const { directory } = this.editingContext;
                response = await fetch(`/api/directories/python/${directory}/files/${filename}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ content: scriptContent })
                });

                if (response.ok) {
                    this.addLog(`Python script saved to directory '${directory}': ${filename}`, 'success');
                    // Update editing context
                    this.editingContext.originalContent = scriptContent;
                    this.updateTabName('python-tab-name', `${filename} (saved)`);
                    // Refresh directory contents
                    this.loadDirectoryContents('python', directory);
                } else {
                    const error = await response.json();
                    alert(`Failed to save to directory: ${error.error}`);
                }
            } else {
                // Save as regular script file
                response = await fetch('/api/save-script', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        type: 'python',
                        filename: filename,
                        content: scriptContent
                    })
                });

                if (response.ok) {
                    this.addLog(`Python script saved: ${filename}`, 'success');
                    this.loadExistingFiles('python');
                } else {
                    const error = await response.json();
                    alert(`Failed to save script: ${error.error}`);
                }
            }
        } catch (error) {
            this.addLog('Failed to save Python script: ' + (error.message || error), 'error');
            alert('Failed to save Python script: ' + (error.message || error));
        }
    }

    clearPython() {
        document.getElementById('python-editor').value = '';
        document.getElementById('python-filename').value = '';
        document.getElementById('python-machine-select').value = '';
        document.getElementById('python-file-input').value = '';
        this.updateLineNumbers('python-editor');
        this.updateTabName('python-tab-name', 'script.py');
    }

    async saveAnsibleScript() {
        const scriptContent = document.getElementById('ansible-editor').value;
        const filename = document.getElementById('ansible-filename').value;

        if (!scriptContent || !filename) {
            alert('Please enter script content and filename');
            return;
        }

        try {
            let response;

            // Check if we're editing a directory file
            if (this.editingContext && this.editingContext.isDirectoryFile && this.editingContext.type === 'ansible') {
                // Save to directory using directory API
                const { directory } = this.editingContext;
                response = await fetch(`/api/directories/ansible/${directory}/files/${filename}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ content: scriptContent })
                });

                if (response.ok) {
                    this.addLog(`Ansible script saved to directory '${directory}': ${filename}`, 'success');
                    // Update editing context
                    this.editingContext.originalContent = scriptContent;
                    this.updateTabName('ansible-tab-name', `${filename} (saved)`);
                    // Refresh directory contents
                    this.loadDirectoryContents('ansible', directory);
                } else {
                    const error = await response.json();
                    alert(`Failed to save to directory: ${error.error}`);
                }
            } else {
                // Save as regular script file
                response = await fetch('/api/save-script', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        type: 'ansible',
                        filename: filename,
                        content: scriptContent
                    })
                });

                if (response.ok) {
                    this.addLog(`Ansible script saved: ${filename}`, 'success');
                    this.loadExistingFiles('ansible');
                } else {
                    const error = await response.json();
                    alert(`Failed to save script: ${error.error}`);
                }
            }
        } catch (error) {
            this.addLog('Failed to save Ansible script: ' + (error.message || error), 'error');
            alert('Failed to save Ansible script: ' + (error.message || error));
        }
    }

    async runAnsible() {
        const machineId = document.getElementById('ansible-machine-select').value;

        if (!machineId) {
            alert('Please select a machine');
            return;
        }

        // Determine mode based on active main tab instead of mode buttons
        const activeMainTab = document.querySelector('#ansible-section .tab-btn.active').dataset.tab;
        const mode = activeMainTab === 'adhoc-ansible' ? 'adhoc' : 'playbook';
        let payload = { machine_id: machineId, mode: mode };

        if (mode === 'adhoc') {
            payload.module = document.getElementById('ansible-module').value;
            payload.args = document.getElementById('ansible-args').value;
            payload.become = document.getElementById('ansible-adhoc-become').checked;
        } else {
            const scriptContent = document.getElementById('ansible-editor').value;
            const filename = document.getElementById('ansible-filename').value || 'playbook.yml';
            payload.script_content = scriptContent;
            payload.filename = filename;

            // Check which playbook tab is active and get the become checkbox accordingly
            const activeTab = document.querySelector('.upload-tabs .tab-btn.active').dataset.tab;
            if (activeTab === 'upload-ansible') {
                payload.become = document.getElementById('ansible-upload-become').checked;
            } else if (activeTab === 'editor-ansible') {
                payload.become = document.getElementById('ansible-editor-become').checked;
            } else {
                payload.become = false; // Default for other tabs
            }
        }

        this.startExecution(`ansible-${mode}`);
        this.showLoading('ansible', mode === 'adhoc' ? 'Running Ansible Ad-hoc' : 'Running Ansible Playbook');
        try {
            const response = await fetch('/api/run-ansible', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (result.success) {
                this.addLog(`Ansible ${mode} finished with status: ${result.status}`, 'success');
                if (result.output) {
                    const formatted = typeof result.output === 'string' ? result.output : JSON.stringify(result.output, null, 2);
                    this.addLog(`Output:\n${formatted}`, 'info');
                }
                if (result.errors) {
                    this.addLog(`Errors:\n${result.errors}`, 'error');
                }
                this.endExecution(!result.errors);
            } else {
                const errMsg = result.errors || result.message || 'Unknown error';
                this.addLog(`Ansible ${mode} failed: ${errMsg}`, 'error');
                alert('Failed to run Ansible: ' + errMsg);
                this.endExecution(false);
            }
        } catch (error) {
            this.addLog('Failed to run Ansible: ' + (error.message || error), 'error');
            alert('Failed to run Ansible: ' + (error.message || error));
            this.endExecution(false);
        } finally {
            this.hideLoading();
        }
    }

    async runTerraform(action) {
        let machineId = document.getElementById('terraform-machine-select').value;
        if (machineId === 'local') {
            machineId = 'localhost';
            document.getElementById('terraform-machine-select').value = 'localhost';
        }

        if (!machineId) {
            alert('Please select a machine (used for tracking purposes - Terraform runs locally)');
            return;
        }

        const scriptContent = document.getElementById('terraform-editor').value;
        const filename = document.getElementById('terraform-filename').value || 'main.tf';

        // Validate that we have content for non-init actions
        if (action !== 'init' && !scriptContent.trim()) {
            alert('Please enter Terraform configuration content before running ' + action);
            return;
        }

        this.startExecution(`terraform-${action}`);
        this.showLoading('terraform', `Terraform ${action} in progress`);
        try {
            const payload = {
                machine_id: machineId || 'localhost',
                action: action,
                filename: filename
            };

            // Only include script content for non-init actions or when we have content
            if (scriptContent.trim()) {
                payload.script_content = scriptContent;
            }

            const response = await fetch('/api/run-terraform', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (result.success) {
                this.addLog(`Terraform ${action} executed successfully on dashboard host`, 'success');

                // Display the actual output from Terraform
                if (result.output) {
                    // Format the output for better readability
                    const formattedOutput = result.output.replace(/\n/g, '\n    ');
                    this.addLog(`Terraform Output:\n    ${formattedOutput}`, 'info');
                }

                // Show appropriate success messages based on action
                if (action === 'init') {
                    this.addLog('✓ Terraform has been initialized locally. You can now run plan and apply.', 'success');
                } else if (action === 'plan') {
                    this.addLog('✓ Terraform plan completed locally. Review the changes above before applying.', 'success');
                } else if (action === 'apply') {
                    this.addLog('✓ Terraform apply completed locally. Infrastructure changes have been applied.', 'success');
                }

                // Refresh dashboard stats after successful execution
                if (this.currentSection === 'dashboard') {
                    this.loadDashboardStats();
                    this.loadDashboardHistory();
                }
                this.endExecution(true);
            } else {
                this.addLog(`Terraform ${action} failed: ${result.message || 'Unknown error'}`, 'error');

                // Display error output if available
                if (result.output) {
                    const formattedOutput = result.output.replace(/\n/g, '\n    ');
                    this.addLog(`Error Details:\n    ${formattedOutput}`, 'error');
                }

                alert('Failed to run Terraform ' + action + ': ' + (result.message || 'Unknown error'));
                this.endExecution(false);
            }
        } catch (error) {
            this.addLog('Failed to run Terraform: ' + (error.message || error), 'error');
            alert('Failed to run Terraform: ' + (error.message || error));
            this.endExecution(false);
        } finally {
            this.hideLoading();
        }
    }

    async saveTerraformScript() {
        const scriptContent = document.getElementById('terraform-editor').value;
        const filename = document.getElementById('terraform-filename').value;

        if (!scriptContent || !filename) {
            alert('Please enter script content and filename');
            return;
        }

        try {
            let response;

            // Check if we're editing a directory file
            if (this.editingContext && this.editingContext.isDirectoryFile && this.editingContext.type === 'terraform') {
                // Save to directory using directory API
                const { directory } = this.editingContext;
                response = await fetch(`/api/directories/terraform/${directory}/files/${filename}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ content: scriptContent })
                });

                if (response.ok) {
                    this.addLog(`Terraform script saved to directory '${directory}': ${filename}`, 'success');
                    // Update editing context
                    this.editingContext.originalContent = scriptContent;
                    this.updateTabName('terraform-tab-name', `${filename} (saved)`);
                    // Refresh directory contents
                    this.loadDirectoryContents('terraform', directory);
                } else {
                    const error = await response.json();
                    alert(`Failed to save to directory: ${error.error}`);
                }
            } else {
                // Save as regular script file
                response = await fetch('/api/save-script', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        type: 'terraform',
                        filename: filename,
                        content: scriptContent
                    })
                });

                if (response.ok) {
                    this.addLog(`Terraform script saved: ${filename}`, 'success');
                    this.loadExistingFiles('terraform');
                } else {
                    const error = await response.json();
                    alert(`Failed to save script: ${error.error}`);
                }
            }
        } catch (error) {
            this.addLog('Failed to save Terraform script: ' + (error.message || error), 'error');
            alert('Failed to save Terraform script: ' + (error.message || error));
        }
    }

    async saveDockerScript() {
        const scriptContent = document.getElementById('docker-editor').value;
        const filename = document.getElementById('docker-filename').value;

        if (!scriptContent || !filename) {
            alert('Please enter script content and filename');
            return;
        }

        try {
            let response;

            // Check if we're editing a directory file
            if (this.editingContext && this.editingContext.isDirectoryFile && this.editingContext.type === 'docker') {
                // Save to directory using directory API
                const { directory } = this.editingContext;
                response = await fetch(`/api/directories/docker/${directory}/files/${filename}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ content: scriptContent })
                });

                if (response.ok) {
                    this.addLog(`Docker script saved to directory '${directory}': ${filename}`, 'success');
                    // Update editing context
                    this.editingContext.originalContent = scriptContent;
                    this.updateTabName('docker-tab-name', `${filename} (saved)`);
                    // Refresh directory contents
                    this.loadDirectoryContents('docker', directory);
                } else {
                    const error = await response.json();
                    alert(`Failed to save to directory: ${error.error}`);
                }
            } else {
                // Save as regular script file
                response = await fetch('/api/save-script', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        type: 'docker',
                        filename: filename,
                        content: scriptContent
                    })
                });

                if (response.ok) {
                    this.addLog(`Docker script saved: ${filename}`, 'success');
                    this.loadExistingFiles('docker');
                } else {
                    const error = await response.json();
                    alert(`Failed to save script: ${error.error}`);
                }
            }
        } catch (error) {
            this.addLog('Failed to save Docker script: ' + (error.message || error), 'error');
            alert('Failed to save Docker script: ' + (error.message || error));
        }
    }

    clearAnsible() {
        // Clear playbook editor fields
        document.getElementById('ansible-editor').value = '';
        document.getElementById('ansible-filename').value = '';
        document.getElementById('ansible-machine-select').value = '';
        document.getElementById('ansible-file-input').value = '';
        this.updateLineNumbers('ansible-editor');
        this.updateTabName('ansible-tab-name', 'playbook.yml');

        // Clear ad-hoc command fields
        document.getElementById('ansible-module').value = '';
        document.getElementById('ansible-args').value = '';

        // Clear all become checkboxes
        document.getElementById('ansible-adhoc-become').checked = false;
        document.getElementById('ansible-upload-become').checked = false;
        document.getElementById('ansible-editor-become').checked = false;

        // Clear privilege control visual states
        const privilegeControls = [
            'ansible-adhoc-privilege-control',
            'ansible-upload-privilege-control',
            'ansible-editor-privilege-control'
        ];
        privilegeControls.forEach(controlId => {
            const control = document.getElementById(controlId);
            if (control) {
                this.updatePrivilegeControlState(control, false);
            }
        });
    }

    clearTerraform() {
        document.getElementById('terraform-editor').value = '';
        document.getElementById('terraform-filename').value = '';
        document.getElementById('terraform-machine-select').value = '';
        document.getElementById('terraform-file-input').value = '';
        this.updateLineNumbers('terraform-editor');
        this.updateTabName('terraform-tab-name', 'main.tf');
    }

    clearDocker() {
        document.getElementById('docker-editor').value = '';
        document.getElementById('docker-filename').value = '';
        this.updateLineNumbers('docker-editor');
        this.updateTabName('docker-tab-name', 'docker-compose.yml');
    }

    async runDockerScript() {
        const scriptContent = document.getElementById('docker-editor').value.trim();
        const machineId = document.getElementById('docker-machine-select').value;

        if (!scriptContent) {
            alert('Please enter Docker content in the editor');
            return;
        }

        if (!machineId) {
            alert('Please select a machine');
            return;
        }

        try {
            this.startExecution('docker_editor');
            this.showLoading();

            const response = await fetch('/api/docker/compose/up', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    machine_id: machineId,
                    compose_content: scriptContent,
                    detach: true,
                    build: false
                })
            });

            const result = await response.json();

            this.displayOutput('logs-content', {
                success: result.success,
                output: `Docker Execution Result:\n\n${result.output}`,
                error: result.errors
            });

            if (result.success) {
                this.addLog(`✅ Docker script executed successfully`, 'success');
            } else {
                this.addLog(`❌ Failed to run Docker script: ${result.errors || result.error}`, 'error');
            }
        } catch (error) {
            this.addLog(`Error running Docker script: ${error.message}`, 'error');
        } finally {
            this.endExecution(true);
            this.hideLoading();
        }
    }

    handleFileUpload(files, acceptedTypes) {
        files.forEach(file => {
            const extension = '.' + file.name.split('.').pop().toLowerCase();

            if (acceptedTypes.includes(extension)) {
                this.addLog(`File uploaded: ${file.name}`, 'success');

                // Read file content and load into editor
                const reader = new FileReader();
                reader.onload = (e) => {
                    const content = e.target.result;

                    if (extension === '.py') {
                        document.getElementById('python-editor').value = content;
                        document.getElementById('python-filename').value = file.name;
                        this.updateLineNumbers('python-editor');
                        this.updateTabName('python-tab-name', file.name);
                        // Switch to editor tab
                        document.querySelector('[data-tab="editor"]').click();
                    } else if (extension === '.yml' || extension === '.yaml') {
                        // Check if it's a docker-compose file
                        const isDockerCompose = file.name.toLowerCase().includes('docker-compose') ||
                            file.name.toLowerCase().includes('compose');

                        if (isDockerCompose) {
                            document.getElementById('docker-editor').value = content;
                            document.getElementById('docker-filename').value = file.name;
                            this.updateLineNumbers('docker-editor');
                            this.updateTabName('docker-tab-name', file.name);
                            // Switch to docker editor tab
                            document.querySelector('[data-tab="editor-docker"]').click();
                        } else {
                            document.getElementById('ansible-editor').value = content;
                            document.getElementById('ansible-filename').value = file.name;
                            this.updateLineNumbers('ansible-editor');
                            this.updateTabName('ansible-tab-name', file.name);
                            // Switch to editor tab
                            document.querySelector('[data-tab="editor-ansible"]').click();
                        }
                    } else if (extension === '.tf' || extension === '.tfvars') {
                        document.getElementById('terraform-editor').value = content;
                        document.getElementById('terraform-filename').value = file.name;
                        this.updateLineNumbers('terraform-editor');
                        this.updateTabName('terraform-tab-name', file.name);
                        // Switch to editor tab
                        document.querySelector('[data-tab="editor-tf"]').click();
                    } else if (file.name.toLowerCase().match(/^dockerfile/i) ||
                        file.name.toLowerCase().includes('dockerfile')) {
                        // Handle Dockerfile
                        document.getElementById('docker-editor').value = content;
                        document.getElementById('docker-filename').value = file.name;
                        this.updateLineNumbers('docker-editor');
                        this.updateTabName('docker-tab-name', file.name);
                        // Switch to docker editor tab
                        document.querySelector('[data-tab="editor-docker"]').click();
                    }
                };
                reader.readAsText(file);
            } else {
                this.addLog(`Invalid file type: ${file.name}`, 'warning');
            }
        });
    }

    async loadExistingFiles(type) {
        try {
            console.log(`Loading existing ${type} files...`);
            const response = await fetch(`/api/files/${type}`);
            if (response.ok) {
                const files = await response.json();
                console.log(`Loaded ${files.length} ${type} files:`, files);
                this.renderFileList(files, type);
            } else {
                console.error(`Failed to load ${type} files, status:`, response.status);
                this.addLog(`Failed to load ${type} files (status: ${response.status})`, 'error');
            }
        } catch (error) {
            console.error(`Error loading ${type} files:`, error);
            this.addLog(`Failed to load ${type} files: ${error.message}`, 'error');
        }
    }

    renderFileList(files, type) {
        const listId = `${type}-file-list`;
        const list = document.getElementById(listId);
        if (!list) return;
        list.innerHTML = '';
        if (!Array.isArray(files) || files.length === 0) {
            list.innerHTML = '<li class="empty">No files found</li>';
            return;
        }
        files.forEach(file => {
            // file: { filename }
            const li = document.createElement('li');
            li.className = 'file-item';

            // Create file info container
            const fileInfo = document.createElement('div');
            fileInfo.className = 'file-info';
            fileInfo.textContent = file.filename;
            fileInfo.title = file.filename;
            fileInfo.addEventListener('click', () => this.loadFile(file.filename, type));

            // Create action buttons container
            const actionButtons = document.createElement('div');
            actionButtons.className = 'file-actions';

            // Edit button
            const editBtn = document.createElement('button');
            editBtn.className = 'edit-file-btn';
            editBtn.innerHTML = '<i class="fas fa-edit"></i>';
            editBtn.title = 'Edit file';
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.editSavedFile(file.filename, type);
            });
            actionButtons.appendChild(editBtn);

            // Rename button
            const renameBtn = document.createElement('button');
            renameBtn.className = 'rename-file-btn';
            renameBtn.innerHTML = '<i class="fas fa-tag"></i>';
            renameBtn.title = 'Rename file';
            renameBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showRenameSavedFileDialog(file.filename, type);
            });
            actionButtons.appendChild(renameBtn);

            // Delete button
            const delBtn = document.createElement('button');
            delBtn.className = 'delete-file-btn';
            delBtn.innerHTML = '<i class="fas fa-trash"></i>';
            delBtn.title = 'Delete file';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteFile(file.filename, type);
            });
            actionButtons.appendChild(delBtn);

            li.appendChild(fileInfo);
            li.appendChild(actionButtons);
            list.appendChild(li);
        });
    }

    async loadFile(fileId, type) {
        try {
            const response = await fetch(`/api/files/${type}/${fileId}`);
            if (response.ok) {
                const data = await response.json();

                if (type === 'python') {
                    document.getElementById('python-editor').value = data.content;
                    document.getElementById('python-filename').value = data.name;
                    this.updateLineNumbers('python-editor');
                    this.updateTabName('python-tab-name', data.name);
                    document.querySelector('[data-tab="editor"]').click();
                } else if (type === 'ansible') {
                    document.getElementById('ansible-editor').value = data.content;
                    document.getElementById('ansible-filename').value = data.name;
                    this.updateLineNumbers('ansible-editor');
                    this.updateTabName('ansible-tab-name', data.name);
                    document.querySelector('[data-tab="editor-ansible"]').click();
                } else if (type === 'terraform') {
                    document.getElementById('terraform-editor').value = data.content;
                    document.getElementById('terraform-filename').value = data.name;
                    this.updateLineNumbers('terraform-editor');
                    this.updateTabName('terraform-tab-name', data.name);
                    document.querySelector('[data-tab="editor-tf"]').click();
                } else if (type === 'docker') {
                    document.getElementById('docker-editor').value = data.content;
                    document.getElementById('docker-filename').value = data.name;
                    this.updateLineNumbers('docker-editor');
                    this.updateTabName('docker-tab-name', data.name);
                    document.querySelector('[data-tab="editor-docker"]').click();
                }

                this.addLog(`File loaded: ${data.name}`, 'success');
            } else {
                this.addLog(`Failed to load ${type} file`, 'error');
            }
        } catch (error) {
            this.addLog(`Failed to load ${type} file`, 'error');
        }
    }

    async deleteFile(fileId, type) {
        if (!confirm(`Are you sure you want to delete this ${type} file?`)) return;
        try {
            const response = await fetch(`/api/files/${type}/${fileId}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                this.addLog(`Deleted ${type} file: ${fileId}`, 'success');
                this.loadExistingFiles(type);
            } else {
                this.addLog(`Failed to delete ${type} file`, 'error');
            }
        } catch (error) {
            this.addLog(`Failed to delete ${type} file`, 'error');
        }
    }

    async editSavedFile(filename, type) {
        try {
            // Load file content for editing
            const response = await fetch(`/api/files/${type}/${filename}`);
            if (!response.ok) {
                const error = await response.json();
                alert(`Failed to load file: ${error.error}`);
                return;
            }

            const fileData = await response.json();

            // Switch to the appropriate section and load content into editor
            this.switchSection(type);

            // Set the content in the editor
            const editorId = `${type}-editor`;
            const filenameInput = `${type}-filename`;
            const editor = document.getElementById(editorId);
            const filenameInputElement = document.getElementById(filenameInput);

            if (editor) {
                editor.value = fileData.content;
                this.updateLineNumbers(editorId);
                this.autoResizeEditor(editorId);
            }

            if (filenameInputElement) {
                filenameInputElement.value = fileData.name;
            }

            // Update tab name to show we're editing a file
            const tabNameId = `${type}-tab-name`;
            this.updateTabName(tabNameId, `${filename} (editing)`);

            // Store editing context for saved files
            this.savedFileEditingContext = {
                type: type,
                filename: filename,
                originalContent: fileData.content
            };

            // Add save button specifically for editing saved files
            this.showSavedFileEditingSaveButton(type);

            // Switch to editor tab
            const editorTabSelector = type === 'python' ? '[data-tab="editor"]' :
                type === 'ansible' ? '[data-tab="editor-ansible"]' :
                    '[data-tab="editor-tf"]';
            const editorTab = document.querySelector(editorTabSelector);
            if (editorTab) {
                editorTab.click();
            }

            this.addLog(`Loaded '${filename}' for editing`, 'info');
        } catch (error) {
            this.addLog(`Error loading file for editing: ${error.message}`, 'error');
        }
    }

    showSavedFileEditingSaveButton(type) {
        // Add a special save button for editing saved files
        const actionsContainer = document.querySelector(`#${type}-section .form-actions`);
        if (actionsContainer && !document.getElementById(`save-editing-saved-${type}-btn`)) {
            const saveEditingBtn = document.createElement('button');
            saveEditingBtn.className = 'btn btn-success';
            saveEditingBtn.id = `save-editing-saved-${type}-btn`;
            saveEditingBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes to File';
            saveEditingBtn.onclick = () => this.saveSavedFileEdits();

            // Insert at the beginning
            actionsContainer.insertBefore(saveEditingBtn, actionsContainer.firstChild);
        }
    }

    async saveSavedFileEdits() {
        if (!this.savedFileEditingContext) {
            alert('No saved file is currently being edited');
            return;
        }

        const { type, filename } = this.savedFileEditingContext;
        const editorId = `${type}-editor`;
        const editor = document.getElementById(editorId);
        const newContent = editor.value;

        try {
            const response = await fetch(`/api/files/${type}/${filename}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ content: newContent })
            });

            if (response.ok) {
                this.addLog(`File '${filename}' saved successfully`, 'success');
                this.savedFileEditingContext.originalContent = newContent;
                this.updateTabName(`${type}-tab-name`, `${filename} (saved)`);

                // Remove the editing save button
                const saveEditingBtn = document.getElementById(`save-editing-saved-${type}-btn`);
                if (saveEditingBtn) {
                    saveEditingBtn.remove();
                }

                // Clear editing context
                this.savedFileEditingContext = null;

                // Refresh file list
                this.loadExistingFiles(type);
            } else {
                const error = await response.json();
                alert(`Failed to save file: ${error.error}`);
            }
        } catch (error) {
            this.addLog(`Error saving file: ${error.message}`, 'error');
        }
    }

    showRenameSavedFileDialog(filename, type) {
        const newName = prompt(`Rename file '${filename}' to:`, filename);

        if (newName && newName.trim() && newName.trim() !== filename) {
            this.renameSavedFile(filename, type, newName.trim());
        }
    }

    async renameSavedFile(oldName, type, newName) {
        try {
            const response = await fetch(`/api/files/${type}/${oldName}/rename`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ new_name: newName })
            });

            if (response.ok) {
                const result = await response.json();
                this.addLog(`File renamed from '${oldName}' to '${newName}'`, 'success');
                this.loadExistingFiles(type);
            } else {
                const error = await response.json();
                alert(`Failed to rename file: ${error.error}`);
            }
        } catch (error) {
            this.addLog(`Error renaming file: ${error.message}`, 'error');
        }
    }

    addLog(message, level = 'info') {
        const timestamp = new Date().toLocaleString();
        // If message is an object, pretty print it
        let displayMessage = message;
        if (typeof message === 'object') {
            try {
                displayMessage = JSON.stringify(message, null, 2);
            } catch (e) {
                displayMessage = String(message);
            }
        }
        const logEntry = { timestamp, level, message: displayMessage };
        this.logs.push(logEntry);

        const logsContent = document.getElementById('logs-content');
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.innerHTML = `
            <span class="log-timestamp">[${timestamp}]</span>
            <span class="log-level ${level}">${level.toUpperCase()}</span>
            <span class="log-message">${displayMessage}</span>
        `;

        logsContent.appendChild(entry);
        logsContent.scrollTop = logsContent.scrollHeight;

        // Keep only last 1000 log entries
        if (this.logs.length > 1000) {
            this.logs = this.logs.slice(-1000);
            // Optionally clear old DOM entries if needed
        }
    }

    clearLogs() {
        this.logs = [];
        document.getElementById('logs-content').innerHTML = '';
        this.addLog('Logs cleared', 'info');
    }

    showModal(modalId) {
        document.getElementById(modalId).classList.add('show');
    }

    hideModal(modalId) {
        document.getElementById(modalId).classList.remove('show');

        if (modalId === 'add-machine-modal') {
            document.getElementById('add-machine-form').reset();
            document.getElementById('machine-port').value = '22';
            document.getElementById('machine-id').value = '';
            this.toggleAuthType('password');
        }
    }

    showLoading() {
        // Deprecated full-screen overlay hidden in favor of compact indicator
        // Support optional arguments: (category, title)
        const category = arguments[0] && typeof arguments[0] === 'string' ? arguments[0] : 'generic';
        const title = arguments[1] && typeof arguments[1] === 'string' ? arguments[1] : 'Processing';
        if (!this._activityStack) this._activityStack = [];
        if (typeof this._incrementActivity === 'function') {
            const opId = this._incrementActivity(category, { title });
            this._activityStack.push(opId);
        }
    }

    hideLoading() {
        const success = arguments.length ? !!arguments[0] : true;
        if (this._activityStack && this._activityStack.length && typeof this._decrementActivity === 'function') {
            const opId = this._activityStack.pop();
            this._decrementActivity(opId, success);
        } else if (typeof this._decrementActivity === 'function') {
            this._decrementActivity(undefined, success);
        }
    }

    // Machine-specific actions
    async testMachineConnection(machineId) {
        // Fix: Always use the correct endpoint and pass the machineId
        if (!machineId) {
            alert('No machine selected for connection test');
            return;
        }
        this.showLoading();
        const machine = this.machines.find(m => m.id === machineId);
        if (!machine) {
            this.addLog('Machine not found', 'error');
            this.hideLoading();
            return;
        }
        this.addLog(`Testing connection to ${machine.name || machine.host}`, 'info');
        try {
            const response = await fetch('/api/test-connection', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ machine_id: machineId })
            });
            let result = {};
            try {
                result = await response.json();
            } catch (e) { }
            if (response.ok && result.success) {
                this.addLog(`Connection to ${machine.name || machine.host} successful`, 'success');
                machine.status = 'online';
                this.renderMachines();
            } else {
                this.addLog(`Connection to ${machine.name || machine.host} failed: ${result.message || 'Unknown error'}`, 'error');
                machine.status = 'offline';
                this.renderMachines();
            }
        } catch (error) {
            this.addLog(`Connection test failed for ${machine.name || machine.host}`, 'error');
            machine.status = 'offline';
            this.renderMachines();
        } finally {
            this.hideLoading();
        }
    }

    editMachine(machineId) {
        const machine = this.machines.find(m => m.id === machineId);
        if (!machine) return;

        document.getElementById('machine-id').value = machine.id;
        document.getElementById('machine-name').value = machine.name;
        document.getElementById('machine-host').value = machine.host;
        document.getElementById('machine-port').value = machine.port;
        document.getElementById('machine-username').value = machine.username;
        document.getElementById('machine-auth-type').value = machine.auth_type;
        document.getElementById('machine-password').value = machine.password || '';
        document.getElementById('machine-key').value = machine.key_path || '';

        this.toggleAuthType(machine.auth_type);
        this.showModal('add-machine-modal');

        const saveBtn = document.getElementById('save-machine-btn');
        saveBtn.textContent = 'Update Machine';
        // Remove previous event listeners to avoid stacking
        const newSaveHandler = () => {
            this.updateMachine(machineId);
            // Restore default after update
            saveBtn.textContent = 'Save Machine';
            saveBtn.onclick = () => this.saveMachine();
        };
        saveBtn.onclick = null;
        saveBtn.removeEventListener('click', this._saveMachineHandler);
        saveBtn.onclick = newSaveHandler;
        this._saveMachineHandler = newSaveHandler;
    }

    async updateMachine(machineId) {
        const formData = {
            name: document.getElementById('machine-name').value,
            host: document.getElementById('machine-host').value,
            port: document.getElementById('machine-port').value,
            username: document.getElementById('machine-username').value,
            auth_type: document.getElementById('machine-auth-type').value,
            password: document.getElementById('machine-password').value,
            key_path: document.getElementById('machine-key').value
        };

        if (!formData.name || !formData.host || !formData.username) {
            alert('Please fill in all required fields');
            return;
        }

        this.showLoading();

        try {
            const response = await fetch(`/api/machines/${machineId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });
            if (response.ok) {
                await this.loadMachines();
                this.hideModal('add-machine-modal');
                this.addLog(`Machine ${formData.name} updated successfully`, 'success');
                // Reset save button
                const saveBtn = document.getElementById('save-machine-btn');
                saveBtn.textContent = 'Save Machine';
                saveBtn.onclick = () => this.saveMachine();
            } else {
                const error = await response.json();
                alert(`Error: ${error.message}`);
            }
        } catch (error) {
            alert('Failed to update machine');
            this.addLog('Failed to update machine', 'error');
        } finally {
            this.hideLoading();
        }
    }

    async deleteMachine(machineId) {
        const machine = this.machines.find(m => m.id === machineId);
        if (!machine) return;

        if (!confirm(`Are you sure you want to delete the machine: ${machine.name}?`)) {
            return;
        }

        this.showLoading();

        try {
            const response = await fetch(`/api/machines/${machineId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            if (response.ok) {
                this.machines = this.machines.filter(m => m.id !== machineId);
                this.renderMachines();
                this.populateMachineSelects();
                this.addLog(`Machine ${machine.name} deleted successfully`, 'success');
            } else {
                const error = await response.json();
                alert(`Error: ${error.message}`);
            }
        } catch (error) {
            alert('Failed to delete machine');
            this.addLog('Failed to delete machine', 'error');
        } finally {
            this.hideLoading();
        }
    }

    async saveAnsible() {
        // Determine mode based on active main tab instead of mode buttons
        const activeMainTab = document.querySelector('#ansible-section .tab-btn.active').dataset.tab;
        const mode = activeMainTab === 'adhoc-ansible' ? 'adhoc' : 'playbook'; if (mode === 'adhoc') {
            const module = document.getElementById('ansible-module').value;
            const args = document.getElementById('ansible-args').value;

            if (!module || !args) {
                alert('Please enter module and arguments');
                return;
            }

            const content = `---
- name: Ad-hoc command
  hosts: all
  tasks:
    - name: Execute ${module}
      ${module}: ${args}`;

            try {
                const response = await fetch('/api/save-script', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        type: 'ansible',
                        filename: `adhoc_${module}_${Date.now()}.yml`,
                        content: content
                    })
                });

                if (response.ok) {
                    this.addLog('Ansible ad-hoc command saved', 'success');
                    this.loadExistingFiles('ansible');
                } else {
                    this.addLog('Failed to save Ansible command', 'error');
                }
            } catch (error) {
                this.addLog('Failed to save Ansible command', 'error');
            }
        }
    }

    async saveAnsiblePlaybookFromEditor() {
        const content = document.getElementById('ansible-editor').value;
        const filename = document.getElementById('ansible-filename').value;
        if (!content || !filename) {
            alert('Please enter playbook content and filename');
            return;
        }
        try {
            const response = await fetch('/api/save-script', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    type: 'ansible',
                    filename: filename,
                    content: content
                })
            });
            if (response.ok) {
                this.addLog(`Ansible playbook saved: ${filename}`, 'success');
                this.loadExistingFiles('ansible');
            } else {
                const error = await response.json().catch(() => ({}));
                this.addLog('Failed to save Ansible playbook' + (error.message ? ': ' + error.message : ''), 'error');
                alert('Failed to save Ansible playbook' + (error.message ? ': ' + error.message : ''));
            }
        } catch (error) {
            this.addLog('Failed to save Ansible playbook: ' + (error.message || error), 'error');
            alert('Failed to save Ansible playbook: ' + (error.message || error));
        }
    }

    // --- Directory Management Methods ---
    initDirectoryManagement() {
        // Initialize directory management for python, ansible, terraform and docker
        this.currentDirectories = {
            python: null,
            ansible: null,
            terraform: null,
            docker: null
        };
        // Track current sub-path inside an opened project directory ('' = at project root)
        this.currentSubPaths = { python: '', ansible: '', terraform: '', docker: '' };

        // Python directory management
        this.setupDirectoryManagement('python');

        // Ansible directory management
        this.setupDirectoryManagement('ansible');

        // Terraform directory management  
        this.setupDirectoryManagement('terraform');

        // Docker directory management
        this.setupDirectoryManagement('docker');

        // Setup enhanced project execution
        this.setupProjectExecution();
    }

    setupDirectoryManagement(type) {
        // Create directory button
        const createBtn = document.getElementById(`create-${type}-dir-btn`);
        if (createBtn) {
            createBtn.addEventListener('click', () => this.createDirectory(type));
        }

        // Upload to directory button
        const uploadBtn = document.getElementById(`${type}-upload-to-dir-btn`);
        if (uploadBtn) {
            uploadBtn.addEventListener('click', () => {
                document.getElementById(`${type}-dir-file-input`).click();
            });
        }

        // File input for directory uploads
        const fileInput = document.getElementById(`${type}-dir-file-input`);
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                this.handleDirectoryFileUpload(type, e.target.files);
            });
        }

        // Refresh directory button
        const refreshBtn = document.getElementById(`${type}-refresh-dir-btn`);
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                if (this.currentDirectories[type]) {
                    this.browseProjectDirectory(type, this.currentSubPaths[type] || '');
                }
            });
        }

        // Close directory view button
        const closeBtn = document.getElementById(`${type}-close-dir-btn`);
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeDirectoryView(type));
        }

        // Execute file button
        const executeBtn = document.getElementById(`${type}-execute-file-btn`);
        if (executeBtn) {
            executeBtn.addEventListener('click', () => this.executeDirectoryFile(type));
        }

        // Select all button
        const selectAllBtn = document.getElementById(`${type}-select-all-btn`);
        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', () => this.selectAllFiles(type));
        }

        // Clear selection button
        const clearSelectionBtn = document.getElementById(`${type}-clear-selection-btn`);
        if (clearSelectionBtn) {
            clearSelectionBtn.addEventListener('click', () => this.clearFileSelection(type));
        }

        // Execution mode radio buttons
        const executionModeRadios = document.querySelectorAll(`input[name="${type}-exec-mode"]`);
        executionModeRadios.forEach(radio => {
            radio.addEventListener('change', () => this.updateExecutionControls(type));
        });

        // File selector dropdown change
        const fileSelector = document.getElementById(`${type}-selected-file`);
        if (fileSelector) {
            fileSelector.addEventListener('change', () => this.updateExecutionControls(type));
        }

        // Terraform-specific directory action buttons
        // Terraform directory specific buttons removed (Init/Plan/Apply). Unified workflow used instead.

        // Enter key for directory name input
        const dirNameInput = document.getElementById(`${type}-new-dir-name`);
        if (dirNameInput) {
            dirNameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.createDirectory(type);
                }
            });
        }

        // Load initial directories
        this.loadDirectories(type);
    }

    async loadDirectories(type) {
        try {
            const response = await fetch(`/api/directories/${type}`);
            if (response.ok) {
                const directories = await response.json();
                this.renderDirectories(type, directories);
            } else {
                this.addLog(`Failed to load ${type} directories`, 'error');
            }
        } catch (error) {
            this.addLog(`Error loading ${type} directories: ${error.message}`, 'error');
        }
    }

    renderDirectories(type, directories) {
        const grid = document.getElementById(`${type}-directories-grid`);
        grid.innerHTML = '';

        if (!directories || directories.length === 0) {
            grid.innerHTML = `
                <div class="empty-directory">
                    <i class="fas fa-folder-open"></i>
                    <p>No project directories found</p>
                    <small>Create your first ${type} project directory above</small>
                </div>
            `;
            return;
        }

        directories.forEach(dir => {
            const card = document.createElement('div');
            card.className = 'directory-card';
            card.innerHTML = `
                <div class="directory-card-header">
                    <div class="directory-name">
                        <i class="fas fa-folder"></i>
                        ${dir.name}
                    </div>
                    <div class="directory-actions">
                        <button class="directory-rename" onclick="app.showRenameDirectoryDialog('${type}', '${dir.name}')" title="Rename Directory">
                            <i class="fas fa-tag"></i>
                        </button>
                        <button class="directory-delete" onclick="app.deleteDirectory('${type}', '${dir.name}')" title="Delete Directory">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="directory-info">
                    <span>${dir.files_count} files</span>
                    <span class="directory-meta">Modified: ${new Date(dir.modified * 1000).toLocaleDateString()}</span>
                </div>
            `;

            card.addEventListener('click', () => this.openDirectory(type, dir.name));
            grid.appendChild(card);
        });
    }

    async createDirectory(type) {
        const nameInput = document.getElementById(`${type}-new-dir-name`);
        const dirName = nameInput.value.trim();

        if (!dirName) {
            alert('Please enter a directory name');
            return;
        }

        try {
            const response = await fetch(`/api/directories/${type}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name: dirName })
            });

            if (response.ok) {
                const result = await response.json();
                this.addLog(`Directory '${result.name}' created successfully`, 'success');
                nameInput.value = '';
                this.loadDirectories(type);
            } else {
                const error = await response.json();
                alert(`Failed to create directory: ${error.error}`);
            }
        } catch (error) {
            this.addLog(`Error creating directory: ${error.message}`, 'error');
            alert('Failed to create directory');
        }
    }

    async deleteDirectory(type, dirName) {
        if (!confirm(`Are you sure you want to delete directory '${dirName}' and all its files?`)) {
            return;
        }

        try {
            const response = await fetch(`/api/directories/${type}/${dirName}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.addLog(`Directory '${dirName}' deleted successfully`, 'success');
                this.loadDirectories(type);

                // Close directory view if it was open
                if (this.currentDirectories[type] === dirName) {
                    this.closeDirectoryView(type);
                }
            } else {
                const error = await response.json();
                alert(`Failed to delete directory: ${error.error}`);
            }
        } catch (error) {
            this.addLog(`Error deleting directory: ${error.message}`, 'error');
            alert('Failed to delete directory');
        }
    }

    async openDirectory(type, dirName) {
        this.currentDirectories[type] = dirName;
        this.currentSubPaths[type] = '';

        // Update UI
        document.getElementById(`${type}-current-directory`).textContent = `Directory: ${dirName}`;
        document.getElementById(`${type}-directory-details`).style.display = 'block';

        // Highlight selected directory
        document.querySelectorAll(`#${type}-directories-grid .directory-card`).forEach(card => {
            card.classList.remove('selected');
        });
        event.currentTarget.classList.add('selected');

        // Load hierarchical directory contents (project root)
        this.browseProjectDirectory(type);
    }

    // Browse within an opened project directory using hierarchical backend
    async browseProjectDirectory(type, subPath = '') {
        const baseDir = this.currentDirectories[type];
        if (!baseDir) return;
        this.currentSubPaths[type] = subPath;
        const relPath = baseDir + (subPath ? '/' + subPath : '');
        try {
            const response = await fetch(`/api/directories/${type}/browse?path=${encodeURIComponent(relPath)}`);
            if (response.ok) {
                const data = await response.json();
                this.renderProjectDirectory(type, data, baseDir);
            } else {
                const err = await response.json().catch(() => ({ error: 'Failed' }));
                this.addLog(`Failed to browse path: ${err.error || relPath}`, 'error');
            }
        } catch (e) {
            this.addLog(`Error browsing directory: ${e.message}`, 'error');
        }
    }

    renderProjectDirectory(type, data, baseDir) {
        // Render breadcrumbs relative to project root
        const bcEl = document.getElementById(`${type}-breadcrumbs`);
        if (bcEl) {
            const crumbs = (data.breadcrumbs || []).filter(c => c.path && c.path.startsWith(baseDir));
            // Ensure baseDir crumb present
            const baseCrumb = { name: baseDir, path: baseDir };
            const finalCrumbs = [baseCrumb];
            crumbs.forEach(c => { if (c.path === baseDir) return; finalCrumbs.push(c); });
            bcEl.innerHTML = finalCrumbs.map((c, i) => {
                const relSub = c.path === baseDir ? '' : c.path.slice(baseDir.length + 1);
                return `<span class="breadcrumb-seg" data-subpath="${relSub}" style="cursor:pointer;color:${i === finalCrumbs.length - 1 ? '#fff' : '#4aa3ff'};">${c.name}</span>${i < finalCrumbs.length - 1 ? '<span class="breadcrumb-sep" style="opacity:0.6;">/</span>' : ''}`;
            }).join('');
            bcEl.querySelectorAll('.breadcrumb-seg').forEach(seg => {
                seg.addEventListener('click', (e) => {
                    const sp = e.currentTarget.getAttribute('data-subpath');
                    this.browseProjectDirectory(type, sp);
                });
            });
        }

        // Render directories + files list
        const container = document.getElementById(`${type}-directory-files`);
        if (!container) return;
        // Ensure a toolbar + filter region exists just once
        if (!container._enhanced) {
            const toolbar = document.createElement('div');
            toolbar.className = 'directory-toolbar';
            toolbar.innerHTML = `
                <div class="dir-path-label" id="${type}-path-label"></div>
                <div class="dir-tools">
                    <button class="btn btn-sm btn-secondary" data-action="up" title="Go Up One Level" aria-label="Go up one level"><i class="fas fa-level-up-alt"></i></button>
                    <button class="btn btn-sm btn-secondary" data-action="refresh" title="Refresh" aria-label="Refresh directory"><i class="fas fa-sync"></i></button>
                    <button class="btn btn-sm btn-secondary" data-action="upload" title="Upload Files" aria-label="Upload files"><i class="fas fa-upload"></i></button>
                    <button class="btn btn-sm btn-secondary" data-action="new-folder" title="New Subdirectory" aria-label="Create subdirectory"><i class="fas fa-folder-plus"></i></button>
                    <button class="btn btn-sm btn-secondary" data-action="zip" title="Upload & Extract ZIP" aria-label="Upload ZIP and extract"><i class="fas fa-file-zipper"></i></button>
                    <div class="filter-wrapper">
                        <input type="text" id="${type}-file-filter" class="form-control file-filter" placeholder="Filter files..." aria-label="Filter files" />
                        <i class="fas fa-filter filter-icon"></i>
                    </div>
                </div>`;
            container.parentElement?.insertBefore(toolbar, container);
            // Event delegation for toolbar actions
            toolbar.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-action]');
                if (!btn) return;
                const action = btn.getAttribute('data-action');
                const currentSub = this.currentSubPaths[type] || '';
                if (action === 'refresh') this.browseProjectDirectory(type, currentSub);
                else if (action === 'up') {
                    if (!currentSub) return; // already at root
                    const parts = currentSub.split('/').filter(Boolean); parts.pop();
                    this.browseProjectDirectory(type, parts.join('/'));
                } else if (action === 'new-folder') {
                    const subInput = document.getElementById(`${type}-new-subdir-name`);
                    if (subInput) subInput.focus();
                } else if (action === 'upload') {
                    const fileInput = document.getElementById(`${type}-dir-file-input`);
                    if (fileInput) fileInput.click();
                } else if (action === 'zip') {
                    const zipInput = document.getElementById(`${type}-zip-upload-input`);
                    if (zipInput) zipInput.click();
                }
            });
            const filterInput = toolbar.querySelector(`#${type}-file-filter`);
            filterInput.addEventListener('input', (e) => {
                this.filterDirectoryList(type, e.target.value.trim().toLowerCase());
            });
            container._enhanced = true;
        }

        // Update path label
        const pathLabel = document.getElementById(`${type}-path-label`);
        if (pathLabel) {
            const subPath = this.currentSubPaths[type] || '';
            pathLabel.textContent = subPath ? `/${subPath}` : '/';
        }

        container.innerHTML = '';
        const dirs = data.directories || [];
        const files = data.files || [];
        if (!dirs.length && !files.length) {
            container.innerHTML = `<div class="empty-directory"><i class="fas fa-folder-open"></i><p>Empty</p><small>Upload or create content</small></div>`;
            return;
        }
        // Directories
        dirs.forEach(d => {
            const el = document.createElement('div');
            el.className = 'directory-file-item';
            el.style.cursor = 'pointer';
            el.innerHTML = `
                <div class="file-info-left">
                    <div class="file-icon" style="background:#2d5a9e;">DIR</div>
                    <div>
                        <div class="file-name">${d.name}</div>
                        <div class="file-meta">Modified: ${new Date(d.modified * 1000).toLocaleString()}</div>
                    </div>
                </div>
                <div class="file-actions">
                    <button class="file-action-btn rename" title="Rename" data-path="${d.path}"><i class="fas fa-tag"></i></button>
                </div>`;
            el.addEventListener('dblclick', () => this.browseProjectDirectory(type, d.path.slice(baseDir.length + 1)));
            el.addEventListener('click', (e) => { if (e.detail === 2) return; });
            const renameBtn = el.querySelector('.rename');
            renameBtn.addEventListener('click', (e) => { e.stopPropagation(); this.renamePathPrompt(type, d.path); });
            container.appendChild(el);
        });
        // Files
        files.forEach(f => {
            const extension = (f.extension || '').toLowerCase();
            let iconBg = '#555';
            if (extension === '.py') iconBg = '#3776ab'; else if (['.yml', '.yaml'].includes(extension)) iconBg = '#996515'; else if (extension === '.tf') iconBg = '#844fba'; else if (extension.includes('docker')) iconBg = '#0db7ed';
            const el = document.createElement('div');
            el.className = 'directory-file-item';
            el.innerHTML = `
                <div class="file-info-left">
                    <div class="file-icon" style="background:${iconBg};">${extension.replace('.', '').toUpperCase() || 'FILE'}</div>
                    <div>
                        <div class="file-name">${f.name}</div>
                        <div class="file-meta">${this.formatFileSize(f.size || 0)} • Modified: ${new Date(f.modified * 1000).toLocaleString()}</div>
                    </div>
                </div>
                <div class="file-actions">
                    <button class="file-action-btn" title="View" data-path="${f.path}" data-action="view"><i class="fas fa-eye"></i></button>
                    <button class="file-action-btn edit" title="Edit" data-path="${f.path}" data-action="edit"><i class="fas fa-edit"></i></button>
                    <button class="file-action-btn rename" title="Rename" data-path="${f.path}" data-action="rename"><i class="fas fa-tag"></i></button>
                    <button class="file-action-btn delete" title="Delete" data-path="${f.path}" data-action="delete"><i class="fas fa-trash"></i></button>
                </div>`;
            el.addEventListener('click', () => {
                // Toggle selection highlight (single select)
                container.querySelectorAll('.directory-file-item.selected').forEach(sel => sel.classList.remove('selected'));
                el.classList.add('selected');
            });
            el.querySelectorAll('.file-action-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const action = btn.getAttribute('data-action');
                    const p = btn.getAttribute('data-path');
                    if (action === 'view') this.viewPathFile(type, p);
                    else if (action === 'edit') this.editPathFile(type, p);
                    else if (action === 'rename') this.renamePathPrompt(type, p);
                    else if (action === 'delete') this.deletePathFile(type, p);
                });
            });
            container.appendChild(el);
        });
        // Apply existing filter if user typed something
        const existingFilter = document.getElementById(`${type}-file-filter`);
        if (existingFilter && existingFilter.value) this.filterDirectoryList(type, existingFilter.value.trim().toLowerCase());
    }

    filterDirectoryList(type, term) {
        const container = document.getElementById(`${type}-directory-files`); if (!container) return;
        const items = container.querySelectorAll('.directory-file-item');
        items.forEach(item => {
            if (!term) { item.style.display = ''; return; }
            const name = (item.querySelector('.file-name')?.textContent || '').toLowerCase();
            item.style.display = name.includes(term) ? '' : 'none';
        });
    }

    renamePathPrompt(type, relPath) {
        const baseName = relPath.split('/').pop();
        const newName = prompt(`Rename '${baseName}' to:`, baseName);
        if (!newName || newName.trim() === baseName) return;
        fetch(`/api/directories/${type}/rename`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: relPath, new_name: newName.trim() }) })
            .then(r => r.json().then(j => ({ ok: r.ok, json: j })))
            .then(res => {
                if (res.ok) { this.addLog(`Renamed to ${res.json.new_path}`, 'success'); this.browseProjectDirectory(type, this.currentSubPaths[type]); }
                else alert(`Rename failed: ${res.json.error}`);
            }).catch(e => this.addLog(`Rename error: ${e.message}`, 'error'));
    }

    async viewPathFile(type, relFilePath) {
        try {
            const r = await fetch(`/api/directories/${type}/file?path=${encodeURIComponent(relFilePath)}`);
            const data = await r.json();
            if (!r.ok) { alert(data.error || 'Failed'); return; }
            this.showFileContentModal(data.path.split('/').pop(), data.content);
        } catch (e) { this.addLog(`View file error: ${e.message}`, 'error'); }
    }
    async editPathFile(type, relFilePath) {
        try {
            const r = await fetch(`/api/directories/${type}/file?path=${encodeURIComponent(relFilePath)}`);
            const data = await r.json(); if (!r.ok) { alert(data.error || 'Failed'); return; }
            // Switch to editor tab and populate
            this.switchSection(type);
            const editorTabSelector = type === 'python' ? `#${type}-section [data-tab="editor"]` : type === 'ansible' ? `#${type}-section [data-tab="editor-ansible"]` : type === 'terraform' ? `#${type}-section [data-tab="editor-tf"]` : type === 'docker' ? `#${type}-section [data-tab="editor-docker"]` : '';
            const editorTab = document.querySelector(editorTabSelector); if (editorTab) editorTab.click();
            const editor = document.getElementById(`${type}-editor`); if (editor) editor.value = data.content;
            const filenameInput = document.getElementById(`${type}-filename`); if (filenameInput) filenameInput.value = data.path.split('/').pop();
            // Track editing context for save (reuse existing logic if any)
            this.editingContext = { type, filename: data.path.split('/').pop(), directory: this.currentDirectories[type] };
        } catch (e) { this.addLog(`Edit file error: ${e.message}`, 'error'); }
    }
    async deletePathFile(type, relFilePath) {
        if (!confirm(`Delete file '${relFilePath.split('/').pop()}'?`)) return;
        try {
            const r = await fetch(`/api/directories/${type}/file?path=${encodeURIComponent(relFilePath)}`, { method: 'DELETE' });
            const data = await r.json(); if (!r.ok) { alert(data.error || 'Failed'); return; }
            this.addLog(`Deleted ${data.deleted}`, 'success');
            this.browseProjectDirectory(type, this.currentSubPaths[type]);
        } catch (e) { this.addLog(`Delete file error: ${e.message}`, 'error'); }
    }

    // Subdirectory creation within project
    createSubdirectory(type) {
        const baseDir = this.currentDirectories[type]; if (!baseDir) return;
        const nameInput = document.getElementById(`${type}-new-subdir-name`); if (!nameInput) return;
        const name = nameInput.value.trim(); if (!name) return;
        const subPath = this.currentSubPaths[type];
        const parentRel = baseDir + (subPath ? '/' + subPath : '');
        fetch(`/api/directories/${type}/mkdir`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: parentRel, name }) })
            .then(r => r.json().then(j => ({ ok: r.ok, json: j })))
            .then(res => { if (res.ok) { nameInput.value = ''; this.addLog(`Created folder ${res.json.created}`, 'success'); this.browseProjectDirectory(type, subPath); } else alert(res.json.error || 'Failed'); })
            .catch(e => this.addLog(`Create subdir error: ${e.message}`, 'error'));
    }

    // ZIP upload & extract for current path
    setupZipAndSubdirListeners() {
        ['python', 'ansible', 'terraform', 'docker'].forEach(type => {
            const createBtn = document.getElementById(`${type}-create-subdir-btn`);
            if (createBtn) { createBtn.addEventListener('click', () => this.createSubdirectory(type)); }
            const subInput = document.getElementById(`${type}-new-subdir-name`);
            if (subInput) { subInput.addEventListener('keypress', e => { if (e.key === 'Enter') this.createSubdirectory(type); }); }
            const zipBtn = document.getElementById(`${type}-upload-zip-btn`);
            const zipInput = document.getElementById(`${type}-zip-upload-input`);
            if (zipBtn && zipInput) {
                zipBtn.addEventListener('click', () => zipInput.click());
                zipInput.addEventListener('change', (e) => { const file = e.target.files?.[0]; if (file) this.extractZipUpload(type, file); });
            }
        });
    }

    async extractZipUpload(type, file) {
        // Show spinner/message during ZIP processing
        const spinnerId = `${type}-zip-spinner`;
        let spinner = document.getElementById(spinnerId);
        if (!spinner) {
            spinner = document.createElement('div');
            spinner.id = spinnerId;
            spinner.className = 'zip-upload-spinner';
            spinner.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing ZIP...';
            const container = document.getElementById(`${type}-directory-files`);
            if (container) container.prepend(spinner);
        }
        try {
            const arrayBuf = await file.arrayBuffer();
            const b64 = this.arrayBufferToBase64(arrayBuf);
            const baseDir = this.currentDirectories[type];
            const sub = this.currentSubPaths[type];
            const relPath = baseDir + (sub ? '/' + sub : '');
            const r = await fetch(`/api/directories/${type}/extract-zip`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: relPath, zip_content: b64, overwrite: true })
            });
            const data = await r.json();
            if (!r.ok) {
                this.addLog(data.error || 'ZIP extract failed', 'error');
                spinner.innerHTML = `<span style="color:red"><i class='fas fa-exclamation-circle'></i> ZIP extract failed: ${this.escapeHtml(data.error || 'Unknown error')}</span>`;
                setTimeout(() => spinner.remove(), 3000);
                return;
            }
            this.addLog(`Extracted ${data.count} items from ZIP`, 'success');
            spinner.innerHTML = `<span style="color:green"><i class='fas fa-check-circle'></i> ZIP extracted: ${data.count} items</span>`;
            setTimeout(() => spinner.remove(), 2000);
            this.browseProjectDirectory(type, sub);
        } catch (e) {
            this.addLog(`ZIP extract error: ${e.message}`, 'error');
            if (spinner) {
                spinner.innerHTML = `<span style="color:red"><i class='fas fa-exclamation-circle'></i> ZIP extract error: ${this.escapeHtml(e.message)}</span>`;
                setTimeout(() => spinner.remove(), 3000);
            }
        }
    }
    arrayBufferToBase64(buffer) {
        let binary = ''; const bytes = new Uint8Array(buffer); const len = bytes.byteLength; for (let i = 0; i < len; i++) { binary += String.fromCharCode(bytes[i]); }
        return btoa(binary);
    }

    // Ensure listeners setup after init
    async loadDirectoryContents(type, dirName) { // Backward compatibility wrapper
        this.browseProjectDirectory(type, this.currentSubPaths[type] || '');
    }

    renderDirectoryFiles(type, files) {
        const container = document.getElementById(`${type}-directory-files`);
        container.innerHTML = '';

        if (!files || files.length === 0) {
            container.innerHTML = `
                <div class="empty-directory">
                    <i class="fas fa-file"></i>
                    <p>No files in this directory</p>
                    <small>Upload files using the Upload Files button above</small>
                </div>
            `;
            this.updateExecutionControls(type);
            return;
        }

        files.forEach(file => {
            const fileItem = document.createElement('div');
            fileItem.className = 'directory-file-item';
            fileItem.dataset.filename = file.name;

            const extension = file.extension.toLowerCase();
            let iconClass = 'default';
            let fileStatus = 'executable';

            if (['.yml', '.yaml'].includes(extension)) {
                iconClass = 'yml';
            } else if (extension === '.tf') {
                iconClass = 'tf';
            } else if (extension === '.py') {
                iconClass = 'py';
            }

            // Determine file status
            const isReadonly = file.name.includes('README') || file.name.includes('.backup');
            if (isReadonly) fileStatus = 'readonly';

            fileItem.innerHTML = `
                <input type="checkbox" class="file-checkbox" data-filename="${file.name}">
                <div class="file-info-left">
                    <div class="file-icon ${iconClass}">
                        ${extension.replace('.', '').toUpperCase()}
                    </div>
                    <div>
                        <div class="file-name">${file.name}</div>
                        <div class="file-meta">
                            ${this.formatFileSize(file.size)} • Modified: ${new Date(file.modified * 1000).toLocaleString()}
                        </div>
                        <div class="file-status ${fileStatus}">
                            <i class="fas ${fileStatus === 'executable' ? 'fa-play-circle' : fileStatus === 'readonly' ? 'fa-lock' : 'fa-edit'}"></i>
                            ${fileStatus === 'executable' ? 'Ready to execute' : fileStatus === 'readonly' ? 'Read-only file' : 'Modified'}
                        </div>
                    </div>
                </div>
                <div class="file-actions">
                    <button class="file-action-btn" onclick="app.viewDirectoryFile('${type}', '${file.name}')" title="View">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="file-action-btn edit" onclick="app.editDirectoryFile('${type}', '${file.name}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="file-action-btn rename" onclick="app.showRenameFileDialog('${type}', '${file.name}')" title="Rename">
                        <i class="fas fa-tag"></i>
                    </button>
                    <button class="file-action-btn delete" onclick="app.deleteDirectoryFile('${type}', '${file.name}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div class="file-selection-indicator">
                    <i class="fas fa-check"></i>
                </div>
            `;

            // Add event listeners
            const checkbox = fileItem.querySelector('.file-checkbox');
            checkbox.addEventListener('change', (e) => {
                e.stopPropagation();
                this.handleFileSelection(type, file.name, fileItem, checkbox.checked);
            });

            fileItem.addEventListener('click', (e) => {
                if (!e.target.closest('.file-actions') && !e.target.closest('.file-checkbox')) {
                    checkbox.checked = !checkbox.checked;
                    this.handleFileSelection(type, file.name, fileItem, checkbox.checked);
                }
            });

            container.appendChild(fileItem);
        });

        // Update the file selector dropdown
        this.updateFileSelector(type, files);
        // Update execution controls
        this.updateExecutionControls(type);
    }

    updateFileSelector(type, files) {
        // Handle different selector IDs for different types
        let selectorId;
        if (type === 'docker') {
            selectorId = `${type}-main-file`;
        } else {
            selectorId = `${type}-selected-file`;
        }

        const selector = document.getElementById(selectorId);
        if (!selector) {
            return; // Selector doesn't exist for this type
        }

        // Clear and set default option
        if (type === 'docker') {
            selector.innerHTML = '<option value="">Select docker-compose.yml or Dockerfile...</option>';
        } else {
            selector.innerHTML = '<option value="">Select a file...</option>';
        }

        // Add files as options
        files.forEach(file => {
            const option = document.createElement('option');
            option.value = file.name;
            option.textContent = file.name;
            selector.appendChild(option);
        });

        // For Docker, auto-detect and select main file if possible
        if (type === 'docker') {
            this.autoSelectDockerMainFile(files);
        }
    }

    autoSelectDockerMainFile(files) {
        const selector = document.getElementById('docker-main-file');
        if (!selector) return;

        // Look for docker-compose files first (higher priority)
        const composeFiles = files.filter(file =>
            file.name.match(/^(docker-)?compose\.(yml|yaml)$/i)
        );

        if (composeFiles.length > 0) {
            selector.value = composeFiles[0].name;
            return;
        }

        // Look for Dockerfile
        const dockerfiles = files.filter(file =>
            file.name.match(/^dockerfile$/i) || file.name.startsWith('Dockerfile')
        );

        if (dockerfiles.length > 0) {
            selector.value = dockerfiles[0].name;
            return;
        }
    }

    selectDirectoryFile(type, filename, fileItem) {
        // Remove previous selection
        document.querySelectorAll(`#${type}-directory-files .directory-file-item`).forEach(item => {
            item.classList.remove('selected');
        });

        // Add selection to clicked item
        fileItem.classList.add('selected');

        // Update selector
        document.getElementById(`${type}-selected-file`).value = filename;

        // Update execution controls
        this.updateExecutionControls(type);
    }

    handleFileSelection(type, filename, fileItem, isSelected) {
        if (isSelected) {
            fileItem.classList.add('selected');
        } else {
            fileItem.classList.remove('selected');
        }

        this.updateExecutionControls(type);
        this.updateSelectionSummary(type);
    }

    updateSelectionSummary(type) {
        const selectedFiles = document.querySelectorAll(`#${type}-directory-files .file-checkbox:checked`);
        const countElement = document.getElementById(`${type}-selected-count`);
        const count = selectedFiles.length;

        if (countElement) {
            countElement.textContent = `${count} file${count !== 1 ? 's' : ''} selected`;
        }
    }

    updateExecutionControls(type) {
        const executeBtn = document.getElementById(`${type}-execute-file-btn`);
        const selectedFileDropdown = document.getElementById(`${type}-selected-file`);
        const selectedFiles = document.querySelectorAll(`#${type}-directory-files .file-checkbox:checked`);
        const singleMode = document.querySelector(`input[name="${type}-exec-mode"][value="single"]`);
        const batchMode = document.querySelector(`input[name="${type}-exec-mode"][value="batch"]`);

        if (!executeBtn) return;

        let canExecute = false;
        let buttonText = 'Execute Selected';

        if (singleMode && singleMode.checked) {
            // Single file mode - check if dropdown has selection
            canExecute = selectedFileDropdown && selectedFileDropdown.value !== '';
            buttonText = 'Execute File';
        } else if (batchMode && batchMode.checked) {
            // Batch mode - check if any files are selected
            canExecute = selectedFiles.length > 0;
            buttonText = `Execute ${selectedFiles.length} Files`;
        }

        executeBtn.disabled = !canExecute;
        executeBtn.innerHTML = `<i class="fas fa-play"></i> ${buttonText}`;
    }

    async handleDirectoryFileUpload(type, files) {
        if (!this.currentDirectories[type]) { alert('Please select a directory first'); return; }
        const baseDir = this.currentDirectories[type];
        const sub = this.currentSubPaths ? this.currentSubPaths[type] : '';
        const relPath = baseDir + (sub ? '/' + sub : '');
        const filesData = [];
        for (const file of files) {
            const content = await this.readFileContent(file);
            filesData.push({ name: file.name, content });
        }
        try {
            const response = await fetch(`/api/directories/${type}/upload`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: relPath, files: filesData, overwrite: true }) });
            const result = await response.json();
            if (response.ok) {
                this.addLog(`Uploaded ${result.count || filesData.length} files to '${relPath}'`, 'success');
                this.browseProjectDirectory(type, sub);
            } else {
                alert(`Failed to upload files: ${result.error || 'Unknown error'}`);
            }
        } catch (error) {
            this.addLog(`Error uploading files: ${error.message}`, 'error');
            alert('Failed to upload files');
        }
    }

    async readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file);
        });
    }

    async viewDirectoryFile(type, filename) {
        const dirName = this.currentDirectories[type];
        try {
            const response = await fetch(`/api/directories/${type}/${dirName}/files/${filename}`);
            if (response.ok) {
                const data = await response.json();
                // Show file content in a modal or editor
                this.showFileContentModal(data.name, data.content);
            } else {
                const error = await response.json();
                alert(`Failed to load file: ${error.error}`);
            }
        } catch (error) {
            this.addLog(`Error loading file: ${error.message}`, 'error');
        }
    }

    showFileContentModal(filename, content) {
        // Create a simple modal to show file content
        const modal = document.createElement('div');
        modal.className = 'modal show';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 800px;">
                <div class="modal-header">
                    <h3><i class="fas fa-file"></i> ${filename}</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="code-editor-container">
                        <div class="code-editor-wrapper">
                            <pre style="background: #1e1e1e; color: #d4d4d4; padding: 20px; border-radius: 4px; max-height: 400px; overflow-y: auto; white-space: pre-wrap;">${content}</pre>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary modal-close-btn">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close modal handlers
        modal.querySelector('.modal-close').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        modal.querySelector('.modal-close-btn').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
    }

    async deleteDirectoryFile(type, filename) {
        if (!confirm(`Are you sure you want to delete '${filename}'?`)) {
            return;
        }

        const dirName = this.currentDirectories[type];
        try {
            const response = await fetch(`/api/directories/${type}/${dirName}/files/${filename}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.addLog(`File '${filename}' deleted successfully`, 'success');
                this.browseProjectDirectory(type, this.currentSubPaths[type] || '');
            } else {
                const error = await response.json();
                alert(`Failed to delete file: ${error.error}`);
            }
        } catch (error) {
            this.addLog(`Error deleting file: ${error.message}`, 'error');
        }
    }

    async editDirectoryFile(type, filename) {
        const dirName = this.currentDirectories[type];

        // Debug logging and validation
        console.log('editDirectoryFile called with:', { type, filename, dirName });
        this.addLog(`Attempting to edit file: ${filename} in directory: ${dirName || 'none'}`, 'info');

        if (!dirName) {
            alert(`No ${type} directory is currently selected. Please open a directory first.`);
            return;
        }

        try {
            // Load file content
            const response = await fetch(`/api/directories/${type}/${dirName}/files/${filename}`);
            if (!response.ok) {
                const error = await response.json();
                alert(`Failed to load file: ${error.error}`);
                return;
            }

            const fileData = await response.json();

            // Switch to the appropriate section and load content into editor
            this.switchSection(type);

            // Switch to editor tab
            const editorTabSelector = type === 'python' ? `#${type}-section [data-tab="editor"]` :
                type === 'ansible' ? `#${type}-section [data-tab="editor-ansible"]` :
                    type === 'terraform' ? `#${type}-section [data-tab="editor-tf"]` :
                        type === 'docker' ? `#${type}-section [data-tab="editor-docker"]` :
                            `#${type}-section [data-tab="editor-tf"]`;

            console.log('Looking for editor tab with selector:', editorTabSelector);
            const editorTab = document.querySelector(editorTabSelector);
            if (editorTab) {
                editorTab.click();
                this.addLog(`Switched to ${type} editor tab`, 'info');
            } else {
                this.addLog(`Warning: Could not find editor tab for ${type} with selector: ${editorTabSelector}`, 'warning');
                // Try alternative approach - look for the tab button directly
                const dockerEditorTab = document.querySelector('[data-tab="editor-docker"]');
                if (dockerEditorTab && type === 'docker') {
                    dockerEditorTab.click();
                    this.addLog(`Found and clicked Docker editor tab using alternative method`, 'info');
                }
            }

            // Wait for the editor to be available with retries
            await this.waitForEditor(type, fileData, dirName, filename);

        } catch (error) {
            this.addLog(`Error loading file for editing: ${error.message}`, 'error');
            alert(`Error loading file for editing: ${error.message}`);
        }
    }

    async waitForEditor(type, fileData, dirName, filename, maxRetries = 5) {
        const editorId = `${type}-editor`;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 100 + (attempt * 100))); // Increasing delay

            const editor = document.getElementById(editorId);
            if (editor) {
                editor.value = fileData.content;
                this.updateLineNumbers(editorId);
                this.autoResizeEditor(editorId);

                // Set the filename in the filename input field
                const filenameInputId = `${type}-filename`;
                const filenameInput = document.getElementById(filenameInputId);
                if (filenameInput) {
                    filenameInput.value = filename;
                    this.addLog(`Set filename in input field: ${filename}`, 'info');
                } else {
                    this.addLog(`Warning: Could not find filename input field: ${filenameInputId}`, 'warning');
                }

                // Update tab name to show we're editing a file
                this.updateTabName(`${type}-tab-name`, `${filename} (editing)`);

                // Store editing context
                this.editingContext = {
                    type: type,
                    directory: dirName,
                    filename: filename,
                    originalContent: fileData.content,
                    isDirectoryFile: true // Flag to indicate this is a directory file edit
                };

                // Add save button specifically for editing
                this.showEditingSaveButton(type);

                this.addLog(`Loaded '${filename}' for editing from directory '${dirName}' (attempt ${attempt + 1})`, 'success');
                return;
            }

            this.addLog(`Editor for ${type} not found on attempt ${attempt + 1}, retrying...`, 'warning');
        }

        // If we get here, all retries failed
        this.addLog(`Error: Could not find editor for ${type} after ${maxRetries} attempts. Please ensure the section is loaded properly.`, 'error');
        alert(`Error: Could not find editor for ${type}. Please ensure the section is loaded properly.`);
    }

    showEditingSaveButton(type) {
        // Add a special save button for editing mode
        const actionsContainer = document.querySelector(`#${type}-section .form-actions`);
        if (actionsContainer && !document.getElementById(`save-editing-${type}-btn`)) {
            const saveEditingBtn = document.createElement('button');
            saveEditingBtn.className = 'btn btn-primary';
            saveEditingBtn.id = `save-editing-${type}-btn`;
            saveEditingBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
            saveEditingBtn.onclick = () => this.saveEditedFile();

            // Insert at the beginning
            actionsContainer.insertBefore(saveEditingBtn, actionsContainer.firstChild);
        }
    }

    async saveEditedFile() {
        if (!this.editingContext) {
            alert('No file is currently being edited');
            this.addLog('Save attempted but no file is being edited', 'warning');
            return;
        }

        const { type, directory, filename } = this.editingContext;
        const editorId = `${type}-editor`;
        const editor = document.getElementById(editorId);

        if (!editor) {
            alert(`Could not find editor for ${type}`);
            this.addLog(`Error: Could not find editor ${editorId}`, 'error');
            return;
        }

        const newContent = editor.value;

        this.addLog(`Saving file '${filename}' to directory '${directory}'...`, 'info');
        console.log('saveEditedFile:', { type, directory, filename, contentLength: newContent.length });

        try {
            const response = await fetch(`/api/directories/${type}/${directory}/files/${filename}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ content: newContent })
            });

            if (response.ok) {
                const result = await response.json();
                this.addLog(`✓ File '${filename}' saved successfully`, 'success');
                this.editingContext.originalContent = newContent;
                this.updateTabName(`${type}-tab-name`, `${filename} (saved)`);

                // Remove the editing save button
                const saveEditingBtn = document.getElementById(`save-editing-${type}-btn`);
                if (saveEditingBtn) {
                    saveEditingBtn.remove();
                }

                // Clear editing context
                this.editingContext = null;

                // Refresh directory contents to show the updated file
                this.addLog(`Refreshing directory contents for '${directory}'...`, 'info');
                this.browseProjectDirectory(type, this.currentSubPaths[type] || '');

                alert(`File '${filename}' saved successfully!`);
            } else {
                const error = await response.json();
                const errorMsg = `Failed to save file: ${error.error}`;
                this.addLog(`✗ ${errorMsg}`, 'error');
                alert(errorMsg);
            }
        } catch (error) {
            const errorMsg = `Error saving file: ${error.message}`;
            this.addLog(`✗ ${errorMsg}`, 'error');
            alert(errorMsg);
        }
    }

    showRenameFileDialog(type, filename) {
        const dirName = this.currentDirectories[type];
        const newName = prompt(`Rename file '${filename}' to:`, filename);

        if (newName && newName.trim() && newName.trim() !== filename) {
            this.renameFile(type, dirName, filename, newName.trim());
        }
    }

    async renameFile(type, dirName, oldName, newName) {
        try {
            const response = await fetch(`/api/directories/${type}/${dirName}/files/${oldName}/rename`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ new_name: newName })
            });

            if (response.ok) {
                const result = await response.json();
                this.addLog(`File renamed from '${oldName}' to '${newName}'`, 'success');
                this.browseProjectDirectory(type, this.currentSubPaths[type] || '');
            } else {
                const error = await response.json();
                alert(`Failed to rename file: ${error.error}`);
            }
        } catch (error) {
            this.addLog(`Error renaming file: ${error.message}`, 'error');
        }
    }

    showRenameDirectoryDialog(type, dirName) {
        const newName = prompt(`Rename directory '${dirName}' to:`, dirName);

        if (newName && newName.trim() && newName.trim() !== dirName) {
            this.renameDirectory(type, dirName, newName.trim());
        }
    }

    async renameDirectory(type, oldName, newName) {
        try {
            const response = await fetch(`/api/directories/${type}/${oldName}/rename`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ new_name: newName })
            });

            if (response.ok) {
                const result = await response.json();
                this.addLog(`Directory renamed from '${oldName}' to '${newName}'`, 'success');

                // Update current directory if it was the one being renamed
                if (this.currentDirectories[type] === oldName) {
                    this.currentDirectories[type] = newName;
                }

                this.loadDirectories(type);
            } else {
                const error = await response.json();
                alert(`Failed to rename directory: ${error.error}`);
            }
        } catch (error) {
            this.addLog(`Error renaming directory: ${error.message}`, 'error');
        }
    }

    async executeDirectoryFile(type) {
        const machineSelect = document.getElementById(`${type}-machine-select`);
        const customCommandInput = document.getElementById(`${type}-custom-command`);
        const dirName = this.currentDirectories[type];

        const singleMode = document.querySelector(`input[name="${type}-exec-mode"][value="single"]`);
        const isSingleMode = singleMode && singleMode.checked;

        if (!dirName) {
            alert('No directory selected');
            return;
        }

        let machineId = machineSelect ? machineSelect.value : 'local';
        let customCommand = customCommandInput ? customCommandInput.value.trim() : '';
        let filesToExecute = [];

        if (isSingleMode) {
            // Single file mode
            const fileSelect = document.getElementById(`${type}-selected-file`);
            const filename = fileSelect ? fileSelect.value : '';

            if (!filename) {
                alert('Please select a file to execute');
                return;
            }
            filesToExecute = [filename];
        } else {
            // Batch mode
            const selectedCheckboxes = document.querySelectorAll(`#${type}-directory-files .file-checkbox:checked`);
            if (selectedCheckboxes.length === 0) {
                alert('Please select at least one file to execute');
                return;
            }
            filesToExecute = Array.from(selectedCheckboxes).map(cb => cb.dataset.filename);
        }

        if (!machineId) {
            alert('Please select a machine');
            return;
        }

        this.addLog(`🚀 Starting execution of ${filesToExecute.length} file(s) from ${dirName} directory...`, 'info');

        // Execute files sequentially but in background
        for (const filename of filesToExecute) {
            try {
                this.addLog(`▶️ Starting: ${filename}`, 'info');

                const response = await fetch(`/api/execute-directory/${type}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        machine_id: machineId,
                        directory: dirName,
                        filename: filename,
                        custom_command: customCommand || null
                    })
                });

                const result = await response.json();

                if (result.success) {
                    this.addLog(`✅ ${filename} execution started: ${result.execution_id}`, 'info');
                } else {
                    this.addLog(`❌ Failed to start ${filename} execution: ${result.error}`, 'error');
                }
            } catch (error) {
                this.addLog(`❌ Error starting ${filename} execution: ${error.message}`, 'error');
            }
        }

        this.addLog(`📋 All ${filesToExecute.length} file(s) submitted for execution. Check Dashboard for progress.`, 'info');
    }

    // Removed executeTerraformDirectoryAction in favor of unified workflow execution

    // --- Enhanced Project Execution Methods ---
    async executeProject(projectType) {
        // Handle Docker project execution differently
        if (projectType === 'docker') {
            return this.executeDockerProject();
        }

        const dirName = this.currentDirectories[projectType];
        if (!dirName) {
            alert(`No ${projectType} directory selected`);
            return;
        }

        // Get execution parameters
        const machineId = document.getElementById(`${projectType}-machine-select`).value;
        const mainFile = document.getElementById(`${projectType}-main-file`).value;

        // Handle different command type element names for different project types
        let commandType;
        if (projectType === 'terraform') {
            const workflowElement = document.getElementById(`${projectType}-workflow-type`);
            commandType = workflowElement ? workflowElement.value : 'full';
        } else {
            const commandTypeElement = document.getElementById(`${projectType}-command-type`);
            commandType = commandTypeElement ? commandTypeElement.value : 'auto';
        }

        let customCommand = null;
        let extraArgs = null;
        let remote = true;

        if (projectType === 'python') {
            // Execution always targets the selected machine now (remote). Require machine selection.
            remote = true;
            if (!machineId) {
                alert('Please select a machine for execution');
                return;
            }
        } else if (projectType === 'ansible') {
            // Ansible always needs a target machine
            if (!machineId) {
                alert('Please select a target machine for Ansible execution');
                return;
            }
            remote = false; // Ansible runs locally but targets remote
        } else if (projectType === 'terraform') {
            // Terraform runs locally
            remote = false;
        }

        // Get command parameters
        if (commandType === 'custom') {
            customCommand = document.getElementById(`${projectType}-custom-full-command`).value.trim();
            if (!customCommand) {
                alert('Please enter a custom command');
                return;
            }
        } else {
            extraArgs = document.getElementById(`${projectType}-extra-args`).value.trim();

            // For terraform, handle workflow type
            if (projectType === 'terraform') {
                const workflowType = document.getElementById('terraform-workflow-type').value;
                if (workflowType !== 'full') {
                    extraArgs = (extraArgs ? `${extraArgs} ` : '') + workflowType;
                }
            }
        }

        // For Ansible, check become option
        let becomeOption = false;
        if (projectType === 'ansible') {
            becomeOption = document.getElementById('ansible-project-become').checked;
            if (becomeOption) {
                extraArgs = (extraArgs ? `${extraArgs} ` : '') + '--become';
            }
        }

        try {
            const payload = {
                project_type: projectType,
                directory_name: dirName,
                main_file: mainFile || null,
                custom_command: customCommand,
                remote: remote,
                extra_args: extraArgs,
                machine_id: machineId || null
            };

            const response = await fetch('/api/execute-project', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (result.success) {
                this.addLog(`🚀 ${projectType.toUpperCase()} project execution started: ${result.execution_id}`, 'info');
                this.addLog(`📁 Project: ${dirName}${mainFile ? ` (main: ${mainFile})` : ''}`, 'info');
                // No loading overlay or endExecution - execution runs in background
            } else {
                this.addLog(`❌ Failed to start ${projectType} project execution: ${result.message}`, 'error');
                alert(`Failed to start project execution: ${result.message}`);
            }

        } catch (error) {
            this.addLog(`❌ Error starting ${projectType} project execution: ${error.message}`, 'error');
            alert(`Failed to start project execution: ${error.message}`);
        }
    }

    async detectMainFile(projectType) {
        // Handle Docker project type differently
        if (projectType === 'docker') {
            return this.detectDockerMainFile();
        }

        const dirName = this.currentDirectories[projectType];
        if (!dirName) {
            alert(`No ${projectType} directory selected`);
            return;
        }

        try {
            const response = await fetch('/api/detect-main-file', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    project_type: projectType,
                    directory_name: dirName
                })
            });

            const result = await response.json();

            if (result.success) {
                const mainFileSelect = document.getElementById(`${projectType}-main-file`);

                // Clear existing options
                mainFileSelect.innerHTML = '<option value="">Auto-detect main file...</option>';

                // Add detected main file as first option if found
                if (result.main_file) {
                    const mainOption = document.createElement('option');
                    mainOption.value = result.main_file;
                    mainOption.textContent = `${result.main_file} (detected)`;
                    mainOption.selected = true;
                    mainFileSelect.appendChild(mainOption);
                }

                // Add all suitable files
                result.suitable_files.forEach(file => {
                    if (file !== result.main_file) { // Don't duplicate the main file
                        const option = document.createElement('option');
                        option.value = file;
                        option.textContent = file;
                        mainFileSelect.appendChild(option);
                    }
                });

                if (result.main_file) {
                    this.addLog(`✓ Detected main file: ${result.main_file}`, 'success');
                } else {
                    this.addLog(`! No main file detected for ${projectType} project`, 'warning');
                }

            } else {
                this.addLog(`Failed to detect main file: ${result.message}`, 'error');
                alert(`Failed to detect main file: ${result.message}`);
            }

        } catch (error) {
            this.addLog(`Error detecting main file: ${error.message}`, 'error');
            alert(`Failed to detect main file: ${error.message}`);
        }
    }

    setupProjectExecution() {
        // Setup project execution for each type
        ['python', 'ansible', 'terraform', 'docker'].forEach(type => {
            // Execute project button
            const executeBtn = document.getElementById(`${type}-execute-project-btn`);
            if (executeBtn) {
                executeBtn.addEventListener('click', () => this.executeProject(type));
            }

            // Detect main file button
            const detectBtn = document.getElementById(`${type}-detect-main-btn`);
            if (detectBtn) {
                detectBtn.addEventListener('click', () => this.detectMainFile(type));
            }

            // Command type selector - handle terraform's different naming
            const commandTypeSelect = type === 'terraform' ?
                document.getElementById('terraform-workflow-type') :
                document.getElementById(`${type}-command-type`);
            const customCommandInput = document.getElementById(`${type}-custom-full-command`);
            const extraArgsInput = document.getElementById(`${type}-extra-args`);

            if (commandTypeSelect && customCommandInput && extraArgsInput) {
                commandTypeSelect.addEventListener('change', () => {
                    const isCustom = type === 'terraform' ?
                        commandTypeSelect.value === 'custom' :
                        commandTypeSelect.value === 'custom';

                    if (isCustom) {
                        customCommandInput.style.display = 'block';
                        extraArgsInput.style.display = 'none';
                    } else {
                        customCommandInput.style.display = 'none';
                        extraArgsInput.style.display = 'block';
                    }
                });
            }

            // For Terraform, handle workflow type selector
            if (type === 'terraform') {
                const workflowSelect = document.getElementById('terraform-workflow-type');
                const customCommandInput = document.getElementById('terraform-custom-full-command');
                const extraArgsInput = document.getElementById('terraform-extra-args');

                if (workflowSelect && customCommandInput && extraArgsInput) {
                    workflowSelect.addEventListener('change', () => {
                        if (workflowSelect.value === 'custom') {
                            customCommandInput.style.display = 'block';
                            extraArgsInput.style.display = 'none';
                        } else {
                            customCommandInput.style.display = 'none';
                            extraArgsInput.style.display = 'block';
                        }
                    });
                }
            }

            // For Docker, handle project action buttons
            if (type === 'docker') {
                const stopProjectBtn = document.getElementById('docker-stop-project-btn');
                if (stopProjectBtn) {
                    stopProjectBtn.addEventListener('click', () => this.executeDockerProjectAction('stop'));
                }

                const downProjectBtn = document.getElementById('docker-down-project-btn');
                if (downProjectBtn) {
                    downProjectBtn.addEventListener('click', () => this.executeDockerProjectAction('down'));
                }
            }
        });
    }

    selectAllFiles(type) {
        const checkboxes = document.querySelectorAll(`#${type}-directory-files .file-checkbox`);
        checkboxes.forEach(checkbox => {
            if (!checkbox.checked) {
                checkbox.checked = true;
                const fileItem = checkbox.closest('.directory-file-item');
                this.handleFileSelection(type, checkbox.dataset.filename, fileItem, true);
            }
        });
        this.updateSelectionSummary(type);
    }

    clearFileSelection(type) {
        const checkboxes = document.querySelectorAll(`#${type}-directory-files .file-checkbox`);
        checkboxes.forEach(checkbox => {
            if (checkbox.checked) {
                checkbox.checked = false;
                const fileItem = checkbox.closest('.directory-file-item');
                this.handleFileSelection(type, checkbox.dataset.filename, fileItem, false);
            }
        });
        this.updateSelectionSummary(type);
    }

    closeDirectoryView(type) {
        this.currentDirectories[type] = null;
        document.getElementById(`${type}-directory-details`).style.display = 'none';

        // Remove selection from directories
        document.querySelectorAll(`#${type}-directories-grid .directory-card`).forEach(card => {
            card.classList.remove('selected');
        });
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // === DOCKER MANAGEMENT METHODS ===

    setupDockerInterface() {
        // Docker machine selection
        const dockerMachineSelect = document.getElementById('docker-machine-select');
        if (dockerMachineSelect) {
            dockerMachineSelect.addEventListener('change', () => {
                this.onDockerMachineChange();
            });
        } else {
            console.warn('Docker machine select not found at setup time');
        }

        // Tab switching for Docker
        const dockerTabButtons = document.querySelectorAll('#docker-section .tab-btn');
        if (dockerTabButtons && dockerTabButtons.length) {
            dockerTabButtons.forEach(btn => btn.addEventListener('click', () => this.switchDockerTab(btn.dataset.tab)));
        } else {
            console.warn('Docker tab buttons not found');
        }

        // Refresh buttons
        const refreshDockerInfoBtn = document.getElementById('refresh-docker-info-btn');
        if (refreshDockerInfoBtn) {
            refreshDockerInfoBtn.addEventListener('click', () => this.refreshDockerInfo());
        }

        // If overview container exists and a machine already selected, auto refresh
        const dockerInfoContent = document.getElementById('docker-info-content');
        if (dockerInfoContent) {
            const mid = dockerMachineSelect ? dockerMachineSelect.value : '';
            if (mid) {
                setTimeout(() => this.refreshDockerInfo(), 50);
            }
        }

        const refreshImagesBtn = document.getElementById('refresh-images-btn');
        if (refreshImagesBtn) {
            refreshImagesBtn.addEventListener('click', () => this.refreshDockerImages());
        }

        const refreshContainersBtn = document.getElementById('refresh-containers-btn');
        if (refreshContainersBtn) {
            refreshContainersBtn.addEventListener('click', () => this.refreshDockerContainers());
        }

        const refreshNetworksBtn = document.getElementById('refresh-networks-btn');
        if (refreshNetworksBtn) {
            refreshNetworksBtn.addEventListener('click', () => this.refreshDockerNetworks());
        }

        const refreshVolumesBtn = document.getElementById('refresh-volumes-btn');
        if (refreshVolumesBtn) {
            refreshVolumesBtn.addEventListener('click', () => this.refreshDockerVolumes());
        }

        // Show all containers checkbox
        const showAllContainers = document.getElementById('show-all-containers');
        if (showAllContainers) {
            showAllContainers.addEventListener('change', () => {
                this.updateContainerFilterLabel();
                this.refreshDockerContainers();
            });
            // Initialize label on page load
            this.updateContainerFilterLabel();
        }

        // Action buttons
        const pullImageBtn = document.getElementById('pull-image-btn');
        if (pullImageBtn) {
            pullImageBtn.addEventListener('click', () => this.showPullImageDialog());
        }

        const runContainerBtn = document.getElementById('run-container-btn');
        if (runContainerBtn) {
            runContainerBtn.addEventListener('click', () => this.showRunContainerDialog());
        }

        // Execute buttons in Actions tab
        const executePullBtn = document.getElementById('execute-pull-btn');
        if (executePullBtn) {
            executePullBtn.addEventListener('click', () => this.executePullImage());
        }

        const executeRunBtn = document.getElementById('execute-run-btn');
        if (executeRunBtn) {
            executeRunBtn.addEventListener('click', () => this.executeRunContainer());
        }

        const executeExecBtn = document.getElementById('execute-exec-btn');
        if (executeExecBtn) {
            executeExecBtn.addEventListener('click', () => this.executeContainerCommand());
        }

        // New enhanced action buttons
        const executeStatsBtn = document.getElementById('execute-stats-btn');
        if (executeStatsBtn) {
            executeStatsBtn.addEventListener('click', () => this.executeContainerStats());
        }

        const executeComposeUpBtn = document.getElementById('execute-compose-up-btn');
        if (executeComposeUpBtn) {
            executeComposeUpBtn.addEventListener('click', () => this.executeDockerCompose());
        }

        const executePruneBtn = document.getElementById('execute-prune-btn');
        if (executePruneBtn) {
            executePruneBtn.addEventListener('click', () => this.executeSystemPrune());
        }

        // Container action buttons
        const startContainerBtn = document.getElementById('start-container-btn');
        if (startContainerBtn) {
            startContainerBtn.addEventListener('click', () => this.containerAction('start'));
        }

        const stopContainerBtn = document.getElementById('stop-container-btn');
        if (stopContainerBtn) {
            stopContainerBtn.addEventListener('click', () => this.containerAction('stop'));
        }

        const restartContainerBtn = document.getElementById('restart-container-btn');
        if (restartContainerBtn) {
            restartContainerBtn.addEventListener('click', () => this.containerAction('restart'));
        }

        const removeContainerBtn = document.getElementById('remove-container-btn');
        if (removeContainerBtn) {
            removeContainerBtn.addEventListener('click', () => this.containerAction('remove'));
        }

        const containerLogsBtn = document.getElementById('container-logs-btn');
        if (containerLogsBtn) {
            containerLogsBtn.addEventListener('click', () => this.viewContainerLogs());
        }

        const containerExecBtn = document.getElementById('container-exec-btn');
        if (containerExecBtn) {
            containerExecBtn.addEventListener('click', () => this.execContainerCommand());
        }

        const containerInspectBtn = document.getElementById('container-inspect-btn');
        if (containerInspectBtn) {
            containerInspectBtn.addEventListener('click', () => this.inspectContainer());
        }

        const containerDebugBtn = document.getElementById('container-debug-btn');
        if (containerDebugBtn) {
            containerDebugBtn.addEventListener('click', () => this.debugContainer());
        }

        const closeContainerActions = document.getElementById('close-container-actions');
        if (closeContainerActions) {
            closeContainerActions.addEventListener('click', () => {
                document.getElementById('container-actions-panel').style.display = 'none';
            });
        }
    }

    switchDockerTab(tabName) {
        // Remove active class from all tabs and content
        document.querySelectorAll('#docker-section .tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelectorAll('#docker-section .tab-pane').forEach(pane => {
            pane.classList.remove('active');
        });

        // Add active class to selected tab and content
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`${tabName}-tab`).classList.add('active');

        // Load data for the selected tab
        const machineId = document.getElementById('docker-machine-select').value;
        if (machineId) {
            switch (tabName) {
                case 'overview-docker':
                    this.refreshDockerInfo();
                    break;
                case 'images-docker':
                    this.refreshDockerImages();
                    break;
                case 'containers-docker':
                    this.refreshDockerContainers();
                    break;
                case 'networks-docker':
                    this.refreshDockerNetworks();
                    break;
                case 'volumes-docker':
                    this.refreshDockerVolumes();
                    break;
                case 'actions-docker':
                    // Refresh containers and images to populate dropdowns in actions tab
                    this.refreshDockerContainers();
                    this.refreshDockerImages();
                    break;
            }
        }
    }

    onDockerMachineChange() {
        const machineId = document.getElementById('docker-machine-select').value;
        if (machineId) {
            // Reset all content
            this.resetDockerContent();
            // Load current tab data
            const activeTab = document.querySelector('#docker-section .tab-btn.active').dataset.tab;
            this.switchDockerTab(activeTab);
        } else {
            this.resetDockerContent();
        }
    }

    resetDockerContent() {
        // Reset overview
        document.getElementById('docker-info-content').innerHTML = `
            <div class="info-placeholder">
                <i class="fab fa-docker"></i>
                <p>Select a machine to view Docker information</p>
            </div>
        `;

        // Reset quick stats
        document.getElementById('docker-images-count').textContent = '-';
        document.getElementById('docker-containers-count').textContent = '-';
        document.getElementById('docker-running-count').textContent = '-';
        document.getElementById('docker-networks-count').textContent = '-';
        document.getElementById('docker-volumes-count').textContent = '-';

        // Reset table displays
        this.showDockerMessage('docker-images', 'Select a machine to view Docker images');
        this.showDockerMessage('docker-containers', 'Select a machine to view Docker containers');
        this.showDockerMessage('docker-networks', 'Select a machine to view Docker networks');
        this.showDockerMessage('docker-volumes', 'Select a machine to view Docker volumes');

        // Hide container actions panel
        document.getElementById('container-actions-panel').style.display = 'none';
    }

    async refreshDockerInfo() {
        let machineId = document.getElementById('docker-machine-select').value;
        if (machineId === 'local') {
            machineId = 'localhost';
            document.getElementById('docker-machine-select').value = 'localhost';
        }
        if (!machineId) return;

        try {
            this.showLoading();
            const response = await fetch('/api/docker/info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ machine_id: machineId })
            });

            const result = await response.json();

            if (result.success) {
                // Parse Docker system info JSON
                let sysInfo = {};
                if (result.info) {
                    try {
                        sysInfo = JSON.parse(result.info);
                    } catch (e) {
                        console.log('Could not parse Docker system info JSON');
                    }
                }

                // Create professional Docker info display
                const infoContent = document.getElementById('docker-info-content');
                if (!infoContent) {
                    console.warn('docker-info-content missing, injecting minimal container');
                    const overviewTab = document.getElementById('overview-docker-tab');
                    if (overviewTab) {
                        const fallbackDiv = document.createElement('div');
                        fallbackDiv.id = 'docker-info-content';
                        overviewTab.appendChild(fallbackDiv);
                    }
                }
                const target = document.getElementById('docker-info-content');
                if (target) {
                    target.innerHTML = this.buildDockerInfoDisplay(result.version, sysInfo);
                }

                // Update quick stats cards
                this.updateDockerQuickStats(sysInfo);

            } else {
                document.getElementById('docker-info-content').innerHTML = `
                    <div class="error-message" style="color: #d32f2f; text-align: center; padding: 20px;">
                        <i class="fas fa-exclamation-triangle"></i><br>
                        ${this.escapeHtml(result.error)}
                    </div>
                `;
            }
        } catch (error) {
            document.getElementById('docker-info-content').innerHTML = `
                <div class="error-message" style="color: #d32f2f; text-align: center; padding: 20px;">
                    <i class="fas fa-exclamation-triangle"></i><br>
                    Error: ${this.escapeHtml(error.message)}
                </div>
            `;
        } finally {
            this.hideLoading();
        }
    }

    buildDockerInfoDisplay(version, sysInfo) {
        const formatBytes = (bytes) => {
            if (!bytes) return 'N/A';
            const sizes = ['B', 'KB', 'MB', 'GB'];
            if (bytes === 0) return '0B';
            const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
            return Math.round(bytes / Math.pow(1024, i)) + sizes[i];
        };

        const running = sysInfo.ContainersRunning || 0;
        const total = sysInfo.Containers || 0;
        const stopped = total - running;
        const paused = sysInfo.ContainersPaused || 0;
        const isOnline = sysInfo.ServerVersion ? true : false;
        const healthStatus = isOnline ? 'healthy' : 'unhealthy';

        return `
            <div class="enterprise-docker-panel">
                <!-- Status Header -->
                <div class="docker-status-header">
                    <div class="status-primary">
                        <div class="docker-brand">
                            <i class="fab fa-docker"></i>
                            <span class="brand-text">Docker Engine</span>
                        </div>
                        <div class="version-badge">v${this.escapeHtml(version || 'Unknown')}</div>
                    </div>
                    <div class="health-indicator ${healthStatus}">
                        <div class="health-dot"></div>
                        <span class="health-text">${isOnline ? 'Operational' : 'Offline'}</span>
                    </div>
                </div>

                <!-- Key Metrics Dashboard -->
                <div class="metrics-dashboard">
                    <div class="metric-card primary">
                        <div class="metric-icon">
                            <i class="fas fa-play-circle"></i>
                        </div>
                        <div class="metric-content">
                            <div class="metric-value">${running}</div>
                            <div class="metric-label">Active Containers</div>
                        </div>
                        <div class="metric-trend positive"></div>
                    </div>
                    
                    <div class="metric-card secondary">
                        <div class="metric-icon">
                            <i class="fas fa-pause-circle"></i>
                        </div>
                        <div class="metric-content">
                            <div class="metric-value">${stopped}</div>
                            <div class="metric-label">Stopped</div>
                        </div>
                        <div class="metric-trend neutral"></div>
                    </div>
                    
                    <div class="metric-card tertiary">
                        <div class="metric-icon">
                            <i class="fas fa-layer-group"></i>
                        </div>
                        <div class="metric-content">
                            <div class="metric-value">${sysInfo.Images || 0}</div>
                            <div class="metric-label">Images</div>
                        </div>
                        <div class="metric-trend neutral"></div>
                    </div>
                    
                    <div class="metric-card quaternary">
                        <div class="metric-icon">
                            <i class="fas fa-microchip"></i>
                        </div>
                        <div class="metric-content">
                            <div class="metric-value">${sysInfo.NCPU || 0}</div>
                            <div class="metric-label">CPU Cores</div>
                        </div>
                        <div class="metric-trend neutral"></div>
                    </div>
                </div>

                <!-- System Information Grid -->
                <div class="system-info-grid">
                    <div class="info-section">
                        <div class="section-header">
                            <i class="fas fa-server" style="color: #fff"></i>
                            <span style="color: #fff">System Resources</span>
                        </div>
                        <div class="info-items">
                            <div class="info-row">
                                <span class="info-key">Memory</span>
                                <span class="info-value">${formatBytes(sysInfo.MemTotal)}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-key">Architecture</span>
                                <span class="info-value">${sysInfo.Architecture || 'Unknown'}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="info-section">
                        <div class="section-header">
                            <i class="fas fa-cogs" style="color: #fff"></i>
                            <span style="color: #fff">Runtime Configuration</span>
                        </div>
                        <div class="info-items">
                            <div class="info-row">
                                <span class="info-key">Runtime</span>
                                <span class="info-value">${sysInfo.DefaultRuntime || 'Unknown'}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-key">Storage Driver</span>
                                <span class="info-value">${sysInfo.Driver || 'Unknown'}</span>
                            </div>
                        </div>
                    </div>
                </div>

                ${sysInfo.Warnings && sysInfo.Warnings.length > 0 ? `
                <div class="alert-banner warning">
                    <div class="alert-icon">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <div class="alert-content">
                        <span class="alert-title">System Alerts</span>
                        <span class="alert-message">${sysInfo.Warnings.length} warning${sysInfo.Warnings.length > 1 ? 's' : ''} detected</span>
                    </div>
                    <div class="alert-action">
                        <i class="fas fa-chevron-right"></i>
                    </div>
                </div>
                ` : ''}
            </div>
        `;
    } updateDockerQuickStats(sysInfo) {
        // Update the quick stats cards in the overview section
        document.getElementById('docker-images-count').textContent = sysInfo.Images || '0';
        document.getElementById('docker-containers-count').textContent = sysInfo.Containers || '0';
        document.getElementById('docker-running-count').textContent = sysInfo.ContainersRunning || '0';

        // Add additional stats if elements exist
        const pausedElement = document.getElementById('docker-paused-count');
        if (pausedElement) {
            pausedElement.textContent = sysInfo.ContainersPaused || '0';
        }

        const stoppedElement = document.getElementById('docker-stopped-count');
        if (stoppedElement) {
            stoppedElement.textContent = sysInfo.ContainersStopped || '0';
        }
    }

    async refreshDockerImages() {
        const machineId = document.getElementById('docker-machine-select').value;
        if (!machineId) return;

        try {
            this.showLoading();
            const response = await fetch('/api/docker/images', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ machine_id: machineId })
            });

            const result = await response.json();

            if (result.success) {
                this.populateImagesTable(result.output);

                // Update images count in quick stats
                const lines = result.output.split('\n').filter(line => line.trim() && !line.startsWith('REPOSITORY'));
                document.getElementById('docker-images-count').textContent = lines.length;

                // Populate image dropdown for run container
                this.populateImageDropdown(lines);
            } else {
                this.showDockerMessage('docker-images', `Error: ${result.error}`);
            }
        } catch (error) {
            this.showDockerMessage('docker-images', `Error: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    }

    populateImagesTable(output) {
        const table = document.getElementById('docker-images-table');
        const tbody = document.getElementById('docker-images-tbody');
        const message = document.getElementById('docker-images-message');

        if (!output || output.trim() === '') {
            table.style.display = 'none';
            message.style.display = 'block';
            message.textContent = 'No images found';
            return;
        }

        const lines = output.split('\n').filter(line => line.trim());
        if (lines.length <= 1) {
            table.style.display = 'none';
            message.style.display = 'block';
            message.textContent = 'No images found';
            return;
        }

        // Clear existing rows
        tbody.innerHTML = '';

        // Parse data (skip header)
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const parts = line.split(/\s+/);
            if (parts.length >= 5) {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td class="image-name">${this.escapeHtml(parts[0])}</td>
                    <td>${this.escapeHtml(parts[1])}</td>
                    <td class="container-id">${this.escapeHtml(parts[2])}</td>
                    <td>${this.escapeHtml(parts[3])}</td>
                    <td>${this.escapeHtml(parts[4])}</td>
                `;
                tbody.appendChild(row);
            }
        }

        table.style.display = 'table';
        message.style.display = 'none';
    }

    populateImageDropdown(imageLines) {
        const imageSelect = document.getElementById('run-image-name');
        if (!imageSelect) return;

        // Clear existing options except the first one
        imageSelect.innerHTML = '<option value="">Select an image...</option>';

        // Parse image lines and extract repository:tag
        imageLines.forEach(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 2) {
                const repository = parts[0];
                const tag = parts[1];
                if (repository && tag && repository !== 'REPOSITORY') {
                    const imageName = tag === '<none>' ? repository : `${repository}:${tag}`;
                    const option = document.createElement('option');
                    option.value = imageName;
                    option.textContent = imageName;
                    imageSelect.appendChild(option);
                }
            }
        });

        // Add visual feedback to show dropdown is populated
        if (imageLines.length > 0) {
            const firstOption = imageSelect.querySelector('option[value=""]');
            if (firstOption) {
                firstOption.textContent = `Select an image (${imageLines.length} available)...`;
            }
        }
    }

    async refreshDockerContainers() {
        const machineId = document.getElementById('docker-machine-select').value;
        if (!machineId) return;

        const showAll = document.getElementById('show-all-containers').checked;

        try {
            this.showLoading();
            const response = await fetch('/api/docker/containers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ machine_id: machineId, all: showAll })
            });

            const result = await response.json();

            if (result.success) {
                // Prefer structured containers array if provided by backend
                if (Array.isArray(result.containers) && result.containers.length > 0) {
                    this.populateContainersFromObjects(result.containers);

                    // Update counts using structured data
                    document.getElementById('docker-containers-count').textContent = result.containers.length;
                    const running = result.containers.filter(c => c.Status && c.Status.startsWith('Up'));
                    document.getElementById('docker-running-count').textContent = running.length;

                    // Populate selection inputs
                    this.populateContainerIdsFromObjects(result.containers);
                } else {
                    // Fallback to legacy plain-text output parsing
                    // Try to detect JSON lines in output (backend older than structured array change)
                    const raw = result.output || '';
                    const jsonLikeLines = raw.split('\n').map(l => l.trim()).filter(l => l.startsWith('{') && l.endsWith('}'));
                    if (jsonLikeLines.length > 0) {
                        const parsed = [];
                        jsonLikeLines.forEach(l => { try { parsed.push(JSON.parse(l)); } catch (e) { } });
                        if (parsed.length > 0) {
                            this.addLog(`Parsed ${parsed.length} containers from JSON lines fallback`, 'info');
                            this.populateContainersFromObjects(parsed);
                            document.getElementById('docker-containers-count').textContent = parsed.length;
                            const running = parsed.filter(c => c.Status && c.Status.startsWith('Up'));
                            document.getElementById('docker-running-count').textContent = running.length;
                            this.populateContainerIdsFromObjects(parsed);
                            return;
                        }
                    }

                    this.populateContainersTable(raw);

                    const lines = raw.split('\n').filter(line => line.trim() && !line.startsWith('CONTAINER'));
                    document.getElementById('docker-containers-count').textContent = lines.length;
                    const runningLines = lines.filter(line => line.includes('Up '));
                    document.getElementById('docker-running-count').textContent = runningLines.length;
                    this.populateContainerIds(lines);
                    if (!lines.length) {
                        this.addLog('No containers parsed from fallback output. Enable JSON format backend or ensure containers exist.', 'warning');
                    }
                }
            } else {
                this.showDockerMessage('docker-containers', `Error: ${result.error}`);
            }
        } catch (error) {
            this.showDockerMessage('docker-containers', `Error: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    }

    populateContainersTable(output) {
        const table = document.getElementById('docker-containers-table');
        const tbody = document.getElementById('docker-containers-tbody');
        const message = document.getElementById('docker-containers-message');

        if (!output || output.trim() === '') {
            table.style.display = 'none';
            message.style.display = 'block';
            message.textContent = 'No containers found';
            return;
        }

        let lines = output.split('\n').filter(line => line.trim());
        // Detect placeholder format issue (literal {.ID}) and sanitize
        const placeholderDetected = lines.some(l => l.includes('{.ID}') || l.includes('{.Names}'));
        if (placeholderDetected) {
            // Remove any non-header placeholder lines to avoid polluting UI
            lines = lines.filter(l => !l.startsWith('{.ID}') && !l.startsWith('{.Names}'));
            this.addLog('⚠️ Detected unexpanded Docker format placeholders ({.ID}). Backend likely running old code. Restart backend to fully resolve.', 'warning');
        }
        if (lines.length <= 1) {
            table.style.display = 'none';
            message.style.display = 'block';
            message.textContent = placeholderDetected ? 'Container list unavailable (format placeholders). Restart service.' : 'No containers found';
            return;
        }

        // Clear existing rows
        tbody.innerHTML = '';

        // Parse data (skip header)
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const parts = line.split(/\s+/);
            if (parts.length >= 7) {
                const containerId = parts[0];
                const image = parts[1];
                const command = parts[2];
                const created = parts[3];
                const status = parts[4];
                const ports = parts[5] || '';
                const names = parts[6];

                // Determine status class and icon
                let statusClass = '';
                let statusIcon = '';

                if (status.includes('Up')) {
                    statusClass = 'status-running';
                    statusIcon = '<i class="fas fa-play-circle" style="color: #10b981; margin-right: 4px;"></i>';
                } else if (status.includes('Exited')) {
                    statusClass = 'status-exited';
                    statusIcon = '<i class="fas fa-stop-circle" style="color: #ef4444; margin-right: 4px;"></i>';
                } else {
                    statusClass = 'status-stopped';
                    statusIcon = '<i class="fas fa-pause-circle" style="color: #f59e0b; margin-right: 4px;"></i>';
                }

                const row = document.createElement('tr');
                row.style.cursor = 'pointer';
                row.title = `Click to manage container ${containerId} (${names})`;

                // Use full container ID for actions, not just the truncated version
                row.addEventListener('click', () => this.showContainerActions(containerId));

                row.innerHTML = `
                    <td class="container-id" title="Full ID: ${this.escapeHtml(containerId)}">${this.escapeHtml(containerId.substring(0, 12))}</td>
                    <td class="image-name">${this.escapeHtml(image)}</td>
                    <td>${this.escapeHtml(command)}</td>
                    <td>${this.escapeHtml(created)}</td>
                    <td class="${statusClass}">${statusIcon}${this.escapeHtml(status)}</td>
                    <td>${this.escapeHtml(ports)}</td>
                    <td>${this.escapeHtml(names)}</td>
                `;
                tbody.appendChild(row);
            }
        }

        table.style.display = 'table';
        message.style.display = 'none';
    }

    // New: populate containers table from structured objects returned by backend (docker ps --format '{{json .}}')
    populateContainersFromObjects(containers) {
        const table = document.getElementById('docker-containers-table');
        const tbody = document.getElementById('docker-containers-tbody');
        const message = document.getElementById('docker-containers-message');

        if (!Array.isArray(containers) || containers.length === 0) {
            table.style.display = 'none';
            message.style.display = 'block';
            message.textContent = 'No containers found';
            return;
        }

        tbody.innerHTML = '';

        containers.forEach(c => {
            // Defensive checks
            if (!c || !c.ID) return;
            const id = c.ID;
            const image = c.Image || ''; // e.g., 'nginx:latest'
            const command = (c.Command || '').replace(/^"|"$/g, '');
            const created = c.RunningFor || c.CreatedAt || '';
            const status = c.Status || '';
            const ports = c.Ports || '';
            const names = c.Names || '';

            let statusClass = '';
            let statusIcon = '';
            if (status.startsWith('Up')) {
                statusClass = 'status-running';
                statusIcon = '<i class="fas fa-play-circle" style="color: #10b981; margin-right: 4px;"></i>';
            } else if (status.startsWith('Exited')) {
                statusClass = 'status-exited';
                statusIcon = '<i class="fas fa-stop-circle" style="color: #ef4444; margin-right: 4px;"></i>';
            } else if (status) {
                statusClass = 'status-stopped';
                statusIcon = '<i class="fas fa-pause-circle" style="color: #f59e0b; margin-right: 4px;"></i>';
            }

            const row = document.createElement('tr');
            row.style.cursor = 'pointer';
            row.title = `Click to manage container ${id} (${names})`;
            row.addEventListener('click', () => this.showContainerActions(id));
            row.innerHTML = `
                <td class="container-id" title="Full ID: ${this.escapeHtml(id)}">${this.escapeHtml(id.substring(0, 12))}</td>
                <td class="image-name">${this.escapeHtml(image)}</td>
                <td>${this.escapeHtml(command)}</td>
                <td>${this.escapeHtml(created)}</td>
                <td class="${statusClass}">${statusIcon}${this.escapeHtml(status)}</td>
                <td>${this.escapeHtml(ports)}</td>
                <td>${this.escapeHtml(names)}</td>`;
            tbody.appendChild(row);
        });

        table.style.display = 'table';
        message.style.display = 'none';
    }

    // New: populate container selection inputs from structured objects
    populateContainerIdsFromObjects(containers) {
        if (!Array.isArray(containers)) return;
        const simplified = containers.filter(c => c && c.ID).map(c => ({
            id: c.ID,
            name: c.Names || '',
            display: `${c.ID.substring(0, 12)}${c.Names ? ' (' + c.Names + ')' : ''}`
        }));

        const execSelect = document.getElementById('exec-container-id');
        const statsSelect = document.getElementById('stats-container-id');

        if (execSelect) {
            execSelect.innerHTML = '<option value="">Select a container...</option>';
            simplified.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.display;
                execSelect.appendChild(opt);
            });
        }
        if (statsSelect) {
            statsSelect.innerHTML = '<option value="">Select a container...</option>';
            simplified.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.display;
                statsSelect.appendChild(opt);
            });
        }

        // Datalist for other inputs
        const existing = document.getElementById('container-ids-datalist');
        if (existing) existing.remove();
        if (simplified.length > 0) {
            const dl = document.createElement('datalist');
            dl.id = 'container-ids-datalist';
            simplified.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.display;
                dl.appendChild(opt);
            });
            document.body.appendChild(dl);
            const extraInputs = ['selected-container-id'];
            extraInputs.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.setAttribute('list', 'container-ids-datalist');
                    el.setAttribute('placeholder', 'Select or type container ID/name...');
                }
            });
        }
    }

    async refreshDockerNetworks() {
        const machineId = document.getElementById('docker-machine-select').value;
        if (!machineId) return;

        try {
            this.showLoading();
            const response = await fetch('/api/docker/networks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ machine_id: machineId })
            });

            const result = await response.json();

            if (result.success) {
                this.populateNetworksTable(result.output);

                // Update networks count in quick stats
                const lines = result.output.split('\n').filter(line => line.trim() && !line.startsWith('NETWORK'));
                document.getElementById('docker-networks-count').textContent = lines.length;
            } else {
                this.showDockerMessage('docker-networks', `Error: ${result.error}`);
            }
        } catch (error) {
            this.showDockerMessage('docker-networks', `Error: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    }

    populateNetworksTable(output) {
        const table = document.getElementById('docker-networks-table');
        const tbody = document.getElementById('docker-networks-tbody');
        const message = document.getElementById('docker-networks-message');

        if (!output || output.trim() === '') {
            table.style.display = 'none';
            message.style.display = 'block';
            message.textContent = 'No networks found';
            return;
        }

        const lines = output.split('\n').filter(line => line.trim());
        if (lines.length <= 1) {
            table.style.display = 'none';
            message.style.display = 'block';
            message.textContent = 'No networks found';
            return;
        }

        // Clear existing rows
        tbody.innerHTML = '';

        // Parse data (skip header)
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const parts = line.split(/\s+/);
            if (parts.length >= 4) {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td class="container-id">${this.escapeHtml(parts[0].substring(0, 12))}</td>
                    <td>${this.escapeHtml(parts[1])}</td>
                    <td>${this.escapeHtml(parts[2])}</td>
                    <td>${this.escapeHtml(parts[3])}</td>
                `;
                tbody.appendChild(row);
            }
        }

        table.style.display = 'table';
        message.style.display = 'none';
    }

    async refreshDockerVolumes() {
        const machineId = document.getElementById('docker-machine-select').value;
        if (!machineId) return;

        try {
            this.showLoading();
            const response = await fetch('/api/docker/volumes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ machine_id: machineId })
            });

            const result = await response.json();

            if (result.success) {
                this.populateVolumesTable(result.output);

                // Update volumes count in quick stats
                const lines = result.output.split('\n').filter(line => line.trim() && !line.startsWith('DRIVER'));
                document.getElementById('docker-volumes-count').textContent = lines.length;
            } else {
                this.showDockerMessage('docker-volumes', `Error: ${result.error}`);
            }
        } catch (error) {
            this.showDockerMessage('docker-volumes', `Error: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    }

    populateVolumesTable(output) {
        const table = document.getElementById('docker-volumes-table');
        const tbody = document.getElementById('docker-volumes-tbody');
        const message = document.getElementById('docker-volumes-message');

        if (!output || output.trim() === '') {
            table.style.display = 'none';
            message.style.display = 'block';
            message.textContent = 'No volumes found';
            return;
        }

        const lines = output.split('\n').filter(line => line.trim());
        if (lines.length <= 1) {
            table.style.display = 'none';
            message.style.display = 'block';
            message.textContent = 'No volumes found';
            return;
        }

        // Clear existing rows
        tbody.innerHTML = '';

        // Parse data (skip header)
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const parts = line.split(/\s+/);
            if (parts.length >= 2) {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${this.escapeHtml(parts[0])}</td>
                    <td>${this.escapeHtml(parts[1])}</td>
                `;
                tbody.appendChild(row);
            }
        }

        table.style.display = 'table';
        message.style.display = 'none';
    }

    showDockerMessage(section, text) {
        const table = document.getElementById(`${section}-table`);
        const message = document.getElementById(`${section}-message`);

        if (table) table.style.display = 'none';
        if (message) {
            message.style.display = 'block';
            message.textContent = text;
        }
    }

    async debugContainer() {
        const containerId = document.getElementById('selected-container-id').value;
        const machineId = document.getElementById('docker-machine-select').value;

        if (!containerId || !machineId) {
            this.addLog('Container ID and machine must be selected', 'error');
            return;
        }

        try {
            this.showLoading();
            this.addLog(`🔍 Debugging identifier: ${containerId}`, 'info');

            const response = await fetch('/api/docker/debug', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    machine_id: machineId,
                    identifier: containerId
                })
            });

            const result = await response.json();

            if (result.success) {
                const debug = result.debug_info;

                // Build detailed output for Live Logs display
                let debugOutput = `Container Debug Results:\n\nIdentifier: ${debug.identifier}\n`;
                debugOutput += `Is Container: ${debug.is_container ? '✅ YES' : '❌ NO'}\n`;
                debugOutput += `Is Image: ${debug.is_image ? '✅ YES' : '❌ NO'}\n\n`;

                this.addLog(`🔍 Debug Results for: ${debug.identifier}`, 'info');
                this.addLog(`📦 Is Container: ${debug.is_container ? '✅ YES' : '❌ NO'}`, 'info');
                this.addLog(`🖼️ Is Image: ${debug.is_image ? '✅ YES' : '❌ NO'}`, 'info');

                if (debug.is_container) {
                    debugOutput += `Container Status: ${debug.container_status}\n`;
                    debugOutput += `Container Name: ${debug.container_name}\n\n`;
                    this.addLog(`📊 Container Status: ${debug.container_status}`, 'info');
                    this.addLog(`🏷️ Container Name: ${debug.container_name}`, 'info');
                }

                if (debug.is_image && debug.containers_from_image.length > 0) {
                    debugOutput += `Containers from this image:\n`;
                    this.addLog(`📋 Containers from this image:`, 'info');
                    debug.containers_from_image.forEach(container => {
                        debugOutput += `  - ${container.id} (${container.name}) - ${container.status}\n`;
                        this.addLog(`   └─ ${container.id} (${container.name}) - ${container.status}`, 'info');
                    });
                    debugOutput += `\n`;
                }

                if (debug.recommendations.length > 0) {
                    debugOutput += `Recommendations:\n`;
                    this.addLog(`💡 Recommendations:`, 'info');
                    debug.recommendations.forEach(rec => {
                        debugOutput += `  - ${rec}\n`;
                        this.addLog(`   └─ ${rec}`, 'info');
                    });
                    debugOutput += `\n`;
                }

                // Additional troubleshooting
                if (!debug.is_container && !debug.is_image) {
                    debugOutput += `❌ "${debug.identifier}" is neither a valid container nor image ID\n`;
                    debugOutput += `💡 Try using 'docker ps -a' to find correct container IDs\n`;
                    debugOutput += `💡 Try using 'docker images' to find correct image IDs\n`;

                    this.addLog(`❌ "${debug.identifier}" is neither a valid container nor image ID`, 'error');
                    this.addLog(`💡 Try using 'docker ps -a' to find correct container IDs`, 'info');
                    this.addLog(`💡 Try using 'docker images' to find correct image IDs`, 'info');
                }

                // Display output in Live Logs and auto-open
                this.displayOutput('logs-content', {
                    success: true,
                    output: debugOutput
                });
                this.autoOpenLogs();

            } else {
                this.addLog(`❌ Debug failed: ${result.error}`, 'error');

                // Display error in Live Logs and auto-open
                this.displayOutput('logs-content', {
                    success: false,
                    output: `Container Debug Failed:\n\nIdentifier: ${containerId}\nStatus: Failed`,
                    error: result.error
                });
                this.autoOpenLogs();
            }
        } catch (error) {
            this.addLog(`❌ Debug error: ${error.message}`, 'error');
        } finally {
            this.hideLoading();
        }
    }

    updateContainerFilterLabel() {
        const checkbox = document.getElementById('show-all-containers');
        const label = document.getElementById('container-filter-label');
        const description = document.getElementById('container-filter-description');

        if (checkbox && label && description) {
            if (checkbox.checked) {
                label.textContent = 'Showing All Containers';
                description.textContent = '(Running & Stopped)';
            } else {
                label.textContent = 'Showing Running Containers';
                description.textContent = '(Running Only)';
            }
        }
    } handleContainerClick(event, output) {
        const clickX = event.offsetX;
        const clickY = event.offsetY;

        // Calculate which line was clicked
        const lineHeight = 16; // Approximate line height in pixels
        const lineIndex = Math.floor(clickY / lineHeight);

        const lines = output.split('\n');
        if (lineIndex > 0 && lineIndex < lines.length) {
            const clickedLine = lines[lineIndex];

            // Extract container ID (first column)
            const containerMatch = clickedLine.match(/^([a-f0-9]{12})/);
            if (containerMatch) {
                const containerId = containerMatch[1];
                this.showContainerActions(containerId);
            }
        }
    }

    showContainerActions(containerId) {
        // Validate container ID format and provide helpful feedback
        if (!containerId || containerId.length < 12) {
            this.addLog('⚠️ Invalid container ID. Please select a valid container from the list.', 'warning');
            return;
        }

        // Check if this looks like an image ID vs container ID
        if (containerId.length === 12 && /^[a-f0-9]+$/.test(containerId)) {
            this.addLog(`ℹ️ Note: "${containerId}" appears to be an image ID. For container actions, make sure you select an existing container, not an image.`, 'info');
        }

        document.getElementById('selected-container-id').value = containerId;
        document.getElementById('container-actions-panel').style.display = 'block';

        // Scroll to actions panel
        document.getElementById('container-actions-panel').scrollIntoView({
            behavior: 'smooth',
            block: 'nearest'
        });

        this.addLog(`Selected container for actions: ${containerId}`, 'info');
    }

    async containerAction(action) {
        const containerId = document.getElementById('selected-container-id').value;
        const machineId = document.getElementById('docker-machine-select').value;

        if (!containerId || !machineId) {
            this.addLog('Container ID and machine must be selected', 'error');
            return;
        }

        try {
            this.showLoading();
            this.addLog(`Starting ${action} action on container: ${containerId}`, 'info');

            const response = await fetch('/api/docker/container/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    machine_id: machineId,
                    container_id: containerId,
                    action: action,
                    force: action === 'remove', // Force remove containers
                    detached: action === 'start' // Run in detached mode for start action
                })
            });

            const result = await response.json();

            // Enhanced logging for debugging
            this.addLog(`Container ${action} response: ${JSON.stringify(result)}`, 'info');

            if (result.success) {
                let outputMsg = `Container ${action.toUpperCase()} Result:\n\nContainer ID: ${containerId}\nAction: ${action}\n`;

                if (action === 'start') {
                    this.addLog(`✅ Container started successfully: ${containerId}`, 'success');
                    outputMsg += `Status: Successfully started\n`;
                    if (result.output) {
                        this.addLog(`Output: ${result.output}`, 'info');
                        outputMsg += `\nOutput:\n${result.output}`;
                    }
                } else {
                    this.addLog(`✅ Container ${action} successful: ${containerId}`, 'success');
                    outputMsg += `Status: Successfully ${action}ed\n`;
                    if (result.output) {
                        outputMsg += `\nOutput:\n${result.output}`;
                    }
                }

                // Display output in Live Logs and auto-open
                this.displayOutput('logs-content', {
                    success: true,
                    output: outputMsg
                });
                this.autoOpenLogs();

                // Refresh containers list to show updated status
                setTimeout(() => {
                    this.refreshDockerContainers();
                }, 1000); // Small delay to allow container state to update

                // Hide actions panel for remove action
                if (action === 'remove') {
                    document.getElementById('container-actions-panel').style.display = 'none';
                }
            } else {
                const errorMsg = result.errors || result.error || 'Unknown error';
                this.addLog(`❌ Container ${action} failed: ${errorMsg}`, 'error');

                // Display error in Live Logs and auto-open
                this.displayOutput('logs-content', {
                    success: false,
                    output: `Container ${action.toUpperCase()} Failed:\n\nContainer ID: ${containerId}\nAction: ${action}\nStatus: Failed`,
                    error: errorMsg
                });
                this.autoOpenLogs();

                // Additional troubleshooting info
                if (action === 'start') {
                    this.addLog(`💡 Troubleshooting: Make sure the container ID "${containerId}" is correct and the container exists`, 'info');
                }
            }
        } catch (error) {
            this.addLog(`❌ Container ${action} error: ${error.message}`, 'error');
            console.error('Container action error:', error);
        } finally {
            this.hideLoading();
        }
    }

    async viewContainerLogs() {
        const containerId = document.getElementById('selected-container-id').value;
        const machineId = document.getElementById('docker-machine-select').value;

        if (!containerId || !machineId) return;

        try {
            this.showLoading();
            const response = await fetch('/api/docker/container/logs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    machine_id: machineId,
                    container_id: containerId,
                    tail: 100
                })
            });

            const result = await response.json();

            if (result.success) {
                // Show logs in a modal or in the logs panel
                this.displayOutput('logs-content', {
                    success: true,
                    output: `Container Logs (${containerId}):\n\n${result.output}`
                });
                this.autoOpenLogs();
            } else {
                this.addLog(`Failed to get container logs: ${result.errors || result.error}`, 'error');
            }
        } catch (error) {
            this.addLog(`Error getting container logs: ${error.message}`, 'error');
        } finally {
            this.hideLoading();
        }
    }

    async execContainerCommand() {
        const containerId = document.getElementById('selected-container-id').value;
        const command = prompt('Enter command to execute:');

        if (!command) return;

        const machineId = document.getElementById('docker-machine-select').value;

        try {
            this.showLoading();
            const response = await fetch('/api/docker/exec', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    machine_id: machineId,
                    container_id: containerId,
                    command: command,
                    interactive: false
                })
            });

            const result = await response.json();

            this.displayOutput('logs-content', {
                success: result.success,
                output: `Executed in ${containerId}: ${command}\n\n${result.output}`,
                error: result.errors
            });
            this.autoOpenLogs();
        } catch (error) {
            this.addLog(`Error executing command: ${error.message}`, 'error');
        } finally {
            this.hideLoading();
        }
    }

    async inspectContainer() {
        const containerId = document.getElementById('selected-container-id').value;
        const machineId = document.getElementById('docker-machine-select').value;

        if (!containerId || !machineId) return;

        try {
            this.showLoading();
            const response = await fetch('/api/docker/container/inspect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    machine_id: machineId,
                    container_id: containerId
                })
            });

            const result = await response.json();

            this.displayOutput('logs-content', {
                success: result.success,
                output: `Container Inspection (${containerId}):\n\n${result.output}`,
                error: result.errors
            });
            this.autoOpenLogs();
        } catch (error) {
            this.addLog(`Error inspecting container: ${error.message}`, 'error');
        } finally {
            this.hideLoading();
        }
    }

    showPullImageDialog() {
        const imageName = prompt('Enter image name to pull (e.g., nginx:latest):');
        if (imageName) {
            document.getElementById('pull-image-name').value = imageName;
            this.switchDockerTab('actions-docker');
        }
    }

    showRunContainerDialog() {
        this.switchDockerTab('actions-docker');
        document.getElementById('run-image-name').focus();
    }

    async executePullImage() {
        const imageName = document.getElementById('pull-image-name').value.trim();
        const machineId = document.getElementById('docker-machine-select').value;

        if (!imageName || !machineId) {
            this.addLog('Please enter an image name and select a machine', 'error');
            return;
        }

        try {
            this.startExecution('docker_pull');
            this.showLoading();

            const response = await fetch('/api/docker/pull', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    machine_id: machineId,
                    image_name: imageName
                })
            });

            const result = await response.json();

            this.displayOutput('logs-content', {
                success: result.success,
                output: result.output,
                error: result.errors
            });

            if (result.success) {
                this.addLog(`Successfully pulled image: ${imageName}`, 'success');
                // Refresh images list if on images tab
                if (document.querySelector('[data-tab="images-docker"]').classList.contains('active')) {
                    this.refreshDockerImages();
                } else {
                    // Always refresh images to update the run container dropdown
                    this.refreshDockerImages();
                }

                // Clear the pull image input
                document.getElementById('pull-image-name').value = '';
            } else {
                this.addLog(`Failed to pull image: ${result.errors || result.error}`, 'error');
            }
        } catch (error) {
            this.addLog(`Error pulling image: ${error.message}`, 'error');
        } finally {
            this.endExecution(true);
            this.hideLoading();
        }
    }

    async executeRunContainer() {
        const imageName = document.getElementById('run-image-name').value.trim();
        const containerName = document.getElementById('run-container-name').value.trim();
        const machineId = document.getElementById('docker-machine-select').value;

        if (!imageName || !machineId) {
            this.addLog('Please enter an image name and select a machine', 'error');
            return;
        }

        // Parse port mappings
        const portMappings = document.getElementById('run-port-mappings').value
            .split('\n')
            .map(line => line.trim())
            .filter(line => line);

        // Parse volume mappings
        const volumeMappings = document.getElementById('run-volume-mappings').value
            .split('\n')
            .map(line => line.trim())
            .filter(line => line);

        // Parse environment variables
        const envVars = document.getElementById('run-env-vars').value
            .split('\n')
            .map(line => line.trim())
            .filter(line => line);

        const additionalArgs = document.getElementById('run-additional-args').value.trim();
        const detached = document.getElementById('run-detached').checked;

        try {
            this.startExecution('docker_run');
            this.showLoading();

            const response = await fetch('/api/docker/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    machine_id: machineId,
                    image_name: imageName,
                    container_name: containerName || undefined,
                    ports: portMappings,
                    volumes: volumeMappings,
                    env_vars: envVars,
                    additional_args: additionalArgs,
                    detach: detached
                })
            });

            const result = await response.json();

            this.displayOutput('logs-content', {
                success: result.success,
                output: `${result.command}\n\n${result.output}`,
                error: result.errors
            });

            if (result.success) {
                this.addLog(`Successfully started container: ${containerName || imageName}`, 'success');
                // Refresh containers list if on containers tab
                if (document.querySelector('[data-tab="containers-docker"]').classList.contains('active')) {
                    this.refreshDockerContainers();
                } else {
                    // Always refresh containers to update the exec container dropdown
                    this.refreshDockerContainers();
                }

                // Clear form
                document.getElementById('run-container-name').value = '';
                document.getElementById('run-port-mappings').value = '';
                document.getElementById('run-volume-mappings').value = '';
                document.getElementById('run-env-vars').value = '';
                document.getElementById('run-additional-args').value = '';
            } else {
                this.addLog(`Failed to run container: ${result.errors || result.error}`, 'error');
            }
        } catch (error) {
            this.addLog(`Error running container: ${error.message}`, 'error');
        } finally {
            this.endExecution(true);
            this.hideLoading();
        }
    }

    async executeContainerCommand() {
        const containerId = document.getElementById('exec-container-id').value.trim();
        const command = document.getElementById('exec-command').value.trim();
        const interactive = document.getElementById('exec-interactive').checked;
        const machineId = document.getElementById('docker-machine-select').value;

        if (!containerId || !command || !machineId) {
            this.addLog('Please enter container ID, command, and select a machine', 'error');
            return;
        }

        try {
            this.startExecution('docker_exec');
            this.showLoading();

            const response = await fetch('/api/docker/exec', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    machine_id: machineId,
                    container_id: containerId,
                    command: command,
                    interactive: interactive
                })
            });

            const result = await response.json();

            this.displayOutput('logs-content', {
                success: result.success,
                output: `${result.command}\n\n${result.output}`,
                error: result.errors
            });

            if (result.success) {
                this.addLog(`Command executed successfully in container: ${containerId}`, 'success');

                // Clear form
                document.getElementById('exec-command').value = '';
            } else {
                this.addLog(`Failed to execute command: ${result.errors || result.error}`, 'error');
            }
        } catch (error) {
            this.addLog(`Error executing command: ${error.message}`, 'error');
        } finally {
            this.endExecution(true);
            this.hideLoading();
        }
    }

    populateContainerIds(containerLines) {
        // Extract container IDs and names from the output
        const containers = [];
        // Filter out placeholder artifacts
        const placeholder = containerLines.some(l => l.includes('{.ID}') || l.includes('{.Names}'));
        if (placeholder) {
            this.addLog('Skipping placeholder Docker entries ({.ID}) - restart backend to apply format fix.', 'warning');
            containerLines = containerLines.filter(l => !l.includes('{.ID}') && !l.includes('{.Names}'));
        }
        containerLines.forEach(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 7) {
                const containerId = parts[0];
                const containerName = parts[parts.length - 1];
                if (containerId && containerId !== 'CONTAINER') {
                    containers.push({
                        id: containerId,
                        name: containerName,
                        display: `${containerId.substring(0, 12)} (${containerName})`
                    });
                }
            }
        });

        // Populate the exec container dropdown
        const execContainerSelect = document.getElementById('exec-container-id');
        if (execContainerSelect) {
            // Clear existing options except the first one
            execContainerSelect.innerHTML = '<option value="">Select a container...</option>';

            // Add container options
            containers.forEach(container => {
                const option = document.createElement('option');
                option.value = container.id;
                option.textContent = container.display;
                execContainerSelect.appendChild(option);
            });
        }

        // Populate the stats container dropdown
        const statsContainerSelect = document.getElementById('stats-container-id');
        if (statsContainerSelect) {
            // Clear existing options except the first one
            statsContainerSelect.innerHTML = '<option value="">Select a container...</option>';

            // Add container options
            containers.forEach(container => {
                const option = document.createElement('option');
                option.value = container.id;
                option.textContent = container.display;
                statsContainerSelect.appendChild(option);
            });
        }

        // Create datalist for other container ID inputs (for backward compatibility)
        const existingDatalist = document.getElementById('container-ids-datalist');
        if (existingDatalist) {
            existingDatalist.remove();
        }

        if (containers.length > 0) {
            const datalist = document.createElement('datalist');
            datalist.id = 'container-ids-datalist';

            containers.forEach(container => {
                const option = document.createElement('option');
                option.value = container.id;
                option.textContent = container.display;
                datalist.appendChild(option);
            });

            document.body.appendChild(datalist);

            // Add datalist to other container ID inputs (only text inputs)
            const containerIdInputs = [
                'selected-container-id'
            ];

            containerIdInputs.forEach(inputId => {
                const input = document.getElementById(inputId);
                if (input) {
                    input.setAttribute('list', 'container-ids-datalist');
                    input.setAttribute('placeholder', 'Select or type container ID/name...');
                }
            });
        }
    }

    async executeContainerStats() {
        const containerId = document.getElementById('stats-container-id').value.trim();
        const machineId = document.getElementById('docker-machine-select').value;

        if (!containerId || !machineId) {
            this.addLog('Please enter container ID and select a machine', 'error');
            return;
        }

        try {
            this.startExecution('docker_stats');
            this.showLoading();

            const response = await fetch('/api/docker/stats', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    machine_id: machineId,
                    container_id: containerId
                })
            });

            const result = await response.json();

            this.displayOutput('logs-content', {
                success: result.success,
                output: `Container Statistics for ${containerId}:\n\n${result.output}`,
                error: result.errors
            });

            if (result.success) {
                this.addLog(`Retrieved statistics for container: ${containerId}`, 'success');
            } else {
                this.addLog(`Failed to get stats: ${result.errors || result.error}`, 'error');
            }
        } catch (error) {
            this.addLog(`Error getting container stats: ${error.message}`, 'error');
        } finally {
            this.endExecution(true);
            this.hideLoading();
        }
    }

    async executeDockerCompose() {
        const composeContent = document.getElementById('compose-content').value.trim();
        const detached = document.getElementById('compose-detached').checked;
        const build = document.getElementById('compose-build').checked;
        const machineId = document.getElementById('docker-machine-select').value;

        if (!composeContent) {
            this.addLog('Please enter compose file content', 'error');
            return;
        }

        if (!machineId) {
            this.addLog('Please select a machine', 'error');
            return;
        }

        try {
            this.startExecution('docker_compose');
            this.showLoading();

            const response = await fetch('/api/docker/compose/up', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    machine_id: machineId,
                    compose_content: composeContent,
                    detach: detached,
                    build: build
                })
            });

            const result = await response.json();

            this.displayOutput('logs-content', {
                success: result.success,
                output: `Docker Compose Up Result:\n\n${result.output}`,
                error: result.errors
            });

            if (result.success) {
                this.addLog(`✅ Docker compose executed successfully`, 'success');
                // Refresh containers list to show new containers
                this.refreshDockerContainers();

                // Clear the compose content after successful execution
                document.getElementById('compose-content').value = '';
            } else {
                this.addLog(`❌ Failed to run docker compose: ${result.errors || result.error}`, 'error');
            }
        } catch (error) {
            this.addLog(`Error running docker compose: ${error.message}`, 'error');
        } finally {
            this.endExecution(true);
            this.hideLoading();
        }
    }



    async executeSystemPrune() {
        const allUnused = document.getElementById('prune-all').checked;
        const volumes = document.getElementById('prune-volumes').checked;
        const containers = document.getElementById('prune-containers').checked;
        const machineId = document.getElementById('docker-machine-select').value;

        if (!machineId) {
            this.addLog('Please select a machine', 'error');
            return;
        }

        // Confirmation dialog
        let confirmMessage = `Are you sure you want to clean Docker system? This will remove:\n`;
        if (containers) {
            confirmMessage += `- All stopped/exited containers\n`;
        }
        confirmMessage += `- All networks not used by at least one container\n` +
            `- All dangling images${allUnused ? '\n- All unused images' : ''}\n` +
            `- All build cache${volumes ? '\n- All unused volumes' : ''}\n\n` +
            `This action cannot be undone!`;

        if (!confirm(confirmMessage)) {
            return;
        }

        try {
            this.startExecution('docker_prune');
            this.showLoading();

            const response = await fetch('/api/docker/system/prune', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    machine_id: machineId,
                    all: allUnused,
                    volumes: volumes,
                    containers: containers
                })
            });

            const result = await response.json();

            this.displayOutput('logs-content', {
                success: result.success,
                output: `Docker System Cleanup Result:\n\n${result.output}`,
                error: result.errors
            });

            if (result.success) {
                this.addLog('Docker system cleanup completed successfully', 'success');
                // Refresh all Docker info to show updated stats
                this.refreshDockerInfo();
                this.refreshDockerImages();
                this.refreshDockerContainers();
                this.refreshDockerVolumes();
                this.refreshDockerNetworks();
            } else {
                this.addLog(`Failed to clean system: ${result.errors || result.error}`, 'error');
            }
        } catch (error) {
            this.addLog(`Error cleaning Docker system: ${error.message}`, 'error');
        } finally {
            this.endExecution(true);
            this.hideLoading();
        }
    }

    // === DOCKER PROJECT EXECUTION METHODS ===

    async executeDockerProject() {
        const dirName = this.currentDirectories['docker'];
        if (!dirName) {
            alert('No Docker project directory selected');
            return;
        }

        const machineId = document.getElementById('docker-machine-select').value;
        const mainFile = document.getElementById('docker-main-file').value;

        // Get Docker options
        const detached = document.getElementById('docker-project-detached').checked;
        const build = document.getElementById('docker-project-build').checked;
        const forceRecreate = document.getElementById('docker-project-force-recreate').checked;
        const removeOrphans = document.getElementById('docker-project-remove-orphans').checked;

        if (!machineId) {
            alert('Please select a machine');
            return;
        }

        try {
            this.startExecution('docker_project_up');
            this.showLoading();

            // Show starting notification
            this.showNotification(`Starting Docker project: ${dirName}`, 'info', 4000);

            const payload = {
                directory_name: dirName,
                compose_file: mainFile || null,
                machine_id: machineId,
                detach: detached,
                build: build,
                force_recreate: forceRecreate,
                remove_orphans: removeOrphans,
                action: 'up'
            };

            const response = await fetch('/api/docker/project/execute', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            this.displayOutput('logs-content', {
                success: result.success,
                output: `Docker Project Up Result:\n\nProject: ${dirName}${mainFile ? ` (compose: ${mainFile})` : ''}\nAction: ${result.action || 'up'}\n\n${result.output || 'No output'}`,
                error: result.error
            });

            if (result.success) {
                this.addLog(`🐳 Docker project started successfully: ${dirName}`, 'success');
                this.addLog(`📁 Project: ${dirName}${mainFile ? ` (compose: ${mainFile})` : ''}`, 'info');
                this.addLog(`📋 Action: ${result.action}`, 'info');
                if (result.output) {
                    this.addLog(`✅ Output: ${result.output}`, 'info');
                }

                // Show success notification
                this.showNotification(`Docker project started successfully: ${dirName}`, 'success', 6000);
            } else {
                this.addLog(`❌ Failed to start Docker project: ${result.error}`, 'error');
                alert(`Failed to start Docker project: ${result.error}`);

                // Show error notification
                this.showNotification(`Failed to start Docker project: ${result.error}`, 'error', 8000);
            }

        } catch (error) {
            this.addLog(`❌ Error starting Docker project: ${error.message}`, 'error');
            alert(`Failed to start Docker project: ${error.message}`);

            // Show error notification
            this.showNotification(`Error starting Docker project: ${error.message}`, 'error', 8000);
        } finally {
            this.endExecution(true);
            this.hideLoading();
        }
    }

    async executeDockerProjectAction(action) {
        const dirName = this.currentDirectories['docker'];
        if (!dirName) {
            alert('No Docker project directory selected');
            return;
        }

        const machineId = document.getElementById('docker-machine-select').value;
        const mainFile = document.getElementById('docker-main-file').value;

        // Get Docker options
        const detached = document.getElementById('docker-project-detached').checked;
        const build = document.getElementById('docker-project-build').checked;
        const forceRecreate = document.getElementById('docker-project-force-recreate').checked;
        const removeOrphans = document.getElementById('docker-project-remove-orphans').checked;

        if (!machineId) {
            alert('Please select a machine');
            return;
        }

        try {
            this.startExecution(`docker_project_${action}`);
            this.showLoading();

            // Show starting notification
            this.showNotification(`Starting Docker project ${action}: ${dirName}`, 'info', 4000);

            const payload = {
                directory_name: dirName,
                compose_file: mainFile || null,
                machine_id: machineId,
                detach: detached,
                build: build,
                force_recreate: forceRecreate,
                remove_orphans: removeOrphans,
                action: action
            };

            const response = await fetch('/api/docker/project/execute', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            this.displayOutput('logs-content', {
                success: result.success,
                output: `Docker Project ${action.toUpperCase()} Result:\n\nProject: ${dirName}${mainFile ? ` (compose: ${mainFile})` : ''}\nAction: ${result.action || action}\n\n${result.output || 'No output'}`,
                error: result.error
            });

            if (result.success) {
                this.addLog(`🐳 Docker project ${action} completed: ${dirName}`, 'success');
                this.addLog(`📁 Project: ${dirName}${mainFile ? ` (compose: ${mainFile})` : ''}`, 'info');
                this.addLog(`📋 Action: ${result.action}`, 'info');
                if (result.output) {
                    this.addLog(`✅ Output: ${result.output}`, 'info');
                }

                // Show success notification
                this.showNotification(`Docker project ${action} completed successfully: ${dirName}`, 'success', 6000);
            } else {
                this.addLog(`❌ Failed to ${action} Docker project: ${result.error}`, 'error');
                alert(`Failed to ${action} Docker project: ${result.error}`);

                // Show error notification
                this.showNotification(`Failed to ${action} Docker project: ${result.error}`, 'error', 8000);
            }

        } catch (error) {
            this.addLog(`❌ Error executing Docker ${action}: ${error.message}`, 'error');
            alert(`Failed to execute Docker ${action}: ${error.message}`);

            // Show error notification
            this.showNotification(`Error executing Docker ${action}: ${error.message}`, 'error', 8000);
        } finally {
            this.endExecution(true);
            this.hideLoading();
        }
    }

    async detectDockerMainFile() {
        const dirName = this.currentDirectories['docker'];
        if (!dirName) {
            alert('No Docker directory selected');
            return;
        }

        try {
            const response = await fetch(`/api/directories/docker/${dirName}`);
            if (!response.ok) {
                throw new Error('Failed to load directory files');
            }

            const data = await response.json();
            const files = data.files;

            // Look for docker-compose files first (higher priority)
            const composeFiles = files.filter(file =>
                file.name.match(/^(docker-)?compose\.(yml|yaml)$/i)
            );

            if (composeFiles.length > 0) {
                const mainFileSelect = document.getElementById('docker-main-file');
                if (mainFileSelect) {
                    for (let option of mainFileSelect.options) {
                        if (option.value === composeFiles[0].name) {
                            option.selected = true;
                            break;
                        }
                    }
                }
                this.addLog(`🔍 Auto-detected Docker Compose file: ${composeFiles[0].name}`, 'info');
                return;
            }

            // Look for Dockerfile
            const dockerfiles = files.filter(file =>
                file.name.match(/^dockerfile$/i) || file.name.startsWith('Dockerfile')
            );

            if (dockerfiles.length > 0) {
                const mainFileSelect = document.getElementById('docker-main-file');
                if (mainFileSelect) {
                    for (let option of mainFileSelect.options) {
                        if (option.value === dockerfiles[0].name) {
                            option.selected = true;
                            break;
                        }
                    }
                }
                this.addLog(`🔍 Auto-detected Dockerfile: ${dockerfiles[0].name}`, 'info');
                return;
            }

            this.addLog(`⚠️ No Docker Compose file or Dockerfile found in project`, 'warning');
            alert('No Docker Compose file or Dockerfile found in the project directory');

        } catch (error) {
            this.addLog(`❌ Error detecting Docker main file: ${error.message}`, 'error');
            alert(`Failed to detect Docker main file: ${error.message}`);
        }
    }

    // === OVERVIEW METHODS ===

    async refreshPythonOverview(forceRefresh = false) {
        const machineId = document.getElementById('python-machine-select').value;
        if (!machineId) {
            this.resetPythonOverview();
            return;
        }

        try {
            this.showLoading();

            const response = await fetch('/api/python/overview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    machine_id: machineId,
                    force_refresh: forceRefresh
                })
            });

            const result = await response.json();

            if (result.success) {
                this.displayPythonOverview(result.overview);
            } else {
                this.resetPythonOverview(`Error: ${result.error}`);
            }
        } catch (error) {
            this.resetPythonOverview(`Error: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    }

    displayPythonOverview(overview) {
        const container = document.getElementById('python-overview-content');
        if (!container) return;

        container.innerHTML = `
            <div class="enterprise-overview-panel">
                <div class="overview-header">
                    <div class="status-primary">
                        <div class="tech-brand">
                            <i class="fab fa-python"></i>
                            <span class="brand-text">Python Environment</span>
                        </div>
                        <div class="version-badge">${this.escapeHtml(overview.python_version || 'Not installed')}</div>
                    </div>
                    <div class="health-indicator ${overview.python_version !== 'Not installed' ? 'healthy' : 'unhealthy'}">
                        <div class="health-dot"></div>
                        <span class="health-text">${overview.python_version !== 'Not installed' ? 'Available' : 'Not Available'}</span>
                    </div>
                </div>

                <div class="metrics-dashboard">
                    <div class="metric-card primary">
                        <div class="metric-icon">
                            <i class="fas fa-cube"></i>
                        </div>
                        <div class="metric-content">
                            <div class="metric-value">${overview.installed_packages || 0}</div>
                            <div class="metric-label">Installed Packages</div>
                        </div>
                    </div>
                    
                    <div class="metric-card secondary">
                        <div class="metric-icon">
                            <i class="fas fa-layer-group"></i>
                        </div>
                        <div class="metric-content">
                            <div class="metric-value">${overview.virtualenv_support || 'Unknown'}</div>
                            <div class="metric-label">Virtual Environment</div>
                        </div>
                    </div>
                    
                    <div class="metric-card tertiary">
                        <div class="metric-icon">
                            <i class="fas fa-download"></i>
                        </div>
                        <div class="metric-content">
                            <div class="metric-value">${overview.pip_version ? 'Available' : 'Not Available'}</div>
                            <div class="metric-label">Package Manager</div>
                        </div>
                    </div>
                    
                    <div class="metric-card quaternary">
                        <div class="metric-icon">
                            <i class="fas fa-microchip"></i>
                        </div>
                        <div class="metric-content">
                            <div class="metric-value">${overview.architecture || 'Unknown'}</div>
                            <div class="metric-label">Architecture</div>
                        </div>
                    </div>
                </div>

                <div class="system-info-grid">
                    <div class="info-section">
                        <div class="section-header">
                            <i class="fab fa-python" style="color: #fff"></i>
                            <span style="color: #fff">Python Details</span>
                        </div>
                        <div class="info-items">
                            <div class="info-row">
                                <span class="info-key">Python Version</span>
                                <span class="info-value">${this.escapeHtml(overview.python_version || 'None')}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-key">Python Path</span>
                                <span class="info-value">${this.escapeHtml(overview.python_path || 'None')}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-key">Pip Version</span>
                                <span class="info-value">${this.escapeHtml(overview.pip_version || 'None')}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="info-section">
                        <div class="section-header">
                            <i class="fas fa-cogs" style="color: #fff"></i>
                            <span style="color: #fff">Environment Support</span>
                        </div>
                        <div class="info-items">
                            <div class="info-row">
                                <span class="info-key">Virtual Environment</span>
                                <span class="info-value">${this.escapeHtml(overview.virtualenv_support || 'None')}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-key">System Architecture</span>
                                <span class="info-value">${this.escapeHtml(overview.architecture || 'None')}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-key">Package Count</span>
                                <span class="info-value">${overview.installed_packages || 'None'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    resetPythonOverview(message = 'Select a machine to view Python environment information') {
        const container = document.getElementById('python-overview-content');
        if (!container) return;

        container.innerHTML = `
            <div class="info-placeholder">
                <i class="fab fa-python"></i>
                <p>${message}</p>
            </div>
        `;
    }

    async refreshAnsibleOverview(forceRefresh = false) {
        const machineId = document.getElementById('ansible-machine-select').value;
        if (!machineId) {
            this.resetAnsibleOverview();
            return;
        }

        try {
            this.showLoading();

            const response = await fetch('/api/ansible/overview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    machine_id: machineId,
                    force_refresh: forceRefresh
                })
            });

            const result = await response.json();

            if (result.success) {
                this.displayAnsibleOverview(result.overview);
            } else {
                this.resetAnsibleOverview(`Error: ${result.error}`);
            }
        } catch (error) {
            this.resetAnsibleOverview(`Error: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    }

    displayAnsibleOverview(overview) {
        const container = document.getElementById('ansible-overview-content');
        if (!container) return;

        const isInstalled = overview.ansible_version !== 'Not installed';

        container.innerHTML = `
            <div class="enterprise-overview-panel">
                <div class="overview-header">
                    <div class="status-primary">
                        <div class="tech-brand">
                            <i class="fas fa-cogs"></i>
                            <span class="brand-text">Ansible Environment</span>
                        </div>
                        <div class="version-badge">${this.escapeHtml(overview.ansible_version || 'Not installed')}</div>
                    </div>
                    <div class="health-indicator ${isInstalled ? 'healthy' : 'unhealthy'}">
                        <div class="health-dot"></div>
                        <span class="health-text">${isInstalled ? 'Available' : 'Not Available'}</span>
                    </div>
                </div>

                <div class="metrics-dashboard">
                    <div class="metric-card primary">
                        <div class="metric-icon">
                            <i class="fas fa-play-circle"></i>
                        </div>
                        <div class="metric-content">
                            <div class="metric-value">${overview.playbook_available || 'None'}</div>
                            <div class="metric-label">Playbook Support</div>
                        </div>
                    </div>
                    
                    <div class="metric-card secondary">
                        <div class="metric-icon">
                            <i class="fas fa-star"></i>
                        </div>
                        <div class="metric-content">
                            <div class="metric-value">${overview.galaxy_available || 'None'}</div>
                            <div class="metric-label">Galaxy Support</div>
                        </div>
                    </div>
                    
                    <div class="metric-card tertiary">
                        <div class="metric-icon">
                            <i class="fas fa-shield-alt"></i>
                        </div>
                        <div class="metric-content">
                            <div class="metric-value">${overview.vault_available || 'None'}</div>
                            <div class="metric-label">Vault Support</div>
                        </div>
                    </div>
                    
                    <div class="metric-card quaternary">
                        <div class="metric-icon">
                            <i class="fas fa-cube"></i>
                        </div>
                        <div class="metric-content">
                            <div class="metric-value">${overview.installed_collections || 0}</div>
                            <div class="metric-label">Collections</div>
                        </div>
                    </div>
                </div>

                <div class="system-info-grid">
                    <div class="info-section">
                        <div class="section-header">
                            <i class="fas fa-cogs" style="color: #fff"></i>
                            <span style="color: #fff">Ansible Details</span>
                        </div>
                        <div class="info-items">
                            <div class="info-row">
                                <span class="info-key">Ansible Version</span>
                                <span class="info-value">${this.escapeHtml(overview.ansible_version || 'None')}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-key">Core Version</span>
                                <span class="info-value">${this.escapeHtml(overview.ansible_core_version || 'None')}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-key">Config File</span>
                                <span class="info-value">${this.escapeHtml(overview.config_file || 'None')}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-key">Python Version</span>
                                <span class="info-value">${this.escapeHtml(overview.python_version || 'None')}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="info-section">
                        <div class="section-header">
                            <i class="fas fa-tools" style="color: #fff"></i>
                            <span style="color: #fff">Available Tools</span>
                        </div>
                        <div class="info-items">
                            <div class="info-row">
                                <span class="info-key">Executable Location</span>
                                <span class="info-value">${this.escapeHtml(overview.executable_location || 'None')}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-key">Playbook Available</span>
                                <span class="info-value">${this.escapeHtml(overview.playbook_available || 'None')}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-key">Galaxy Available</span>
                                <span class="info-value">${this.escapeHtml(overview.galaxy_available || 'None')}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-key">Vault Available</span>
                                <span class="info-value">${this.escapeHtml(overview.vault_available || 'None')}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    resetAnsibleOverview(message = 'Select a machine to view Ansible environment information') {
        const container = document.getElementById('ansible-overview-content');
        if (!container) return;

        container.innerHTML = `
            <div class="info-placeholder">
                <i class="fas fa-cogs"></i>
                <p>${message}</p>
            </div>
        `;
    }

    async refreshTerraformOverview(forceRefresh = false) {
        let machineId = document.getElementById('terraform-machine-select').value;
        if (machineId === 'local') {
            // Backward compatibility mapping
            machineId = 'localhost';
            document.getElementById('terraform-machine-select').value = 'localhost';
        }
        if (!machineId) {
            this.resetTerraformOverview();
            return;
        }

        try {
            this.showLoading();

            const response = await fetch('/api/terraform/overview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    machine_id: machineId,
                    force_refresh: forceRefresh
                })
            });

            const result = await response.json();

            if (result.success) {
                this.displayTerraformOverview(result.overview);
            } else {
                this.resetTerraformOverview(`Error: ${result.error}`);
            }
        } catch (error) {
            this.resetTerraformOverview(`Error: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    }

    displayTerraformOverview(overview) {
        let container = document.getElementById('terraform-overview-content');
        if (!container) {
            const overviewTab = document.getElementById('overview-terraform-tab');
            if (overviewTab) {
                container = document.createElement('div');
                container.id = 'terraform-overview-content';
                overviewTab.appendChild(container);
            } else {
                console.warn('Terraform overview container not found');
                return;
            }
        }

        const isInstalled = overview.terraform_version !== 'Not installed';
        const additionalTools = overview.additional_tools || {};
        const availableToolsCount = Object.values(additionalTools).filter(status => status === 'Available').length;

        container.innerHTML = `
            <div class="enterprise-overview-panel">
                <div class="overview-header">
                    <div class="status-primary">
                        <div class="tech-brand">
                            <i class="fas fa-cloud"></i>
                            <span class="brand-text">Terraform Environment</span>
                        </div>
                        <div class="version-badge">${this.escapeHtml(overview.terraform_version || 'Not installed')}</div>
                    </div>
                    <div class="health-indicator ${isInstalled ? 'healthy' : 'unhealthy'}">
                        <div class="health-dot"></div>
                        <span class="health-text">${isInstalled ? 'Available' : 'Not Available'}</span>
                    </div>
                </div>

                <div class="metrics-dashboard">
                    <div class="metric-card primary">
                        <div class="metric-icon">
                            <i class="fas fa-layer-group"></i>
                        </div>
                        <div class="metric-content">
                            <div class="metric-value">${Object.keys(overview.provider_versions || {}).length}</div>
                            <div class="metric-label">Providers</div>
                        </div>
                    </div>
                    
                    <div class="metric-card secondary">
                        <div class="metric-icon">
                            <i class="fas fa-workspace"></i>
                        </div>
                        <div class="metric-content">
                            <div class="metric-value">${this.escapeHtml(overview.current_workspace || 'default')}</div>
                            <div class="metric-label">Current Workspace</div>
                        </div>
                    </div>
                    
                    <div class="metric-card tertiary">
                        <div class="metric-icon">
                            <i class="fas fa-cloud"></i>
                        </div>
                        <div class="metric-content">
                            <div class="metric-value">${overview.cloud_cli_available || 'None'}</div>
                            <div class="metric-label">Cloud CLI</div>
                        </div>
                    </div>
                    
                    <div class="metric-card quaternary">
                        <div class="metric-icon">
                            <i class="fas fa-tools"></i>
                        </div>
                        <div class="metric-content">
                            <div class="metric-value">${availableToolsCount}</div>
                            <div class="metric-label">Additional Tools</div>
                        </div>
                    </div>
                </div>

                <div class="system-info-grid">
                    <div class="info-section">
                        <div class="section-header">
                            <i class="fas fa-cloud" style="color: #fff"></i>
                            <span style="color: #fff">Terraform Details</span>
                        </div>
                        <div class="info-items">
                            <div class="info-row">
                                <span class="info-key">Terraform Version</span>
                                <span class="info-value">${this.escapeHtml(overview.terraform_version || 'None')}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-key">Platform</span>
                                <span class="info-value">${this.escapeHtml(overview.platform || 'None')}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-key">Architecture</span>
                                <span class="info-value">${this.escapeHtml(overview.architecture || 'None')}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-key">Current Workspace</span>
                                <span class="info-value">${this.escapeHtml(overview.current_workspace || 'None')}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="info-section">
                        <div class="section-header">
                            <i class="fas fa-tools" style="color: #fff"></i>
                            <span style="color: #fff">Additional Tools</span>
                        </div>
                        <div class="info-items">
                            ${Object.entries(additionalTools).map(([tool, status]) => `
                                <div class="info-row">
                                    <span class="info-key">${this.escapeHtml(tool)}</span>
                                    <span class="info-value ${status === 'Available' ? 'status-available' : 'status-unavailable'}">${this.escapeHtml(status)}</span>
                                </div>
                            `).join('')}
                            ${Object.keys(additionalTools).length === 0 ? `
                                <div class="info-row">
                                    <span class="info-key">No additional tools detected</span>
                                    <span class="info-value">None</span>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
                
                ${Object.keys(overview.provider_versions || {}).length > 0 ? `
                <div class="system-info-grid">
                    <div class="info-section full-width">
                        <div class="section-header">
                            <i class="fas fa-plug" style="color: #fff"></i>
                            <span style="color: #fff">Installed Providers</span>
                        </div>
                        <div class="info-items">
                            ${Object.entries(overview.provider_versions || {}).map(([provider, status]) => `
                                <div class="info-row">
                                    <span class="info-key">${this.escapeHtml(provider)}</span>
                                    <span class="info-value">${this.escapeHtml(status)}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
                ` : ''}
            </div>
        `;
    }

    resetTerraformOverview(message = 'Select a machine to view Terraform environment information') {
        const container = document.getElementById('terraform-overview-content');
        if (!container) return;

        container.innerHTML = `
            <div class="info-placeholder">
                <i class="fas fa-cloud"></i>
                <p>${message}</p>
            </div>
        `;
    }

    async refreshMachineOSInfo(machineId) {
        try {
            const response = await fetch('/api/machine/os-info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ machine_id: machineId })
            });

            const result = await response.json();

            if (result.success) {
                return result.os_info;
            } else {
                console.error('Failed to get OS info:', result.error);
                return null;
            }
        } catch (error) {
            console.error('Error getting machine OS info:', error);
            return null;
        }
    }

}

// Initialize the application
const app = new RemoteRunApp();
// Activity Indicator Enhancements
(function () {
    const indicator = document.getElementById('activity-indicator');
    const popup = document.getElementById('activity-popup');
    const closeBtn = document.getElementById('close-activity-popup');
    if (!indicator) return;

    // Extend app with activity tracking if not already
    if (!app._activity) {
        app._activity = { count: 0, operations: {} };
        app._nextOpId = 1;
        app._activityRoot = document.getElementById('activity-operations-list');
        app._activityIndicator = indicator;
        app._activityPopup = popup;
        app._renderActivity = function () {
            const count = Object.values(app._activity.operations).filter(o => !o.completed).length;
            app._activity.count = count;
            indicator.querySelector('.activity-count').textContent = count;
            if (count > 0) { indicator.classList.add('active'); } else { indicator.classList.remove('active'); }
            if (app._activityRoot) {
                const ops = Object.values(app._activity.operations).sort((a, b) => b.started - a.started);
                if (ops.length === 0) {
                    app._activityRoot.innerHTML = '<div class="activity-empty">No active operations</div>';
                } else {
                    app._activityRoot.innerHTML = ops.map(op => {
                        const cls = ['activity-item', op.type, op.completed ? (op.success ? 'completed' : 'failed') : ''].join(' ');
                        const icon = op.icon || 'fa-spinner fa-spin';
                        const status = op.completed ? (op.success ? 'done' : 'failed') : 'running';
                        return `<div class="${cls}" data-id="${op.id}">\n <div class="activity-icon"><i class="fas ${icon}"></i></div>\n <div class="activity-details">\n   <div class="activity-title">${op.title}<span class="activity-status-badge">${status}</span></div>\n   <div class="activity-meta"><span>${op.category}</span><span>${op.started.toLocaleTimeString()}</span></div>\n   ${op.completed ? '' : '<div class="activity-progress-bar-wrapper"><div class="activity-progress-bar"></div></div>'}\n </div>\n</div>`;
                    }).join('');
                }
            }
        };
        app._incrementActivity = function (category, meta) {
            const id = app._nextOpId++;
            const map = { command: 'terminal', python: 'python', ansible: 'cogs', terraform: 'cloud', docker: 'docker' };
            const icon = 'fa-' + (map[category] || 'spinner fa-spin');
            app._activity.operations[id] = { id, category: category || 'generic', title: meta?.title || 'Processing', type: category || 'generic', icon, started: new Date(), completed: false, success: false };
            app._renderActivity();
            return id;
        };
        app._decrementActivity = function (id, success = true) {
            if (id) {
                const op = app._activity.operations[id];
                if (op) { op.completed = true; op.success = success; }
            } else {
                // fallback generic decrement: complete the oldest running
                const running = Object.values(app._activity.operations).filter(o => !o.completed).sort((a, b) => a.started - b.started)[0];
                if (running) { running.completed = true; running.success = success; }
            }
            app._renderActivity();
            // Auto hide popup if no active operations
            if (app._activity.count === 0) { popup.classList.remove('show'); }
        };
    }

    // Click: navigate to Dashboard then toggle popup
    indicator.addEventListener('click', () => {
        try { app.switchSection('dashboard'); } catch (e) { }
        // slight delay ensures dashboard DOM becomes active
        setTimeout(() => { popup.classList.toggle('show'); }, 50);
    });
    closeBtn?.addEventListener('click', () => popup.classList.remove('show'));

    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!popup.contains(e.target) && !indicator.contains(e.target)) {
            popup.classList.remove('show');
        }
    });
})();

// Handle page visibility change to manage connections
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (app.websocket && app.websocket.readyState === WebSocket.OPEN) {
            app.websocket.close();
        }
    } else {
        if (!app.websocket || app.websocket.readyState === WebSocket.CLOSED) {
            if (!app.socket || !app.socket.connected) {
                app.setupWebSocket();
            }
        }
    }
});

// Handle window resize for responsive design
window.addEventListener('resize', () => {
    if (window.innerWidth <= 768) {
        const logsPanel = document.getElementById('logs-panel');
        const logsContent = document.getElementById('logs-content');
        logsContent.style.height = Math.min(200, window.innerHeight * 0.3) + 'px';
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Enter to execute current action
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();

        const currentSection = app.currentSection;

        switch (currentSection) {
            case 'commands':
                document.getElementById('execute-command-btn').click();
                break;
            case 'python':
                this.runPythonScript();
                break;
            case 'ansible':
                this.runAnsible();
                break;
            case 'terraform':
                document.getElementById('terraform-apply-btn').click();
                break;
        }
    }

    // Escape to close modals
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal.show').forEach(modal => {
            app.hideModal(modal.id);
        });
    }

    // Ctrl/Cmd + S to save current editor content
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();

        const currentSection = app.currentSection;

        switch (currentSection) {
            case 'python':
                const pythonTab = document.querySelector('#python-section .tab-btn.active').dataset.tab;
                if (pythonTab === 'editor') {
                    document.getElementById('save-python-btn').click();
                }
                break;
            case 'ansible':
                // Determine mode based on active main tab instead of mode buttons
                const activeMainTab = document.querySelector('#ansible-section .tab-btn.active').dataset.tab;
                const ansibleMode = activeMainTab === 'adhoc-ansible' ? 'adhoc' : 'playbook';
                if (ansibleMode === 'playbook') {
                    const ansibleTab = document.querySelector('#ansible-section .tab-btn.active').dataset.tab;
                    if (ansibleTab === 'editor-ansible') {
                        document.getElementById('save-ansible-editor-btn').click();
                    }
                }
                break;
            case 'terraform':
                const terraformTab = document.querySelector('#terraform-section .tab-btn.active').dataset.tab;
                if (terraformTab === 'editor-tf') {
                    document.getElementById('save-terraform-btn').click();
                }
                break;
        }
    }
});

// Auto-save functionality for editors
let autoSaveTimeout;
document.querySelectorAll('.code-editor').forEach(editor => {
    editor.addEventListener('input', () => {
        clearTimeout(autoSaveTimeout);
        autoSaveTimeout = setTimeout(() => {
            // Auto-save to localStorage as backup
            const editorId = editor.id;
            const content = editor.value;
            localStorage.setItem(`autosave_${editorId}`, content);
            console.log(`Auto-saved ${editorId} to localStorage`);
        }, 5000);
    });
});

// Load auto-saved content on page load
window.addEventListener('load', () => {
    ['python-editor', 'ansible-editor', 'terraform-editor'].forEach(editorId => {
        const savedContent = localStorage.getItem(`autosave_${editorId}`);
        if (savedContent) {
            const editor = document.getElementById(editorId);
            if (editor && !editor.value) {
                editor.value = savedContent;
                app.updateLineNumbers(editorId);
                console.log(`Restored auto-saved content for ${editorId}`);
            }
        }
    });
});