class RemoteRunApp {
    constructor() {
        this.machines = [];
        this.currentSection = 'machines';
        this.logs = [];
        this.websocket = null;
        this.socket = null;
        this.editors = {};
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
    }

    startPingInterval() {
        // Ping all machines every 2 minutes
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
            this.pingAllMachines();
        }, 120000); // 120,000 ms = 2 minutes
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
        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                this.switchSection(e.currentTarget.dataset.section);
            });
        });

        // Machine management
        document.getElementById('add-machine-btn').addEventListener('click', () => {
            this.showModal('add-machine-modal');
        });

        document.getElementById('save-machine-btn').addEventListener('click', () => {
            this.saveMachine();
        });

        document.getElementById('test-connection-btn').addEventListener('click', () => {
            this.testConnection();
        });

        document.getElementById('cancel-machine-btn').addEventListener('click', () => {
            this.hideModal('add-machine-modal');
        });

        // Authentication type toggle
        document.getElementById('machine-auth-type').addEventListener('change', (e) => {
            this.toggleAuthType(e.target.value);
        });

        // Command execution
        document.getElementById('execute-command-btn').addEventListener('click', () => {
            this.executeCommand();
        });

        document.getElementById('clear-command-btn').addEventListener('click', () => {
            this.clearCommand();
        });

        // Python scripts
        document.getElementById('run-python-btn').addEventListener('click', () => {
            this.runPythonScript();
        });

        document.getElementById('save-python-btn').addEventListener('click', () => {
            this.savePythonScript();
        });

        document.getElementById('clear-python-btn').addEventListener('click', () => {
            this.clearPython();
        });

        // Ansible
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchAnsibleMode(e.target.dataset.mode);
            });
        });

        document.getElementById('run-ansible-btn').addEventListener('click', () => {
            this.runAnsible();
        });

        // Save Ansible playbook from Playbook Editor
        document.getElementById('save-ansible-editor-btn').addEventListener('click', () => {
            this.saveAnsiblePlaybookFromEditor();
        });

        document.getElementById('save-ansible-btn').addEventListener('click', () => {
            this.saveAnsible();
        });

        // Terraform
        document.getElementById('terraform-plan-btn').addEventListener('click', () => {
            this.runTerraform('plan');
        });

        document.getElementById('terraform-apply-btn').addEventListener('click', () => {
            this.runTerraform('apply');
        });

        document.getElementById('terraform-destroy-btn').addEventListener('click', () => {
            this.runTerraform('destroy');
        });

        document.getElementById('save-terraform-btn').addEventListener('click', () => {
            this.saveTerraformScript();
        });

        document.getElementById('clear-terraform-btn').addEventListener('click', () => {
            this.clearTerraform();
        });

        // Enhanced Logs controls
        document.getElementById('toggle-logs-btn').addEventListener('click', () => {
            this.toggleLogs();
        });

        document.getElementById('maximize-logs-btn').addEventListener('click', () => {
            this.maximizeLogs();
        });

        document.getElementById('minimize-logs-btn').addEventListener('click', () => {
            this.minimizeLogs();
        });

        document.getElementById('clear-logs-btn').addEventListener('click', () => {
            this.clearLogs();
        });

        // Modal close
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.hideModal(e.target.closest('.modal').id);
            });
        });

        // Click outside modal to close
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideModal(modal.id);
                }
            });
        });

        // Filename updates for tab names
        document.getElementById('python-filename').addEventListener('input', (e) => {
            this.updateTabName('python-tab-name', e.target.value || 'script.py');
        });

        document.getElementById('ansible-filename').addEventListener('input', (e) => {
            this.updateTabName('ansible-tab-name', e.target.value || 'playbook.yml');
        });

        document.getElementById('terraform-filename').addEventListener('input', (e) => {
            this.updateTabName('terraform-tab-name', e.target.value || 'main.tf');
        });
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

        this.currentSection = section;
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
            const status = machine.status === 'online' ? 'online' : 'offline';
            const statusText = machine.status ? machine.status : 'offline';
            const card = document.createElement('div');
            card.className = 'machine-card';
            card.innerHTML = `
                <div class="machine-header">
                    <div class="machine-name">${machine.name}</div>
                    <div class="machine-status status-${status}">
                        ${statusText}
                    </div>
                </div>
                <div class="machine-info">
                    <p><strong>Host:</strong> ${machine.host}:${machine.port}</p>
                    <p><strong>Username:</strong> ${machine.username}</p>
                    <p><strong>Auth:</strong> ${machine.auth_type}</p>
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
            select.innerHTML = '<option value="">Choose a machine...</option>';
            
            this.machines.forEach(machine => {
                const option = document.createElement('option');
                option.value = machine.id;
                option.textContent = `${machine.name} (${machine.host})`;
                select.appendChild(option);
            });
        });
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
        const machineId = document.getElementById('machine-id')?.value;
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
            const result = await response.json();
            if (result.success) {
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

        this.showLoading();
        this.addLog(`Executing command on machine: ${command}`, 'info');

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
            } else {
                this.addLog(`Command failed: ${result.message}`, 'error');
            }
        } catch (error) {
            this.addLog('Failed to execute command', 'error');
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

        this.showLoading();
        this.addLog(`Running Python script on machine`, 'info');

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
            } else {
                this.addLog(`Python script failed: ${result.message || 'Unknown error'}`, 'error');
                alert('Failed to run Python script: ' + (result.message || 'Unknown error'));
            }
        } catch (error) {
            this.addLog('Failed to run Python script: ' + (error.message || error), 'error');
            alert('Failed to run Python script: ' + (error.message || error));
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
            const response = await fetch('/api/save-script', {
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
                const error = await response.json().catch(() => ({}));
                this.addLog('Failed to save Python script' + (error.message ? ': ' + error.message : ''), 'error');
                alert('Failed to save Python script' + (error.message ? ': ' + error.message : ''));
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
        } else {
            const scriptContent = document.getElementById('ansible-editor').value;
            const filename = document.getElementById('ansible-filename').value || 'playbook.yml';
            payload.script_content = scriptContent;
            payload.filename = filename;
        }

        this.showLoading();
        this.addLog(`Running Ansible ${activeMode} on machine`, 'info');

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
            } else {
                // Show error details if present
                if (typeof result.output === 'object') {
                    this.addLog({ Error: result.output }, 'error');
                } else {
                    this.addLog(`Ansible ${activeMode} failed: ${result.message || 'Unknown error'}`, 'error');
                }
                alert('Failed to run Ansible: ' + (result.message || 'Unknown error'));
            }
        } catch (error) {
            this.addLog('Failed to run Ansible: ' + (error.message || error), 'error');
            alert('Failed to run Ansible: ' + (error.message || error));
        } finally {
            this.hideLoading();
        }
    }

    async runTerraform(action) {
        const machineId = document.getElementById('terraform-machine-select').value;
        
        if (!machineId) {
            alert('Please select a machine');
            return;
        }

        const scriptContent = document.getElementById('terraform-editor').value;
        const filename = document.getElementById('terraform-filename').value || 'main.tf';

        this.showLoading();
        this.addLog(`Running Terraform ${action} on machine`, 'info');

        try {
            const response = await fetch('/api/run-terraform', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    machine_id: machineId,
                    action: action,
                    script_content: scriptContent,
                    filename: filename
                })
            });

            const result = await response.json();
            
            if (result.success) {
                this.addLog(`Terraform ${action} executed successfully`, 'success');
                this.addLog(`Output: ${result.output}`, 'info');
            } else {
                this.addLog(`Terraform ${action} failed: ${result.message || 'Unknown error'}`, 'error');
                alert('Failed to run Terraform: ' + (result.message || 'Unknown error'));
            }
        } catch (error) {
            this.addLog('Failed to run Terraform: ' + (error.message || error), 'error');
            alert('Failed to run Terraform: ' + (error.message || error));
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
            const response = await fetch('/api/save-script', {
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
                this.addLog('Failed to save Terraform script', 'error');
            }
        } catch (error) {
            this.addLog('Failed to save Terraform script', 'error');
        }
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
            const response = await fetch(`/api/files/${type}`);
            if (response.ok) {
                const files = await response.json();
                this.renderFileList(files, type);
            }
        } catch (error) {
            this.addLog(`Failed to load ${type} files`, 'error');
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
            li.textContent = file.filename;
            li.title = file.filename;
            li.addEventListener('click', () => this.loadFile(file.filename, type));
            // Add delete button
            const delBtn = document.createElement('button');
            delBtn.className = 'delete-file-btn';
            delBtn.innerHTML = '<i class="fas fa-trash"></i>';
            delBtn.title = 'Delete file';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteFile(file.filename, type);
            });
            li.appendChild(delBtn);
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
        const machine = this.machines.find(m => m.id === machineId);
        if (!machine) return;
        this.showLoading();
        this.addLog(`Testing connection to ${machine.name}`, 'info');
        try {
            const response = await fetch('/api/test-connection', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ machine_id: machineId })
            });
            const result = await response.json();
            if (result.success) {
                this.addLog(`Connection to ${machine.name} successful`, 'success');
                machine.status = 'online';
                this.renderMachines();
            } else {
                this.addLog(`Connection to ${machine.name} failed: ${result.message || 'Unknown error'}`, 'error');
                machine.status = 'offline';
                this.renderMachines();
            }
        } catch (error) {
            this.addLog(`Connection test failed for ${machine.name}`, 'error');
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
        saveBtn.onclick = () => this.updateMachine(machineId);
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
                document.getElementById('run-python-btn').click();
                break;
            case 'ansible':
                document.getElementById('run-ansible-btn').click();
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