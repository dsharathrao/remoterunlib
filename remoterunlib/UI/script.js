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
        this.startPingInterval();

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

        // Ansible Ad-hoc buttons
        const runAnsibleAdhocBtn = document.getElementById('run-ansible-adhoc-btn');
        if (runAnsibleAdhocBtn) {
            runAnsibleAdhocBtn.addEventListener('click', () => this.runAnsible());
        }

        const clearAnsibleAdhocBtn = document.getElementById('clear-ansible-adhoc-btn');
        if (clearAnsibleAdhocBtn) {
            clearAnsibleAdhocBtn.addEventListener('click', () => this.clearAnsible());
        }

        // Terraform Upload buttons
        const runTerraformUploadBtn = document.getElementById('run-terraform-upload-btn');
        if (runTerraformUploadBtn) {
            runTerraformUploadBtn.addEventListener('click', () => this.runTerraform('plan'));
        }

        const clearTerraformUploadBtn = document.getElementById('clear-terraform-upload-btn');
        if (clearTerraformUploadBtn) {
            clearTerraformUploadBtn.addEventListener('click', () => this.clearTerraform());
        }

        // Add event listeners for Terraform action buttons
        const terraformInitBtn = document.getElementById('terraform-init-btn');
        if (terraformInitBtn) {
            terraformInitBtn.addEventListener('click', () => this.runTerraform('init'));
        }

        const terraformPlanBtn = document.getElementById('terraform-plan-btn');
        if (terraformPlanBtn) {
            terraformPlanBtn.addEventListener('click', () => this.runTerraform('plan'));
        }

        const terraformApplyBtn = document.getElementById('terraform-apply-btn');
        if (terraformApplyBtn) {
            terraformApplyBtn.addEventListener('click', () => this.runTerraform('apply'));
        }

        // Fix: Add event listeners for Ansible mode toggle buttons
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                document.querySelectorAll('.mode-content').forEach(content => content.classList.remove('active'));
                const mode = e.currentTarget.dataset.mode;
                document.getElementById(`${mode}-mode`).classList.add('active');
            });
        });

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

        // Initialize auto-logs behavior
        this.initAutoLogsManagement();
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
            `;
            // Store execution id for click
            div.dataset.execId = item.id;
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
            content += `# RemoteRunLib Enterprise Edition\n`;
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
            filename = `RemoteRunLib_${machineIdentifier}_${executionType}_OUTPUT_${statusSuffix}_${timestamp}.txt`;
        } else if (type === 'logs') {
            content = `# Execution Logs Report\n`;
            content += `# Generated: ${new Date().toLocaleString()}\n`;
            content += `# RemoteRunLib Enterprise Edition\n`;
            content += `${'='.repeat(60)}\n\n`;
            content += `Machine: ${executionInfo.machine}\n`;
            content += `Type: ${executionInfo.type}\n`;
            content += `Status: ${executionInfo.status}\n`;
            content += `Started: ${executionInfo.started}\n`;
            content += `Completed: ${executionInfo.completed}\n`;
            content += `Duration: ${executionInfo.duration}\n`;
            content += `\n${'='.repeat(60)}\n`;
            content += `# EXECUTION LOGS:\n${'='.repeat(60)}\n${this.currentExecutionData.logs || 'No logs available'}`;
            filename = `RemoteRunLib_${machineIdentifier}_${executionType}_LOGS_${statusSuffix}_${timestamp}.txt`;
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
        // Ping all machines every 2 minutes
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
            this.pingAllMachines();
        }, 5 * 60000); // 300,000 ms = 5 minutes
    }

    async pingAllMachines() {
        for (const machine of this.machines) {
            this.pingMachine(machine.id);
        }
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
                this.socket = io('/ws', { transports: ['websocket'] });

                this.socket.on('connect', () => {
                    this.addLog('Connected to live logs via Socket.IO', 'success');
                });

                this.socket.on('log', (data) => {
                    this.addLog(data.message, data.level || 'info');
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
                }
            });
        });
    }

    setupCodeEditors() {
        // Setup line numbers and enhanced functionality for code editors
        const editors = ['python-editor', 'ansible-editor', 'terraform-editor'];

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
            terraform: 'Terraform'
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
        }

        // Load existing files when switching to script sections
        if (section === 'python') {
            this.loadExistingFiles('python');
        } else if (section === 'ansible') {
            this.loadExistingFiles('ansible');
        } else if (section === 'terraform') {
            this.loadExistingFiles('terraform');
        }

        this.currentSection = section;

        // Dashboard reload
        if (section === 'dashboard') {
            this.loadDashboardStats();
            this.loadDashboardHistory();
            this.populateDashboardMachineFilter();
        }
    }

    async loadMachines() {
        try {
            const response = await fetch('/api/machines');
            if (response.ok) {
                this.machines = await response.json();
                this.renderMachines();
                this.populateMachineSelects();
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
        });
    }

    populateMachineSelects() {
        const selects = [
            'command-machine-select',
            'python-machine-select',
            'ansible-machine-select',
            'terraform-machine-select'
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

            // Add Local option for Terraform
            if (selectId === 'terraform-machine-select') {
                const localOption = document.createElement('option');
                localOption.value = 'local';
                localOption.textContent = 'Local (Dashboard Host)';
                select.appendChild(localOption);
            }

            this.machines.forEach(machine => {
                const option = document.createElement('option');
                option.value = machine.id;
                option.textContent = `${machine.name} (${machine.host})`;
                select.appendChild(option);
            });

            // Restore previous selection if the machine still exists or is 'local'
            if (selectId === 'terraform-machine-select' && (!prevValue || prevValue === 'local')) {
                // Default to Local for Terraform
                select.value = 'local';
            } else if (prevValue && (prevValue === 'local' || this.machines.some(m => m.id === prevValue))) {
                select.value = prevValue;
            } else {
                // Set to empty (default option) for non-terraform or Local for terraform
                select.value = selectId === 'terraform-machine-select' ? 'local' : '';
            }
        });
    } async saveMachine() {
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

        this.showLoading();

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
        this.showLoading();
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

    async executeCommand() {
        const machineId = document.getElementById('command-machine-select').value;
        const command = document.getElementById('command-input').value;
        const timeout = document.getElementById('command-timeout').value;

        if (!machineId || !command) {
            alert('Please select a machine and enter a command');
            return;
        }

        this.startExecution('command');
        this.showLoading();

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
                this.addLog(`Command executed successfully`, 'success');
                this.addLog(`Output: ${result.output}`, 'info');
                this.endExecution(true);
            } else {
                this.addLog(`Command failed: ${result.message}`, 'error');
                this.endExecution(false);
            }
            // Refresh dashboard stats and history after execution
            this.loadDashboardStats();
            this.loadDashboardHistory();
        } catch (error) {
            this.addLog('Failed to execute command', 'error');
            this.endExecution(false);
        } finally {
            this.hideLoading();
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

        if (activeTab === 'editor') {
            scriptContent = document.getElementById('python-editor').value;
            filename = document.getElementById('python-filename').value || 'script.py';
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

        this.startExecution('python');
        this.showLoading();

        try {
            const response = await fetch('/api/run-python', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    machine_id: machineId,
                    script_content: scriptContent,
                    filename: filename
                })
            });

            const result = await response.json();

            if (result.success) {
                this.addLog(`Python script executed successfully`, 'success');
                this.addLog(`Output: ${result.output}`, 'info');
                this.endExecution(true);
            } else {
                this.addLog(`Python script failed: ${result.message || 'Unknown error'}`, 'error');
                alert('Failed to run Python script: ' + (result.message || 'Unknown error'));
                this.endExecution(false);
            }
        } catch (error) {
            this.addLog('Failed to run Python script: ' + (error.message || error), 'error');
            alert('Failed to run Python script: ' + (error.message || error));
            this.endExecution(false);
        } finally {
            this.hideLoading();
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

    switchAnsibleMode(mode) {
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-mode="${mode}"]`).classList.add('active');

        document.querySelectorAll('.mode-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${mode}-mode`).classList.add('active');
    }

    async runAnsible() {
        const machineId = document.getElementById('ansible-machine-select').value;

        if (!machineId) {
            alert('Please select a machine');
            return;
        }

        const activeMode = document.querySelector('.mode-btn.active').dataset.mode;
        let payload = { machine_id: machineId, mode: activeMode };

        if (activeMode === 'adhoc') {
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

        this.startExecution(`ansible-${activeMode}`);
        this.showLoading();

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
                this.addLog(`Ansible ${activeMode} executed successfully`, 'success');
                // Pretty print output if it's an object
                if (typeof result.output === 'object') {
                    this.addLog({ Output: result.output }, 'info');
                } else {
                    this.addLog(`Output: ${result.output}`, 'info');
                }
                this.endExecution(true);
            } else {
                // Show error details if present
                if (typeof result.output === 'object') {
                    this.addLog({ Error: result.output }, 'error');
                } else {
                    this.addLog(`Ansible ${activeMode} failed: ${result.message || 'Unknown error'}`, 'error');
                }
                alert('Failed to run Ansible: ' + (result.message || 'Unknown error'));
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
        const machineId = document.getElementById('terraform-machine-select').value;

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
        this.showLoading();

        try {
            const payload = {
                machine_id: machineId,
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
                        document.getElementById('ansible-editor').value = content;
                        document.getElementById('ansible-filename').value = file.name;
                        this.updateLineNumbers('ansible-editor');
                        this.updateTabName('ansible-tab-name', file.name);
                        // Switch to editor tab
                        document.querySelector('[data-tab="editor-ansible"]').click();
                    } else if (extension === '.tf' || extension === '.tfvars') {
                        document.getElementById('terraform-editor').value = content;
                        document.getElementById('terraform-filename').value = file.name;
                        this.updateLineNumbers('terraform-editor');
                        this.updateTabName('terraform-tab-name', file.name);
                        // Switch to editor tab
                        document.querySelector('[data-tab="editor-tf"]').click();
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
        document.getElementById('loading-overlay').classList.add('show');
    }

    hideLoading() {
        document.getElementById('loading-overlay').classList.remove('show');
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
        const activeMode = document.querySelector('.mode-btn.active').dataset.mode;

        if (activeMode === 'adhoc') {
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
        // Initialize directory management for python, ansible and terraform
        this.currentDirectories = {
            python: null,
            ansible: null,
            terraform: null
        };

        // Python directory management
        this.setupDirectoryManagement('python');

        // Ansible directory management
        this.setupDirectoryManagement('ansible');

        // Terraform directory management  
        this.setupDirectoryManagement('terraform');

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
                    this.loadDirectoryContents(type, this.currentDirectories[type]);
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
        if (type === 'terraform') {
            const initBtn = document.getElementById('terraform-dir-init-btn');
            if (initBtn) {
                initBtn.addEventListener('click', () => this.executeTerraformDirectoryAction('init'));
            }

            const planBtn = document.getElementById('terraform-dir-plan-btn');
            if (planBtn) {
                planBtn.addEventListener('click', () => this.executeTerraformDirectoryAction('plan'));
            }

            const applyBtn = document.getElementById('terraform-dir-apply-btn');
            if (applyBtn) {
                applyBtn.addEventListener('click', () => this.executeTerraformDirectoryAction('apply'));
            }
        }

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

        // Update UI
        document.getElementById(`${type}-current-directory`).textContent = `Directory: ${dirName}`;
        document.getElementById(`${type}-directory-details`).style.display = 'block';

        // Highlight selected directory
        document.querySelectorAll(`#${type}-directories-grid .directory-card`).forEach(card => {
            card.classList.remove('selected');
        });
        event.currentTarget.classList.add('selected');

        // Load directory contents
        this.loadDirectoryContents(type, dirName);
    }

    async loadDirectoryContents(type, dirName) {
        try {
            const response = await fetch(`/api/directories/${type}/${dirName}`);
            if (response.ok) {
                const data = await response.json();
                this.renderDirectoryFiles(type, data.files);
                this.updateFileSelector(type, data.files);
            } else {
                const error = await response.json();
                this.addLog(`Failed to load directory contents: ${error.error}`, 'error');
            }
        } catch (error) {
            this.addLog(`Error loading directory contents: ${error.message}`, 'error');
        }
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
        const selector = document.getElementById(`${type}-selected-file`);
        selector.innerHTML = '<option value="">Select a file...</option>';

        files.forEach(file => {
            const option = document.createElement('option');
            option.value = file.name;
            option.textContent = file.name;
            selector.appendChild(option);
        });
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
        if (!this.currentDirectories[type]) {
            alert('Please select a directory first');
            return;
        }

        const dirName = this.currentDirectories[type];
        const filesData = [];

        for (const file of files) {
            const content = await this.readFileContent(file);
            filesData.push({
                name: file.name,
                content: content
            });
        }

        try {
            const response = await fetch(`/api/directories/${type}/${dirName}/files`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ files: filesData })
            });

            if (response.ok) {
                const result = await response.json();
                this.addLog(`Uploaded ${result.uploaded_files.length} files to '${dirName}'`, 'success');
                this.loadDirectoryContents(type, dirName);
            } else {
                const error = await response.json();
                alert(`Failed to upload files: ${error.error}`);
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
                this.loadDirectoryContents(type, dirName);
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
                    `#${type}-section [data-tab="editor-tf"]`;
            const editorTab = document.querySelector(editorTabSelector);
            if (editorTab) {
                editorTab.click();
            } else {
                this.addLog(`Warning: Could not find editor tab for ${type}`, 'warning');
            }

            // Small delay to ensure tab switching is complete
            setTimeout(() => {
                // Set the content in the editor
                const editorId = `${type}-editor`;
                const editor = document.getElementById(editorId);
                if (editor) {
                    editor.value = fileData.content;
                    this.updateLineNumbers(editorId);
                    this.autoResizeEditor(editorId);

                    // CRITICAL FIX: Set the filename in the filename input field
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

                    this.addLog(`Loaded '${filename}' for editing from directory '${dirName}'`, 'success');
                } else {
                    this.addLog(`Error: Could not find editor for ${type}`, 'error');
                    alert(`Error: Could not find editor for ${type}. Please ensure the section is loaded properly.`);
                }
            }, 100);
        } catch (error) {
            this.addLog(`Error loading file for editing: ${error.message}`, 'error');
            alert(`Error loading file for editing: ${error.message}`);
        }
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
                this.loadDirectoryContents(type, directory);

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
                this.loadDirectoryContents(type, dirName);
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

        // Show execution status
        const statusElement = document.getElementById(`${type}-execution-status`);
        if (statusElement) {
            statusElement.style.display = 'block';
            statusElement.querySelector('span').textContent =
                `Executing ${filesToExecute.length} file${filesToExecute.length > 1 ? 's' : ''}...`;
        }

        this.showLoading();
        this.addLog(`Executing ${filesToExecute.length} file(s) from ${dirName} directory...`, 'info');

        let successCount = 0;
        let failCount = 0;

        for (const filename of filesToExecute) {
            try {
                this.addLog(`Executing: ${filename}`, 'info');

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
                    successCount++;
                    this.addLog(`✓ ${filename} executed successfully in ${result.execution_time?.toFixed(2) || 'N/A'}s`, 'success');
                    if (result.output) {
                        this.addLog(`Output: ${result.output}`, 'info');
                    }
                } else {
                    failCount++;
                    this.addLog(`✗ ${filename} execution failed: ${result.error}`, 'error');
                }
            } catch (error) {
                failCount++;
                this.addLog(`✗ Error executing ${filename}: ${error.message}`, 'error');
            }
        }

        // Hide execution status
        if (statusElement) {
            statusElement.style.display = 'none';
        }

        // Show summary
        const totalFiles = filesToExecute.length;
        if (successCount === totalFiles) {
            this.addLog(`🎉 All ${totalFiles} file(s) executed successfully!`, 'success');
        } else if (successCount > 0) {
            this.addLog(`⚠️ Execution completed: ${successCount} succeeded, ${failCount} failed`, 'warning');
        } else {
            this.addLog(`❌ All executions failed`, 'error');
            alert(`All file executions failed. Check the logs for details.`);
        }

        // Refresh dashboard stats and history
        this.loadDashboardStats();
        this.loadDashboardHistory();

        this.hideLoading();
    }

    async executeTerraformDirectoryAction(action) {
        const dirName = this.currentDirectories['terraform'];

        if (!dirName) {
            alert('No terraform directory selected');
            return;
        }

        this.showLoading();
        this.addLog(`Running terraform ${action} in directory: ${dirName}...`, 'info');

        try {
            const response = await fetch('/api/run-terraform', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    action: action,
                    machine_id: 'local',  // Always use local for terraform
                    filename: '',  // No specific file, works on directory
                    script_content: '',  // No content, uses directory
                    directory_name: dirName  // Pass the directory name
                })
            });

            const result = await response.json();

            if (result.success) {
                this.addLog(`Terraform ${action} completed successfully`, 'success');
                this.addLog(`Output: ${result.output}`, 'info');

                // Refresh dashboard stats and history
                this.loadDashboardStats();
                this.loadDashboardHistory();
            } else {
                this.addLog(`Terraform ${action} failed: ${result.message}`, 'error');
                alert(`Terraform ${action} failed: ${result.message}`);
            }
        } catch (error) {
            this.addLog(`Error running terraform ${action}: ${error.message}`, 'error');
            alert(`Failed to run terraform ${action}`);
        } finally {
            this.hideLoading();
        }
    }

    // --- Enhanced Project Execution Methods ---
    async executeProject(projectType) {
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
            const location = document.querySelector('input[name="python-exec-location"]:checked').value;
            remote = location === 'remote';

            if (!remote) {
                // For local execution, we don't need a machine
            } else if (!machineId) {
                alert('Please select a machine for remote execution');
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

        this.showLoading();
        this.startExecution('project'); // Start execution tracking and auto-open logs
        this.addLog(`Executing ${projectType} project: ${dirName}${mainFile ? ` (main: ${mainFile})` : ''}...`, 'info');

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
                this.addLog(`✓ Project execution completed successfully`, 'success');
                this.addLog(`Main file: ${result.main_file}`, 'info');
                this.addLog(`Execution location: ${result.execution_location}`, 'info');
                if (result.execution_time) {
                    this.addLog(`Execution time: ${result.execution_time.toFixed(2)}s`, 'info');
                }
                if (result.output) {
                    this.addLog(`Output:\n${result.output}`, 'success');
                }

                // Refresh dashboard stats
                if (this.currentSection === 'dashboard') {
                    this.loadDashboardStats();
                    this.loadDashboardHistory();
                }

                this.endExecution(true); // End execution successfully

            } else {
                this.addLog(`✗ Project execution failed: ${result.message || result.error}`, 'error');
                if (result.output) {
                    this.addLog(`Output: ${result.output}`, 'info');
                }
                if (result.error) {
                    this.addLog(`Error: ${result.error}`, 'error');
                }
                alert(`Project execution failed: ${result.message || result.error}`);
                this.endExecution(false); // End execution with failure
            }

        } catch (error) {
            this.addLog(`Error executing project: ${error.message}`, 'error');
            alert(`Failed to execute project: ${error.message}`);
            this.endExecution(false); // End execution with failure
        } finally {
            this.hideLoading();
        }
    }

    async detectMainFile(projectType) {
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
        ['python', 'ansible', 'terraform'].forEach(type => {
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
}

// Initialize the application
const app = new RemoteRunApp();

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
                const ansibleMode = document.querySelector('.mode-btn.active').dataset.mode;
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