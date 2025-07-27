import sys
from remoterunlib.remoterunlib import SSHClient
import sqlite3
import os
import uuid
import datetime
import time
import tempfile
import shutil

class Dashboard:
    """A simple Flask-based dashboard to manage remote machines and execute commands."""
    def __init__(self, host="", port=5000):
        """Initialize the dashboard."""
        self.host = "0.0.0.0" if not host else host
        self.port = 5000 if not port else port

        # Determine DB path
        caller_path = os.path.abspath(sys.argv[0])
        scripts_path = os.path.dirname(caller_path)
        self.db_path = os.path.join(scripts_path, "remoterunDB.sqlite3")
        
        # Set up base paths for directories
        self.directories_base_path = os.path.join(scripts_path, "projects")

        # Connect to SQLite and ensure table exists
        self._init_db()
        self.machines = self._fetch_all_machines()

    def _init_db(self):
        self.conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        c = self.conn.cursor()
        # Add 'name' column if not exists
        c.execute("""
            CREATE TABLE IF NOT EXISTS machines (
                id TEXT PRIMARY KEY,
                name TEXT,
                host TEXT,
                username TEXT,
                password TEXT,
                port INTEGER,
                key TEXT
            )
        """)
        # Migration: add 'name' column if missing
        c.execute("PRAGMA table_info(machines)")
        columns = [row[1] for row in c.fetchall()]
        if 'name' not in columns:
            c.execute("ALTER TABLE machines ADD COLUMN name TEXT")
            c.execute("UPDATE machines SET name = host || '@' || username WHERE name IS NULL")
        # New: execution_history table
        c.execute("""
            CREATE TABLE IF NOT EXISTS execution_history (
                id TEXT PRIMARY KEY,
                machine_id TEXT,
                type TEXT,
                status TEXT,
                command TEXT,
                output TEXT,
                started_at TIMESTAMP,
                completed_at TIMESTAMP,
                duration REAL,
                logs TEXT
            )
        """)
        # New: machine_state table
        c.execute("""
            CREATE TABLE IF NOT EXISTS machine_state (
                machine_id TEXT PRIMARY KEY,
                status TEXT,
                last_checked TIMESTAMP
            )
        """)
        self.conn.commit()
    def _insert_execution(self, data):
        c = self.conn.cursor()
        c.execute("""
            INSERT INTO execution_history (id, machine_id, type, status, command, output, started_at, completed_at, duration, logs)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            data['id'],
            data['machine_id'],
            data['type'],
            data['status'],
            data.get('command'),
            data.get('output'),
            data.get('started_at'),
            data.get('completed_at'),
            data.get('duration'),
            data.get('logs'),
        ))
        self.conn.commit()

    def _get_execution_history(self, filters=None):
        c = self.conn.cursor()
        query = "SELECT * FROM execution_history WHERE 1=1"
        params = []
        if filters:
            if 'machine_id' in filters and filters['machine_id']:
                query += " AND machine_id = ?"
                params.append(filters['machine_id'])
            if 'type' in filters and filters['type']:
                query += " AND type = ?"
                params.append(filters['type'])
            if 'status' in filters and filters['status']:
                query += " AND status = ?"
                params.append(filters['status'])
            if 'last_24h' in filters and filters['last_24h']:
                query += " AND started_at >= datetime('now', '-1 day')"
        query += " ORDER BY started_at DESC"
        c.execute(query, params)
        rows = c.fetchall()
        return [dict(row) for row in rows]

    def _get_execution_stats(self):
        c = self.conn.cursor()
        # Successful executions
        c.execute("SELECT COUNT(*) FROM execution_history WHERE status = 'success' AND started_at >= datetime('now', '-1 day')")
        success_24h = c.fetchone()[0]
        c.execute("SELECT COUNT(*) FROM execution_history WHERE status = 'failed' AND started_at >= datetime('now', '-1 day')")
        failed_24h = c.fetchone()[0]
        c.execute("SELECT COUNT(*) FROM execution_history WHERE started_at >= datetime('now', '-1 day')")
        total_24h = c.fetchone()[0]
        # Active machines: count all machines
        c.execute("SELECT COUNT(*) FROM machines")
        active_machines = c.fetchone()[0]
        return {
            'successful_executions': success_24h,
            'failed_executions': failed_24h,
            'recent_executions': total_24h,
            'active_machines': active_machines
        }

    def _set_machine_state(self, machine_id, status):
        c = self.conn.cursor()
        c.execute("""
            INSERT INTO machine_state (machine_id, status, last_checked)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(machine_id) DO UPDATE SET status=excluded.status, last_checked=CURRENT_TIMESTAMP
        """, (machine_id, status))
        self.conn.commit()

    def _fetch_all_machines(self):
        c = self.conn.cursor()
        c.execute("SELECT * FROM machines")
        rows = c.fetchall()
        result = []
        for row in rows:
            d = dict(row)
            if not d.get('name'):
                d['name'] = f"{d['host']}@{d['username']}"
            result.append(d)
        return result

    def _insert_machine(self, data):
        c = self.conn.cursor()
        name = data.get('name')
        if not name:
            name = f"{data['host']}@{data['username']}"
        c.execute("""
            INSERT INTO machines (id, name, host, username, password, port, key)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            data['id'],
            name,
            data['host'],
            data['username'],
            data.get('password'),
            data.get('port', 22),
            data.get('key')
        ))
        self.conn.commit()

    def _update_machine(self, machine_id, data):
        c = self.conn.cursor()
        name = data.get('name')
        if not name:
            name = f"{data['host']}@{data['username']}"
        c.execute("""
            UPDATE machines SET name=?, host=?, username=?, password=?, port=?, key=?
            WHERE id=?
        """, (
            name,
            data['host'],
            data['username'],
            data.get('password'),
            data.get('port', 22),
            data.get('key'),
            machine_id
        ))
        self.conn.commit()

    def _delete_machine(self, machine_id):
        c = self.conn.cursor()
        c.execute("DELETE FROM machines WHERE id=?", (machine_id,))
        self.conn.commit()

    def serve(self):
        """
        Start a Flask API server that exposes endpoints for all SSHClient operations and serves the UI.
        """
        import os
        from flask import Flask, request, jsonify, send_from_directory
        from flask_cors import CORS
        from flask_socketio import SocketIO, emit

        app = Flask(__name__, static_folder=None)
        CORS(app)

        # Add Flask-SocketIO for WebSocket support
        socketio = SocketIO(app, cors_allowed_origins="*")

        # Serve index.html and static files
        UI_DIR = os.path.join(os.path.dirname(__file__), "UI")
        # Define scripts directory relative to this file (UI/scripts)
        self.scripts_dir = os.path.join(UI_DIR, "scripts")

        @app.route("/")
        def index():
            return send_from_directory(UI_DIR, "index.html")

        @app.route("/static/<path:filename>")
        def static_files(filename):
            return send_from_directory(UI_DIR, filename)

        @app.route("/styles.css")
        def styles_css():
            return send_from_directory(UI_DIR, "styles.css")

        @app.route("/script.js")
        def script_js():
            return send_from_directory(UI_DIR, "script.js")


        # WebSocket endpoint for live logs
        @socketio.on('connect', namespace='/ws')
        def ws_connect():
            emit('log', {'timestamp': '2024-01-20 10:30:00', 'level': 'info', 'message': 'System ready'})

        @socketio.on('get_logs', namespace='/ws')
        def ws_get_logs():
            # Example: emit static logs
            emit('log', {'timestamp': '2024-01-20 10:30:00', 'level': 'info', 'message': 'System ready'})

        @socketio.on('disconnect', namespace='/ws')
        def ws_disconnect():
            pass

        # Machine management (in-memory for demo)

        @app.route("/api/machines", methods=["GET"])
        def get_machines():
            self.machines = self._fetch_all_machines()
            return jsonify(self.machines)

        @app.route("/api/machines", methods=["POST"])
        def add_machine():
            data = request.json
            if 'key_path' in data:
                data['key'] = data['key_path']
                del data['key_path']
            # Check for existing machine with the same host and username
            self.machines = self._fetch_all_machines()
            for m in self.machines:
                if m['host'].strip().lower() == data['host'].strip().lower() and \
                   m['username'].strip().lower() == data['username'].strip().lower():
                    return jsonify({"success": False, "message": "Machine with the same host and username already exists."}), 400
            if 'id' not in data or not data['id']:
                data['id'] = str(uuid.uuid4())
            self._insert_machine(data)
            self.machines = self._fetch_all_machines()
            return jsonify({"success": True, "machine": data, "created": True})

        @app.route("/api/machines/<machine_id>", methods=["PUT"])
        def update_machine(machine_id):
            data = request.json
            if 'key_path' in data:
                data['key'] = data['key_path']
                del data['key_path']
            self.machines = self._fetch_all_machines()
            machine = next((m for m in self.machines if m['id'] == machine_id), None)
            if not machine:
                return jsonify({"success": False, "message": "Machine not found."}), 404
            for m in self.machines:
                if m['id'] != machine_id and \
                   m['host'].strip().lower() == data['host'].strip().lower() and \
                   m['username'].strip().lower() == data['username'].strip().lower():
                    return jsonify({"success": False, "message": "Another machine with the same host and username already exists."}), 400
            self._update_machine(machine_id, data)
            self.machines = self._fetch_all_machines()
            updated = next((m for m in self.machines if m['id'] == machine_id), None)
            return jsonify({"success": True, "machine": updated, "updated": True})

        @app.route("/api/machines/<machine_id>", methods=["DELETE"])
        def delete_machine_by_id(machine_id):
            self._delete_machine(machine_id)
            self.machines = self._fetch_all_machines()
            return jsonify({"success": True})

        @app.route("/api/machines/<int:idx>/test", methods=["POST"])
        def test_machine(idx):
            if 0 <= idx < len(self.machines):
                m = self.machines[idx]
                try:
                    client = SSHClient(m["host"], m["username"], m.get("password"), m.get("port", 22), m.get("key"))
                    client.login()
                    online = client.ping()
                    client.close()
                    return jsonify({"success": online})
                except Exception as e:
                    return jsonify({"success": False, "error": str(e)}), 500
            return jsonify({"success": False, "error": "Invalid index"}), 400

        # Command execution
        @app.route("/api/commands/execute", methods=["POST"])
        def execute_command():
            data = request.json
            idx = data.get("machine_idx")
            command = data.get("command")
            timeout = int(data.get("timeout", 30))
            if idx is None or command is None:
                return jsonify({"success": False, "error": "Missing parameters"}), 400
            m = self.machines[idx]
            try:
                client = SSHClient(m["host"], m["username"], m.get("password"), m.get("port", 22), m.get("key"))
                client.login()
                output, errors = client.run_command(command, timeout=timeout)
                client.close()
                return jsonify({"success": True, "output": output, "errors": errors})
            except Exception as e:
                return jsonify({"success": False, "error": str(e)}), 500

        @app.route("/api/execute-command", methods=["POST"])
        def execute_command_v2():
            # Accepts: {machine_id, command, timeout}
            import datetime
            data = request.json
            machine_id = data.get("machine_id")
            command = data.get("command")
            timeout = int(data.get("timeout", 30))
            # Find machine by id (not index)
            machine = None
            for m in self.machines:
                if str(m.get("id")) == str(machine_id):
                    machine = m
                    break
            if not machine:
                return jsonify({"success": False, "message": "Machine not found"}), 404
            started_at = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
            try:
                client = SSHClient(
                    machine["host"],
                    machine["username"],
                    machine.get("password"),
                    machine.get("port", 22),
                    machine.get("key"),
                )
                client.login()
                import time
                t0 = time.time()
                output, errors = client.run_command(command, timeout=timeout)
                t1 = time.time()
                client.close()
                status = "success" if not errors else "failed"
                completed_at = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
                duration = t1 - t0
                # Insert execution history
                exec_data = {
                    "id": str(uuid.uuid4()),
                    "machine_id": machine_id,
                    "type": "command",
                    "status": status,
                    "command": command,
                    "output": output,
                    "started_at": started_at,
                    "completed_at": completed_at,
                    "duration": duration,
                    "logs": errors or "",
                }
                self._insert_execution(exec_data)
                return jsonify({"success": True, "output": output, "errors": errors})
            except Exception as e:
                completed_at = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
                import time
                duration = 0
                # Insert failed execution history
                exec_data = {
                    "id": str(uuid.uuid4()),
                    "machine_id": machine_id,
                    "type": "command",
                    "status": "failed",
                    "command": command,
                    "output": "",
                    "started_at": started_at,
                    "completed_at": completed_at,
                    "duration": duration,
                    "logs": str(e),
                }
                self._insert_execution(exec_data)
                return jsonify({"success": False, "message": str(e)}), 500

        @app.route("/api/execution-history", methods=["GET", "DELETE"])
        def execution_history():
            if request.method == "GET":
                filters = {
                    'machine_id': request.args.get('machine_id'),
                    'type': request.args.get('type'),
                    'status': request.args.get('status'),
                    'last_24h': request.args.get('last_24h') == '1',
                }
                history = self._get_execution_history(filters)
                return jsonify(history)
            elif request.method == "DELETE":
                c = self.conn.cursor()
                c.execute("DELETE FROM execution_history")
                self.conn.commit()
                return jsonify({"success": True})

        @app.route("/api/execution-stats", methods=["GET"])
        def get_execution_stats():
            stats = self._get_execution_stats()
            return jsonify(stats)
        # Python script execution
        @app.route("/api/python/run", methods=["POST"])
        def run_python():
            data = request.form
            idx = int(data.get("machine_idx"))
            timeout = int(data.get("timeout", 60))
            file = request.files.get("file")
            script_path = None
            if file:
                script_path = os.path.join("/tmp", file.filename)
                file.save(script_path)
            m = self.machines[idx]
            try:
                client = SSHClient(m["host"], m["username"], m.get("password"), m.get("port", 22), m.get("key"))
                client.login()
                result = client.run_python_file(script_path, timeout=timeout)
                client.close()
                return jsonify({"success": result})
            except Exception as e:
                return jsonify({"success": False, "error": str(e)}), 500

        # Ansible playbook/ad-hoc
        @app.route("/api/ansible/run", methods=["POST"])
        def run_ansible():
            data = request.json
            idx = int(data.get("machine_idx"))
            mode = data.get("mode", "adhoc")
            playbook = data.get("playbook")
            command = data.get("command")
            m = self.machines[idx]
            try:
                client = SSHClient(m["host"], m["username"], m.get("password"), m.get("port", 22), m.get("key"))
                client.login()
                if mode == "adhoc":
                    result = client.run_ansible_playbook(command)
                else:
                    result = client.run_ansible_playbook(playbook)
                client.close()
                # result is now a dict with success, output, error
                return jsonify(result)
            except Exception as e:
                return jsonify({"success": False, "output": "", "error": str(e)}), 500

        # Terraform endpoints (legacy - kept for backwards compatibility)
        @app.route("/api/terraform/init", methods=["POST"])
        def terraform_init():
            data = request.json
            idx = int(data.get("machine_idx"))
            work_dir = data.get("work_dir", "~")
            m = self.machines[idx]
            try:
                client = SSHClient(m["host"], m["username"], m.get("password"), m.get("port", 22), m.get("key"))
                client.login()
                result = client.run_terraform_init(work_dir, remote=True)
                client.close()
                return jsonify({"success": result})
            except Exception as e:
                return jsonify({"success": False, "error": str(e)}), 500

        @app.route("/api/terraform/plan", methods=["POST"])
        def terraform_plan():
            data = request.json
            idx = int(data.get("machine_idx"))
            work_dir = data.get("work_dir")
            m = self.machines[idx]
            try:
                client = SSHClient(m["host"], m["username"], m.get("password"), m.get("port", 22), m.get("key"))
                client.login()
                result = client.run_terraform_plan(work_dir, remote=True)
                client.close()
                return jsonify({"success": result})
            except Exception as e:
                return jsonify({"success": False, "error": str(e)}), 500

        @app.route("/api/terraform/apply", methods=["POST"])
        def terraform_apply():
            data = request.json
            idx = int(data.get("machine_idx"))
            work_dir = data.get("work_dir")
            m = self.machines[idx]
            try:
                client = SSHClient(m["host"], m["username"], m.get("password"), m.get("port", 22), m.get("key"))
                client.login()
                result = client.run_terraform_apply(work_dir, remote=True)
                client.close()
                return jsonify({"success": result})
            except Exception as e:
                return jsonify({"success": False, "error": str(e)}), 500

        # Live logs (demo: return static logs)
        @app.route("/api/logs", methods=["GET"])
        def get_logs():
            logs = [
                {"timestamp": "2024-01-20 10:30:00", "level": "info", "message": "System ready"}
            ]
            return jsonify(logs)

        # --- Unified Python script execution endpoint (matches frontend) ---
        @app.route("/api/run-python", methods=["POST"])
        def run_python_v2():
            import datetime, time
            data = request.json
            machine_id = data.get("machine_id")
            script_content = data.get("script_content")
            filename = data.get("filename", "script.py")
            timeout = int(data.get("timeout", 60))
            # Find machine by id
            machine = None
            for m in self.machines:
                if str(m.get("id")) == str(machine_id):
                    machine = m
                    break
            if not machine:
                return jsonify({"success": False, "message": "Machine not found"}), 404
            started_at = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
            try:
                import tempfile
                with tempfile.NamedTemporaryFile("w", delete=False, suffix=".py") as tmpf:
                    tmpf.write(script_content)
                    tmpf.flush()
                    script_path = tmpf.name
                client = SSHClient(
                    machine["host"],
                    machine["username"],
                    machine.get("password"),
                    machine.get("port", 22),
                    machine.get("key"),
                )
                client.login()
                t0 = time.time()
                output, errors = client.run_python_file(script_path, timeout=timeout)
                t1 = time.time()
                client.close()
                status = "success" if not errors else "failed"
                completed_at = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
                duration = t1 - t0
                # Insert execution history for dashboard
                exec_data = {
                    "id": str(uuid.uuid4()),
                    "machine_id": machine_id,
                    "type": "python",
                    "status": status,
                    "command": filename,
                    "output": output,
                    "started_at": started_at,
                    "completed_at": completed_at,
                    "duration": duration,
                    "logs": errors or "",
                }
                self._insert_execution(exec_data)
                if errors:
                    return jsonify({"success": False, "output": output, "message": errors}), 500
                return jsonify({"success": True, "output": output})
            except Exception as e:
                completed_at = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
                duration = 0
                # Insert failed execution history for dashboard
                exec_data = {
                    "id": str(uuid.uuid4()),
                    "machine_id": machine_id,
                    "type": "python",
                    "status": "failed",
                    "command": filename,
                    "output": "",
                    "started_at": started_at,
                    "completed_at": completed_at,
                    "duration": duration,
                    "logs": str(e),
                }
                self._insert_execution(exec_data)
                return jsonify({"success": False, "message": str(e)}), 500

        # --- Unified Ansible endpoint (matches frontend) ---
        @app.route("/api/run-ansible", methods=["POST"])
        def run_ansible_v2():
            import datetime, time
            data = request.json
            machine_id = data.get("machine_id")
            mode = data.get("mode", "adhoc")
            module = data.get("module")
            args = data.get("args")
            playbook = data.get("playbook")
            script_content = data.get("script_content")
            filename = data.get("filename", "playbook.yml")
            become = data.get("become", False)  # Get the become parameter
            # Find machine by id
            machine = None
            for m in self.machines:
                if str(m.get("id")) == str(machine_id):
                    machine = m
                    break
            if not machine:
                return jsonify({"success": False, "message": "Machine not found"}), 404
            started_at = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
            try:
                client = SSHClient(
                    machine["host"],
                    machine["username"],
                    machine.get("password"),
                    machine.get("port", 22),
                    machine.get("key"),
                )
                client.login()
                t0 = time.time()
                if mode == "adhoc":
                    # For ad-hoc commands, pass just the command/args, not the full ansible syntax
                    # The run_ansible_playbook method will construct the proper ansible command
                    command = args  # Just pass the arguments directly
                    module = module or "command"  # Default to command if module is None/empty
                    output = client.run_ansible_playbook(command, module=module, become=become)
                    exec_command = f"{module}: {args}"
                else:
                    # Save playbook content to a temp file if provided
                    if script_content:
                        import tempfile
                        with tempfile.NamedTemporaryFile("w", delete=False, suffix=".yml") as tmpf:
                            tmpf.write(script_content)
                            tmpf.flush()
                            playbook_path = tmpf.name
                        output = client.run_ansible_playbook(playbook_path, become=become)
                        exec_command = filename
                    else:
                        output = client.run_ansible_playbook(playbook, become=become)
                        exec_command = playbook
                t1 = time.time()
                client.close()
                status = "success"
                completed_at = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
                duration = t1 - t0
                # Insert execution history for dashboard
                exec_data = {
                    "id": str(uuid.uuid4()),
                    "machine_id": machine_id,
                    "type": "ansible",
                    "status": status,
                    "command": exec_command,
                    "output": str(output),
                    "started_at": started_at,
                    "completed_at": completed_at,
                    "duration": duration,
                    "logs": "",
                }
                self._insert_execution(exec_data)
                return jsonify({"success": True, "output": output})
            except Exception as e:
                completed_at = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
                duration = 0
                # Insert failed execution history for dashboard
                exec_data = {
                    "id": str(uuid.uuid4()),
                    "machine_id": machine_id,
                    "type": "ansible",
                    "status": "failed",
                    "command": module if mode == "adhoc" else filename,
                    "output": "",
                    "started_at": started_at,
                    "completed_at": completed_at,
                    "duration": duration,
                    "logs": str(e),
                }
                self._insert_execution(exec_data)
                return jsonify({"success": False, "message": str(e)}), 500

        # --- Enhanced Terraform endpoint with proper output handling ---
        @app.route("/api/run-terraform", methods=["POST"])
        def run_terraform_v2():
            import datetime, time
            data = request.json
            machine_id = data.get("machine_id")
            action = data.get("action")  # init, plan, apply
            script_content = data.get("script_content", "")
            filename = data.get("filename", "main.tf")
            directory_name = data.get("directory_name")  # For directory-based execution
            
            # For terraform, we can accept "local" as machine_id or skip machine validation
            if machine_id != "local":
                # Find machine by id (used for execution tracking but Terraform runs locally)
                machine = None
                for m in self.machines:
                    if str(m.get("id")) == str(machine_id):
                        machine = m
                        break
                if not machine:
                    return jsonify({"success": False, "message": "Machine not found"}), 404

            # Validate action - only support init, plan, and apply (no destroy)
            if action not in ["init", "plan", "apply"]:
                return jsonify({"success": False, "message": "Invalid action. Supported: init, plan, apply"}), 400

            started_at = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
            temp_dir = None
            captured_output = ""
            
            try:
                # Terraform runs locally on the dashboard host, not on remote machines
                # This is similar to how Ansible works - local execution managing remote resources
                
                if directory_name:
                    # Directory-based execution: use existing project directory
                    work_dir = os.path.join(self.directories_base_path, 'terraform', directory_name)
                    if not os.path.exists(work_dir):
                        return jsonify({"success": False, "message": f"Directory '{directory_name}' not found"}), 404
                elif script_content.strip():
                    # Content-based execution: create temporary directory
                    temp_dir = tempfile.mkdtemp(prefix="terraform_")
                    tf_file_path = os.path.join(temp_dir, filename)
                    with open(tf_file_path, 'w') as f:
                        f.write(script_content)
                    work_dir = temp_dir
                else:
                    # For init action without content, use a default directory
                    work_dir = tempfile.mkdtemp(prefix="terraform_init_")

                t0 = time.time()
                result = False
                
                # Use local Terraform execution methods (remote=False)
                if action == "init":
                    # Run terraform init locally
                    success, output, error = self._run_terraform_init_local(work_dir)
                    captured_output = output
                    if error:
                        captured_output += f"\nErrors: {error}"
                    result = success
                        
                elif action == "plan":
                    # For plan, we need content OR a directory
                    if not script_content.strip() and not directory_name:
                        return jsonify({"success": False, "message": "Terraform configuration content or directory is required for plan action"}), 400
                    
                    # Run terraform plan locally  
                    success, output, error = self._run_terraform_plan_local(work_dir)
                    captured_output = output
                    if error:
                        captured_output += f"\nErrors: {error}"
                    result = success
                    
                elif action == "apply":
                    # For apply, we need content OR a directory
                    if not script_content.strip() and not directory_name:
                        return jsonify({"success": False, "message": "Terraform configuration content or directory is required for apply action"}), 400
                    
                    # Run terraform apply locally
                    success, output, error = self._run_terraform_apply_local(work_dir)
                    captured_output = output
                    if error:
                        captured_output += f"\nErrors: {error}"
                    result = success
                
                t1 = time.time()
                
                # Determine status based on result
                status = "success" if result else "failed"
                
                completed_at = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
                duration = t1 - t0
                
                # Prepare command description
                command_desc = f"terraform {action} (local execution)"
                if directory_name:
                    command_desc += f" - directory: {directory_name}"
                elif script_content.strip() and filename:
                    command_desc += f" - {filename}"
                
                # Insert execution history
                # For terraform, always use "local" as machine_id since it runs locally
                actual_machine_id = "local" if machine_id == "local" or not machine_id else machine_id
                exec_data = {
                    "id": str(uuid.uuid4()),
                    "machine_id": actual_machine_id,
                    "type": "terraform",
                    "status": status,
                    "command": command_desc,
                    "output": captured_output,
                    "started_at": started_at,
                    "completed_at": completed_at,
                    "duration": duration,
                    "logs": "",
                }
                self._insert_execution(exec_data)
                
                return jsonify({
                    "success": status == "success",
                    "output": captured_output,
                    "message": f"Terraform {action} completed locally" if status == "success" else f"Terraform {action} failed"
                })
                
            except Exception as e:
                completed_at = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
                duration = 0
                
                # Insert failed execution history
                exec_data = {
                    "id": str(uuid.uuid4()),
                    "machine_id": machine_id,
                    "type": "terraform",
                    "status": "failed",
                    "command": f"terraform {action} (local execution)",
                    "output": captured_output,
                    "started_at": started_at,
                    "completed_at": completed_at,
                    "duration": duration,
                    "logs": str(e),
                }
                self._insert_execution(exec_data)
                
                return jsonify({"success": False, "message": f"Terraform {action} failed: {str(e)}"}), 500
            
            finally:
                # Clean up temporary directory
                if temp_dir and os.path.exists(temp_dir):
                    import shutil
                    try:
                        shutil.rmtree(temp_dir)
                    except Exception as cleanup_error:
                        print(f"Warning: Failed to clean up temp directory {temp_dir}: {cleanup_error}")

        # --- Save script endpoint (for frontend) ---

        @app.route("/api/save-script", methods=["POST"])
        def save_script():
            data = request.json
            script_type = data.get("type")
            filename = data.get("filename")
            content = data.get("content")
            if not script_type or not filename or not content:
                return jsonify({"success": False, "message": "Missing parameters"}), 400
            # Save to UI/scripts/{type}/filename (relative to dashboard.py)
            # Save to scripts/{type}/filename in the current working directory (where the script is run)
            caller_path = os.path.abspath(sys.argv[0])
            scripts_path = os.path.dirname(caller_path)
            base_dir = os.path.join(scripts_path, "scripts", script_type)
            os.makedirs(base_dir, exist_ok=True)
            file_path = os.path.join(base_dir, filename)
            try:
                with open(file_path, "w", encoding="utf-8") as f:
                    f.write(content)
                return jsonify({"success": True, "filename": filename, "type": script_type})
            except Exception as e:
                return jsonify({"success": False, "message": str(e)}), 500

        @app.route("/api/files/<script_type>", methods=["GET"])
        def list_files(script_type):
            # List all files for a given script type (python, ansible, terraform)
            caller_path = os.path.abspath(sys.argv[0])
            scripts_path = os.path.dirname(caller_path)
            base_dir = os.path.join(scripts_path, "scripts", script_type)
            if not os.path.exists(base_dir):
                return jsonify([])
            files = []
            for fname in os.listdir(base_dir):
                fpath = os.path.join(base_dir, fname)
                if os.path.isfile(fpath):
                    files.append({"filename": fname})
            return jsonify(files)

        @app.route("/api/files/<script_type>/<filename>", methods=["GET", "PUT", "DELETE"])
        def load_file(script_type, filename):
            # Load content, update content, or delete a specific file
            try:
                caller_path = os.path.abspath(sys.argv[0])
                scripts_path = os.path.dirname(caller_path)
                base_dir = os.path.join(scripts_path, "scripts", script_type)
                file_path = os.path.join(base_dir, filename)
                
                # Security check: ensure the file is within the expected directory
                if not os.path.abspath(file_path).startswith(os.path.abspath(base_dir)):
                    return jsonify({"error": "Invalid file path"}), 400
                
                if request.method == "GET":
                    # Load file content
                    if not os.path.exists(file_path):
                        return jsonify({"error": "File not found"}), 404
                        
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                        
                    return jsonify({
                        "name": filename,
                        "content": content,
                        "type": script_type
                    })
                
                elif request.method == "PUT":
                    # Update file content
                    data = request.json
                    new_content = data.get("content", "")
                    
                    if not os.path.exists(file_path):
                        return jsonify({"error": "File not found"}), 404
                    
                    # Create backup before editing
                    backup_path = file_path + ".backup"
                    if os.path.exists(file_path):
                        import shutil
                        shutil.copy2(file_path, backup_path)
                    
                    with open(file_path, "w", encoding="utf-8") as f:
                        f.write(new_content)
                    
                    return jsonify({
                        "message": f"File '{filename}' updated successfully",
                        "name": filename,
                        "type": script_type
                    })
                
                elif request.method == "DELETE":
                    # Delete file
                    if not os.path.exists(file_path):
                        return jsonify({"error": "File not found"}), 404
                    
                    # Create backup before deletion
                    backup_dir = os.path.join(base_dir, ".backup")
                    os.makedirs(backup_dir, exist_ok=True)
                    backup_path = os.path.join(backup_dir, f"{filename}.{int(time.time())}")
                    import shutil
                    shutil.copy2(file_path, backup_path)
                    
                    os.remove(file_path)
                    return jsonify({"message": f"File '{filename}' deleted successfully"})
                    
            except Exception as e:
                return jsonify({"error": str(e)}), 500

        @app.route("/api/files/<script_type>/<filename>/rename", methods=["PUT"])
        def rename_saved_file(script_type, filename):
            """Rename a saved file."""
            try:
                caller_path = os.path.abspath(sys.argv[0])
                scripts_path = os.path.dirname(caller_path)
                base_dir = os.path.join(scripts_path, "scripts", script_type)
                old_file_path = os.path.join(base_dir, filename)
                
                # Security check
                if not os.path.abspath(old_file_path).startswith(os.path.abspath(base_dir)):
                    return jsonify({"error": "Invalid file path"}), 400
                
                if not os.path.exists(old_file_path):
                    return jsonify({"error": "File not found"}), 404
                
                data = request.json
                new_name = data.get("new_name", "").strip()
                
                if not new_name:
                    return jsonify({"error": "New file name is required"}), 400
                
                # Sanitize new filename
                import re
                new_name = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', new_name)
                
                new_file_path = os.path.join(base_dir, new_name)
                
                if os.path.exists(new_file_path):
                    return jsonify({"error": "File with new name already exists"}), 400
                
                os.rename(old_file_path, new_file_path)
                
                return jsonify({
                    "message": f"File renamed from '{filename}' to '{new_name}'",
                    "old_name": filename,
                    "new_name": new_name,
                    "type": script_type
                })
                
            except Exception as e:
                return jsonify({"error": str(e)}), 500

        # --- Directory Management Endpoints ---
        @app.route("/api/directories/<script_type>", methods=["GET", "POST"])
        def manage_directories(script_type):
            """Get all directories or create a new directory for script type."""
            try:
                # Use the instance's directories_base_path
                base_dir = os.path.join(self.directories_base_path, script_type)
                
                if request.method == "GET":
                    # List all directories
                    directories = []
                    if os.path.exists(base_dir):
                        for item in os.listdir(base_dir):
                            item_path = os.path.join(base_dir, item)
                            if os.path.isdir(item_path):
                                # Get directory info
                                files_count = len([f for f in os.listdir(item_path) 
                                                 if os.path.isfile(os.path.join(item_path, f))])
                                directories.append({
                                    "name": item,
                                    "files_count": files_count,
                                    "created": os.path.getctime(item_path),
                                    "modified": os.path.getmtime(item_path)
                                })
                    return jsonify(directories)
                
                elif request.method == "POST":
                    # Create new directory
                    data = request.json
                    dir_name = data.get("name", "").strip()
                    
                    if not dir_name:
                        return jsonify({"error": "Directory name is required"}), 400
                    
                    # Sanitize directory name
                    import re
                    dir_name = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', dir_name)
                    
                    dir_path = os.path.join(base_dir, dir_name)
                    
                    if os.path.exists(dir_path):
                        return jsonify({"error": "Directory already exists"}), 400
                    
                    os.makedirs(dir_path, exist_ok=True)
                    
                    # Create a README file with project info
                    readme_content = f"""# {dir_name.replace('_', ' ').title()} Project

## Project Information
- **Type**: {script_type.title()}
- **Created**: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
- **Platform**: RemoteRunLib Enterprise

## Directory Structure
This directory contains {script_type} files and configurations.

## Usage Instructions
1. Upload your {script_type} files to this directory
2. Select files from the directory view
3. Execute using the built-in run commands

---
*Generated by RemoteRunLib Enterprise Edition*
"""
                    with open(os.path.join(dir_path, "README.md"), "w", encoding="utf-8") as f:
                        f.write(readme_content)
                    
                    return jsonify({
                        "name": dir_name,
                        "message": f"Directory '{dir_name}' created successfully"
                    })
                    
            except Exception as e:
                return jsonify({"error": str(e)}), 500

        @app.route("/api/directories/<script_type>/<dir_name>", methods=["GET", "DELETE"])
        def manage_directory(script_type, dir_name):
            """Get directory contents or delete directory."""
            try:
                # Use the instance's directories_base_path
                base_dir = os.path.join(self.directories_base_path, script_type)
                dir_path = os.path.join(base_dir, dir_name)
                
                # Security check
                if not os.path.abspath(dir_path).startswith(os.path.abspath(base_dir)):
                    return jsonify({"error": "Invalid directory path"}), 400
                
                if request.method == "GET":
                    # Get directory contents
                    if not os.path.exists(dir_path):
                        return jsonify({"error": "Directory not found"}), 404
                    
                    files = []
                    for item in os.listdir(dir_path):
                        item_path = os.path.join(dir_path, item)
                        if os.path.isfile(item_path):
                            file_size = os.path.getsize(item_path)
                            files.append({
                                "name": item,
                                "size": file_size,
                                "modified": os.path.getmtime(item_path),
                                "extension": os.path.splitext(item)[1]
                            })
                    
                    return jsonify({
                        "directory": dir_name,
                        "files": files,
                        "total_files": len(files)
                    })
                
                elif request.method == "DELETE":
                    # Delete directory
                    if not os.path.exists(dir_path):
                        return jsonify({"error": "Directory not found"}), 404
                    
                    import shutil
                    shutil.rmtree(dir_path)
                    return jsonify({"message": f"Directory '{dir_name}' deleted successfully"})
                    
            except Exception as e:
                return jsonify({"error": str(e)}), 500

        @app.route("/api/directories/<script_type>/<dir_name>/files", methods=["POST"])
        def upload_to_directory(script_type, dir_name):
            """Upload files to a specific directory."""
            try:
                # Use the instance's directories_base_path
                base_dir = os.path.join(self.directories_base_path, script_type)
                dir_path = os.path.join(base_dir, dir_name)
                
                # Security check
                if not os.path.abspath(dir_path).startswith(os.path.abspath(base_dir)):
                    return jsonify({"error": "Invalid directory path"}), 400
                
                # Create directory if it doesn't exist
                os.makedirs(dir_path, exist_ok=True)
                
                data = request.json
                files_data = data.get("files", [])
                
                uploaded_files = []
                for file_data in files_data:
                    filename = file_data.get("name", "").strip()
                    content = file_data.get("content", "")
                    
                    if not filename:
                        continue
                    
                    # Sanitize filename
                    import re
                    filename = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', filename)
                    
                    file_path = os.path.join(dir_path, filename)
                    
                    with open(file_path, "w", encoding="utf-8") as f:
                        f.write(content)
                    
                    uploaded_files.append(filename)
                
                return jsonify({
                    "uploaded_files": uploaded_files,
                    "message": f"Uploaded {len(uploaded_files)} files to '{dir_name}'"
                })
                
            except Exception as e:
                return jsonify({"error": str(e)}), 500

        @app.route("/api/directories/<script_type>/<dir_name>/files/<filename>", methods=["GET", "PUT", "DELETE"])
        def manage_directory_file(script_type, dir_name, filename):
            """Get file content, update file content, or delete file from directory."""
            try:
                # Use the instance's directories_base_path
                base_dir = os.path.join(self.directories_base_path, script_type)
                dir_path = os.path.join(base_dir, dir_name)
                file_path = os.path.join(dir_path, filename)
                
                # Security check
                if not os.path.abspath(file_path).startswith(os.path.abspath(base_dir)):
                    return jsonify({"error": "Invalid file path"}), 400
                
                if request.method == "GET":
                    # Get file content
                    if not os.path.exists(file_path):
                        return jsonify({"error": "File not found"}), 404
                    
                    with open(file_path, "r", encoding="utf-8") as f:
                        content = f.read()
                    
                    return jsonify({
                        "name": filename,
                        "content": content,
                        "directory": dir_name
                    })
                
                elif request.method == "PUT":
                    # Update file content
                    data = request.json
                    new_content = data.get("content", "")
                    
                    # Create directory if it doesn't exist
                    os.makedirs(dir_path, exist_ok=True)
                    
                    # Create backup before editing if file exists
                    if os.path.exists(file_path):
                        backup_path = file_path + ".backup"
                        import shutil
                        shutil.copy2(file_path, backup_path)
                    
                    with open(file_path, "w", encoding="utf-8") as f:
                        f.write(new_content)
                    
                    return jsonify({
                        "message": f"File '{filename}' updated successfully",
                        "name": filename,
                        "directory": dir_name
                    })
                
                elif request.method == "DELETE":
                    # Delete file
                    if not os.path.exists(file_path):
                        return jsonify({"error": "File not found"}), 404
                    
                    os.remove(file_path)
                    return jsonify({"message": f"File '{filename}' deleted successfully"})
                    
            except Exception as e:
                return jsonify({"error": str(e)}), 500

        @app.route("/api/directories/<script_type>/<dir_name>/rename", methods=["PUT"])
        def rename_directory(script_type, dir_name):
            """Rename a directory."""
            try:
                # Use the instance's directories_base_path
                base_dir = os.path.join(self.directories_base_path, script_type)
                old_dir_path = os.path.join(base_dir, dir_name)
                
                # Security check
                if not os.path.abspath(old_dir_path).startswith(os.path.abspath(base_dir)):
                    return jsonify({"error": "Invalid directory path"}), 400
                
                if not os.path.exists(old_dir_path):
                    return jsonify({"error": "Directory not found"}), 404
                
                data = request.json
                new_name = data.get("new_name", "").strip()
                
                if not new_name:
                    return jsonify({"error": "New directory name is required"}), 400
                
                # Sanitize new directory name
                import re
                new_name = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', new_name)
                
                new_dir_path = os.path.join(base_dir, new_name)
                
                if os.path.exists(new_dir_path):
                    return jsonify({"error": "Directory with new name already exists"}), 400
                
                os.rename(old_dir_path, new_dir_path)
                
                return jsonify({
                    "message": f"Directory renamed from '{dir_name}' to '{new_name}'",
                    "old_name": dir_name,
                    "new_name": new_name
                })
                
            except Exception as e:
                return jsonify({"error": str(e)}), 500

        @app.route("/api/directories/<script_type>/<dir_name>/files/<filename>/rename", methods=["PUT"])
        def rename_file(script_type, dir_name, filename):
            """Rename a file in a directory."""
            try:
                # Use the instance's directories_base_path
                base_dir = os.path.join(self.directories_base_path, script_type)
                dir_path = os.path.join(base_dir, dir_name)
                old_file_path = os.path.join(dir_path, filename)
                
                # Security check
                if not os.path.abspath(old_file_path).startswith(os.path.abspath(base_dir)):
                    return jsonify({"error": "Invalid file path"}), 400
                
                if not os.path.exists(old_file_path):
                    return jsonify({"error": "File not found"}), 404
                
                data = request.json
                new_name = data.get("new_name", "").strip()
                
                if not new_name:
                    return jsonify({"error": "New file name is required"}), 400
                
                # Sanitize new filename
                import re
                new_name = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', new_name)
                
                new_file_path = os.path.join(dir_path, new_name)
                
                if os.path.exists(new_file_path):
                    return jsonify({"error": "File with new name already exists"}), 400
                
                os.rename(old_file_path, new_file_path)
                
                return jsonify({
                    "message": f"File renamed from '{filename}' to '{new_name}'",
                    "old_name": filename,
                    "new_name": new_name,
                    "directory": dir_name
                })
                
            except Exception as e:
                return jsonify({"error": str(e)}), 500

        # --- Enhanced Project Directory Execution ---
        @app.route("/api/execute-project", methods=["POST"])
        def execute_project():
            """Execute a project directory with main file selection."""
            data = request.json
            machine_id = data.get("machine_id")
            project_type = data.get("project_type", "python")  # python, ansible, terraform
            directory_name = data.get("directory_name")
            main_file = data.get("main_file")  # Optional - will auto-detect if not provided
            custom_command = data.get("custom_command")  # Optional custom execution command
            remote = data.get("remote", True)  # Execute remotely by default
            extra_args = data.get("extra_args")  # Optional extra arguments
            
            if not directory_name:
                return jsonify({"success": False, "message": "Directory name is required"}), 400
            
            # Build project directory path
            project_dir = os.path.join(self.directories_base_path, project_type, directory_name)
            
            if not os.path.exists(project_dir):
                return jsonify({"success": False, "message": f"Project directory not found: {directory_name}"}), 404
            
            started_at = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
            
            try:
                if remote and machine_id:
                    # Find machine for remote execution
                    machine = None
                    for m in self.machines:
                        if str(m.get("id")) == str(machine_id):
                            machine = m
                            break
                    if not machine:
                        return jsonify({"success": False, "message": "Machine not found"}), 404
                    
                    # Create SSH client and execute remotely
                    client = SSHClient(
                        machine["host"],
                        machine["username"],
                        machine.get("password"),
                        machine.get("port", 22),
                        machine.get("key"),
                    )
                    client.login()
                    
                    result = client.run_project_directory(
                        project_dir=project_dir,
                        main_file=main_file,
                        project_type=project_type,
                        custom_command=custom_command,
                        remote=True,
                        extra_args=extra_args
                    )
                    
                    client.close()
                    
                elif project_type == "ansible":
                    # Ansible always runs locally (on dashboard host) targeting remote machines
                    # Create a dummy client to use the project execution logic
                    if machine_id:
                        machine = None
                        for m in self.machines:
                            if str(m.get("id")) == str(machine_id):
                                machine = m
                                break
                        if not machine:
                            return jsonify({"success": False, "message": "Machine not found for Ansible targeting"}), 404
                        
                        # Create client for inventory generation but don't use for execution
                        client = SSHClient(
                            machine["host"],
                            machine["username"],
                            machine.get("password"),
                            machine.get("port", 22),
                            machine.get("key"),
                        )
                        
                        # Use ansible-specific execution for local running
                        result = self._execute_ansible_project_local(
                            project_dir, main_file, custom_command, extra_args, client
                        )
                    else:
                        return jsonify({"success": False, "message": "Machine selection required for Ansible execution"}), 400
                        
                else:
                    # Local execution (for terraform and other types)
                    client = SSHClient("localhost", "local")  # Dummy client for local execution
                    result = client.run_project_directory(
                        project_dir=project_dir,
                        main_file=main_file,
                        project_type=project_type,
                        custom_command=custom_command,
                        remote=False,
                        extra_args=extra_args
                    )
                
                # Log execution
                completed_at = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
                exec_data = {
                    "id": str(uuid.uuid4()),
                    "machine_id": machine_id or "local",
                    "type": f"{project_type}_project",
                    "status": "success" if result.get("success") else "failed",
                    "command": f"{directory_name}/{result.get('main_file', main_file or 'auto-detected')}",
                    "output": result.get("output", ""),
                    "started_at": started_at,
                    "completed_at": completed_at,
                    "duration": result.get("execution_time", 0),
                    "logs": f"Project execution - Location: {result.get('execution_location', 'unknown')}",
                }
                self._insert_execution(exec_data)
                
                return jsonify({
                    "success": result.get("success", False),
                    "message": "Project executed successfully" if result.get("success") else "Project execution failed",
                    "output": result.get("output", ""),
                    "error": result.get("error", ""),
                    "main_file": result.get("main_file"),
                    "execution_location": result.get("execution_location"),
                    "execution_time": result.get("execution_time"),
                    "command": result.get("command"),
                    "directory": directory_name
                })
                
            except Exception as e:
                completed_at = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
                exec_data = {
                    "id": str(uuid.uuid4()),
                    "machine_id": machine_id or "local",
                    "type": f"{project_type}_project",
                    "status": "failed",
                    "command": f"{directory_name}/{main_file or 'unknown'}",
                    "output": "",
                    "started_at": started_at,
                    "completed_at": completed_at,
                    "duration": 0,
                    "logs": f"Project execution failed: {str(e)}",
                }
                self._insert_execution(exec_data)
                
                return jsonify({"success": False, "message": f"Project execution failed: {str(e)}"}), 500

        @app.route("/api/detect-main-file", methods=["POST"])
        def detect_main_file():
            """Detect the main file for a project directory."""
            data = request.json
            project_type = data.get("project_type", "python")
            directory_name = data.get("directory_name")
            
            if not directory_name:
                return jsonify({"success": False, "message": "Directory name is required"}), 400
            
            project_dir = os.path.join(self.directories_base_path, project_type, directory_name)
            
            if not os.path.exists(project_dir):
                return jsonify({"success": False, "message": f"Project directory not found: {directory_name}"}), 404
            
            # Create a dummy client to use the detection logic
            client = SSHClient("localhost", "local")
            main_file = client._detect_main_file(project_dir, project_type)
            
            # Also return list of all suitable files for user selection
            suitable_files = []
            try:
                for file in os.listdir(project_dir):
                    if project_type == "python" and file.endswith('.py'):
                        suitable_files.append(file)
                    elif project_type == "ansible" and file.endswith(('.yml', '.yaml')):
                        suitable_files.append(file)
                    elif project_type == "terraform" and file.endswith('.tf'):
                        suitable_files.append(file)
            except Exception as e:
                print(f"Error listing files: {e}")
            
            return jsonify({
                "success": True,
                "main_file": main_file,
                "suitable_files": sorted(suitable_files),
                "project_type": project_type,
                "directory": directory_name
            })

        @app.route("/api/execute-directory/<script_type>", methods=["POST"])
        def execute_directory_file(script_type):
            """Execute a file from a directory with built-in commands."""
            try:
                data = request.json
                machine_id = data.get("machine_id")
                dir_name = data.get("directory")
                filename = data.get("filename")
                custom_command = data.get("custom_command")
                
                if not machine_id or not dir_name or not filename:
                    return jsonify({"error": "Missing required parameters"}), 400
                
                # Find machine
                machine = next((m for m in self.machines if str(m.get("id")) == str(machine_id)), None)
                if not machine:
                    return jsonify({"error": "Machine not found"}), 404
                
                # Use the instance's directories_base_path
                base_dir = os.path.join(self.directories_base_path, script_type)
                dir_path = os.path.join(base_dir, dir_name)
                file_path = os.path.join(dir_path, filename)
                
                # Security check
                if not os.path.abspath(file_path).startswith(os.path.abspath(base_dir)):
                    return jsonify({"error": "Invalid file path"}), 400
                
                if not os.path.exists(file_path):
                    return jsonify({"error": "File not found"}), 404
                
                started_at = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
                
                try:
                    # For Ansible, use RemoteRunLib's built-in Ansible method
                    if script_type == "ansible":
                        client = SSHClient(
                            machine["host"],
                            machine["username"],
                            machine.get("password"),
                            machine.get("port", 22),
                            machine.get("key"),
                        )
                        # Note: No need to login for Ansible - it handles its own connection
                        
                        import time
                        t0 = time.time()
                        
                        if custom_command:
                            # For custom commands, just run them locally
                            import subprocess
                            try:
                                cd_command = f"cd {dir_path}"
                                exec_command = f"{cd_command} && {custom_command}"
                                result = subprocess.run(
                                    exec_command,
                                    shell=True,
                                    capture_output=True,
                                    text=True,
                                    timeout=300
                                )
                                output = result.stdout
                                errors = result.stderr if result.returncode != 0 else ""
                            except Exception as e:
                                output = ""
                                errors = str(e)
                        else:
                            if filename.endswith(('.yml', '.yaml')):
                                # Use RemoteRunLib's Ansible method - it runs locally and targets the remote machine
                                playbook_path = os.path.join(dir_path, filename)
                                result = client.run_ansible_playbook(playbook_path)
                                
                                if isinstance(result, dict):
                                    output = result.get("output", "")
                                    errors = result.get("error", "") if not result.get("success", True) else ""
                                else:
                                    output = str(result)
                                    errors = ""
                            else:
                                # For non-playbook files, just display content
                                try:
                                    with open(os.path.join(dir_path, filename), 'r') as f:
                                        output = f.read()
                                    errors = ""
                                except Exception as e:
                                    output = ""
                                    errors = str(e)
                        
                        t1 = time.time()
                        # No need to close client for Ansible as it manages its own connections
                    
                    else:
                        # For other script types, upload entire directory to remote machine and execute there
                        client = SSHClient(
                            machine["host"],
                            machine["username"],
                            machine.get("password"),
                            machine.get("port", 22),
                            machine.get("key"),
                        )
                        client.login()
                        
                        import time
                        t0 = time.time()
                        
                        # Always upload the entire directory to maintain context and dependencies
                        print(f"Uploading directory {dir_path} to remote machine...")
                        remote_dir_path = client.send_Directory(dir_path)
                        
                        if not remote_dir_path:
                            raise Exception("Failed to upload directory to remote machine")
                        
                        print(f"Directory uploaded to: {remote_dir_path}")
                        
                        # Detect remote OS to determine appropriate commands
                        remote_os_info = client.get_remote_os()
                        remote_os = remote_os_info.get("os", "linux").lower()
                        print(f"Detected remote OS: {remote_os}")
                        
                        # Build execution command based on script type and custom command
                        if custom_command:
                            # Use custom command in the remote directory
                            exec_command = f"cd '{remote_dir_path}' && {custom_command}"
                            print(f"Using custom command: {exec_command}")
                        else:
                            # Use built-in commands for specific script types with OS-aware execution
                            if script_type == "python":
                                if filename.endswith('.py'):
                                    # Determine Python command based on remote OS with fallback logic
                                    if remote_os == "windows":
                                        # On Windows, try python first
                                        python_cmd = "python"
                                    else:  # Linux, Unix, etc.
                                        # On Linux, prefer python3 but check availability
                                        python_cmd = "python3"
                                        # Check if python3 is available, fallback to python if not
                                        check_python3, _ = client.run_command("which python3 2>/dev/null || command -v python3", timeout=5, verbose=False)
                                        if not check_python3.strip():
                                            # python3 not found, try python
                                            check_python, _ = client.run_command("which python 2>/dev/null || command -v python", timeout=5, verbose=False)
                                            if check_python.strip():
                                                python_cmd = "python"
                                            else:
                                                # Neither found, use python3 anyway and let it fail with a proper error
                                                python_cmd = "python3"
                                    
                                    # Python execution in remote directory with full context
                                    exec_command = f"cd '{remote_dir_path}' && {python_cmd} {filename}"
                                    print(f"Python execution command: {exec_command}")
                                else:
                                    # Generic file execution
                                    if remote_os == "windows":
                                        exec_command = f"cd '{remote_dir_path}' && type {filename}"
                                    else:
                                        exec_command = f"cd '{remote_dir_path}' && cat {filename}"
                            elif script_type == "terraform":
                                if filename.endswith('.tf'):
                                    # Terraform execution with proper initialization
                                    exec_command = f"cd '{remote_dir_path}' && terraform init && terraform plan -out=tfplan && terraform apply -auto-approve tfplan"
                                else:
                                    # Generic file execution
                                    if remote_os == "windows":
                                        exec_command = f"cd '{remote_dir_path}' && type {filename}"
                                    else:
                                        exec_command = f"cd '{remote_dir_path}' && cat {filename}"
                            else:
                                # Generic execution based on OS
                                if remote_os == "windows":
                                    exec_command = f"cd '{remote_dir_path}' && type {filename}"
                                else:
                                    exec_command = f"cd '{remote_dir_path}' && cat {filename}"
                        
                        # Execute command on remote machine
                        output, errors = client.run_command(exec_command)
                        
                        t1 = time.time()
                        client.close()
                    
                    status = "success" if not errors else "failed"
                    completed_at = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
                    duration = t1 - t0
                    
                    # Insert execution history
                    exec_data = {
                        "id": str(uuid.uuid4()),
                        "machine_id": machine_id,
                        "type": f"{script_type}_directory",
                        "status": status,
                        "command": f"{dir_name}/{filename}",
                        "output": str(output),
                        "started_at": started_at,
                        "completed_at": completed_at,
                        "duration": duration,
                        "logs": f"Executed from directory: {dir_name}",
                    }
                    self._insert_execution(exec_data)
                    
                    return jsonify({
                        "success": True,
                        "output": output,
                        "directory": dir_name,
                        "filename": filename,
                        "execution_time": duration
                    })
                    
                except Exception as e:
                    completed_at = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
                    duration = 0
                    
                    # Insert failed execution history
                    exec_data = {
                        "id": str(uuid.uuid4()),
                        "machine_id": machine_id,
                        "type": f"{script_type}_directory",
                        "status": "failed",
                        "command": f"{dir_name}/{filename}",
                        "output": "",
                        "started_at": started_at,
                        "completed_at": completed_at,
                        "duration": duration,
                        "logs": str(e),
                    }
                    self._insert_execution(exec_data)
                    
                    return jsonify({"success": False, "error": str(e)}), 500
                    
            except Exception as e:
                return jsonify({"error": str(e)}), 500

        @app.route('/api/ping-machine', methods=['POST'])
        def ping_machine():
            """Endpoint to ping a machine by machine_id."""
            data = request.json
            machine_id = data.get('machine_id')
            if not machine_id:
                return jsonify({'error': 'Machine ID is required'}), 400

            # Find the machine by ID
            machine = next((m for m in self.machines if str(m.get('id')) == str(machine_id)), None)
            if not machine:
                return jsonify({'error': 'Machine not found'}), 404


            try:
                client = SSHClient(
                    machine["host"],
                    machine["username"],
                    machine.get("password"),
                    machine.get("port", 22),
                    machine.get("key"),
                )
                # No need to login for ping (ping is local)
                online = client.ping()
                if online:
                    return jsonify({'success': True, 'message': f'{machine["host"]} is reachable'}), 200
                else:
                    return jsonify({'success': False, 'message': f'{machine["host"]} is not reachable'}), 400
            except Exception as e:
                return jsonify({'success': False, 'message': 'An error occurred', 'error': str(e)}), 500


        @app.route("/api/execution/<exec_id>", methods=["GET"])
        def get_execution_detail(exec_id):
            c = self.conn.cursor()
            c.execute("SELECT * FROM execution_history WHERE id = ?", (exec_id,))
            row = c.fetchone()
            if not row:
                return jsonify({"error": "Not found"}), 404
            data = dict(row)
            # Add machine host and name
            c.execute("SELECT host, name FROM machines WHERE id = ?", (data["machine_id"],))
            mrow = c.fetchone()
            if mrow:
                data["machine_host"] = mrow["host"]
                data["machine_name"] = mrow["name"]
            else:
                data["machine_host"] = ""
                data["machine_name"] = ""
            return jsonify(data)

        # === DOCKER API ENDPOINTS ===
        
        @app.route("/api/docker/info", methods=["POST"])
        def docker_info():
            """Get Docker system information for a machine."""
            data = request.json
            machine_id = data.get("machine_id")
            
            if machine_id == "localhost":
                # Local Docker info
                try:
                    import subprocess
                    version_result = subprocess.run(["docker", "--version"], capture_output=True, text=True, timeout=30)
                    info_result = subprocess.run(["docker", "info", "--format", "json"], capture_output=True, text=True, timeout=30)
                    
                    if version_result.returncode != 0:
                        return jsonify({"success": False, "error": "Docker is not installed on localhost"})
                    
                    return jsonify({
                        "success": True,
                        "version": version_result.stdout.strip(),
                        "info": info_result.stdout.strip() if info_result.returncode == 0 else "",
                        "errors": info_result.stderr if info_result.returncode != 0 else ""
                    })
                except Exception as e:
                    return jsonify({"success": False, "error": str(e)})
            
            # Remote Docker info
            machine = next((m for m in self.machines if str(m.get("id")) == str(machine_id)), None)
            if not machine:
                return jsonify({"success": False, "error": "Machine not found"}), 404
            
            try:
                client = SSHClient(
                    machine["host"],
                    machine["username"],
                    machine.get("password"),
                    machine.get("port", 22),
                    machine.get("key"),
                )
                client.login()
                result = client.docker_info()
                client.close()
                return jsonify(result)
            except Exception as e:
                return jsonify({"success": False, "error": str(e)}), 500

        @app.route("/api/docker/images", methods=["POST"])
        def docker_list_images():
            """List Docker images for a machine."""
            data = request.json
            machine_id = data.get("machine_id")
            
            if machine_id == "localhost":
                # Local Docker images
                try:
                    import subprocess
                    result = subprocess.run([
                        "docker", "images", "--format", 
                        "table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.CreatedAt}}\t{{.Size}}"
                    ], capture_output=True, text=True, timeout=30)
                    
                    if result.returncode != 0:
                        return jsonify({"success": False, "error": "Failed to list Docker images"})
                    
                    return jsonify({
                        "success": True,
                        "output": result.stdout.strip(),
                        "errors": result.stderr
                    })
                except Exception as e:
                    return jsonify({"success": False, "error": str(e)})
            
            # Remote Docker images
            machine = next((m for m in self.machines if str(m.get("id")) == str(machine_id)), None)
            if not machine:
                return jsonify({"success": False, "error": "Machine not found"}), 404
            
            try:
                client = SSHClient(
                    machine["host"],
                    machine["username"],
                    machine.get("password"),
                    machine.get("port", 22),
                    machine.get("key"),
                )
                client.login()
                result = client.docker_list_images()
                client.close()
                return jsonify(result)
            except Exception as e:
                return jsonify({"success": False, "error": str(e)}), 500

        @app.route("/api/docker/containers", methods=["POST"])
        def docker_list_containers():
            """List Docker containers for a machine."""
            data = request.json
            machine_id = data.get("machine_id")
            all_containers = data.get("all", True)
            
            if machine_id == "localhost":
                # Local Docker containers
                try:
                    import subprocess
                    flag = "-a" if all_containers else ""
                    cmd = ["docker", "ps"] + (["-a"] if all_containers else []) + [
                        "--format", "table {{.ID}}\t{{.Image}}\t{{.Command}}\t{{.CreatedAt}}\t{{.Status}}\t{{.Ports}}\t{{.Names}}"
                    ]
                    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
                    
                    if result.returncode != 0:
                        return jsonify({"success": False, "error": "Failed to list Docker containers"})
                    
                    return jsonify({
                        "success": True,
                        "output": result.stdout.strip(),
                        "errors": result.stderr
                    })
                except Exception as e:
                    return jsonify({"success": False, "error": str(e)})
            
            # Remote Docker containers
            machine = next((m for m in self.machines if str(m.get("id")) == str(machine_id)), None)
            if not machine:
                return jsonify({"success": False, "error": "Machine not found"}), 404
            
            try:
                client = SSHClient(
                    machine["host"],
                    machine["username"],
                    machine.get("password"),
                    machine.get("port", 22),
                    machine.get("key"),
                )
                client.login()
                result = client.docker_list_containers(all_containers)
                client.close()
                return jsonify(result)
            except Exception as e:
                return jsonify({"success": False, "error": str(e)}), 500

        @app.route("/api/docker/networks", methods=["POST"])
        def docker_list_networks():
            """List Docker networks for a machine."""
            data = request.json
            machine_id = data.get("machine_id")
            
            if machine_id == "localhost":
                # Local Docker networks
                try:
                    import subprocess
                    result = subprocess.run([
                        "docker", "network", "ls", "--format", 
                        "table {{.ID}}\t{{.Name}}\t{{.Driver}}\t{{.Scope}}"
                    ], capture_output=True, text=True, timeout=30)
                    
                    if result.returncode != 0:
                        return jsonify({"success": False, "error": "Failed to list Docker networks"})
                    
                    return jsonify({
                        "success": True,
                        "output": result.stdout.strip(),
                        "errors": result.stderr
                    })
                except Exception as e:
                    return jsonify({"success": False, "error": str(e)})
            
            # Remote Docker networks
            machine = next((m for m in self.machines if str(m.get("id")) == str(machine_id)), None)
            if not machine:
                return jsonify({"success": False, "error": "Machine not found"}), 404
            
            try:
                client = SSHClient(
                    machine["host"],
                    machine["username"],
                    machine.get("password"),
                    machine.get("port", 22),
                    machine.get("key"),
                )
                client.login()
                result = client.docker_list_networks()
                client.close()
                return jsonify(result)
            except Exception as e:
                return jsonify({"success": False, "error": str(e)}), 500

        @app.route("/api/docker/volumes", methods=["POST"])
        def docker_list_volumes():
            """List Docker volumes for a machine."""
            data = request.json
            machine_id = data.get("machine_id")
            
            if machine_id == "localhost":
                # Local Docker volumes
                try:
                    import subprocess
                    result = subprocess.run([
                        "docker", "volume", "ls", "--format", 
                        "table {{.Driver}}\t{{.Name}}"
                    ], capture_output=True, text=True, timeout=30)
                    
                    if result.returncode != 0:
                        return jsonify({"success": False, "error": "Failed to list Docker volumes"})
                    
                    return jsonify({
                        "success": True,
                        "output": result.stdout.strip(),
                        "errors": result.stderr
                    })
                except Exception as e:
                    return jsonify({"success": False, "error": str(e)})
            
            # Remote Docker volumes
            machine = next((m for m in self.machines if str(m.get("id")) == str(machine_id)), None)
            if not machine:
                return jsonify({"success": False, "error": "Machine not found"}), 404
            
            try:
                client = SSHClient(
                    machine["host"],
                    machine["username"],
                    machine.get("password"),
                    machine.get("port", 22),
                    machine.get("key"),
                )
                client.login()
                result = client.docker_list_volumes()
                client.close()
                return jsonify(result)
            except Exception as e:
                return jsonify({"success": False, "error": str(e)}), 500

        @app.route("/api/docker/container/logs", methods=["POST"])
        def docker_container_logs():
            """Get Docker container logs."""
            data = request.json
            machine_id = data.get("machine_id")
            container_id = data.get("container_id")
            tail = data.get("tail", 50)
            
            if not container_id:
                return jsonify({"success": False, "error": "Container ID is required"}), 400
            
            if machine_id == "localhost":
                # Local Docker logs
                try:
                    import subprocess
                    result = subprocess.run([
                        "docker", "logs", "--tail", str(tail), container_id
                    ], capture_output=True, text=True, timeout=30)
                    
                    return jsonify({
                        "success": True,
                        "output": result.stdout.strip(),
                        "errors": result.stderr
                    })
                except Exception as e:
                    return jsonify({"success": False, "error": str(e)})
            
            # Remote Docker logs
            machine = next((m for m in self.machines if str(m.get("id")) == str(machine_id)), None)
            if not machine:
                return jsonify({"success": False, "error": "Machine not found"}), 404
            
            try:
                client = SSHClient(
                    machine["host"],
                    machine["username"],
                    machine.get("password"),
                    machine.get("port", 22),
                    machine.get("key"),
                )
                client.login()
                result = client.docker_container_logs(container_id, tail)
                client.close()
                return jsonify(result)
            except Exception as e:
                return jsonify({"success": False, "error": str(e)}), 500

        @app.route("/api/docker/container/inspect", methods=["POST"])
        def docker_inspect_container():
            """Inspect a Docker container."""
            data = request.json
            machine_id = data.get("machine_id")
            container_id = data.get("container_id")
            
            if not container_id:
                return jsonify({"success": False, "error": "Container ID is required"}), 400
            
            if machine_id == "localhost":
                # Local Docker inspect
                try:
                    import subprocess
                    result = subprocess.run([
                        "docker", "inspect", container_id
                    ], capture_output=True, text=True, timeout=30)
                    
                    return jsonify({
                        "success": result.returncode == 0,
                        "output": result.stdout.strip(),
                        "errors": result.stderr
                    })
                except Exception as e:
                    return jsonify({"success": False, "error": str(e)})
            
            # Remote Docker inspect
            machine = next((m for m in self.machines if str(m.get("id")) == str(machine_id)), None)
            if not machine:
                return jsonify({"success": False, "error": "Machine not found"}), 404
            
            try:
                client = SSHClient(
                    machine["host"],
                    machine["username"],
                    machine.get("password"),
                    machine.get("port", 22),
                    machine.get("key"),
                )
                client.login()
                result = client.docker_inspect_container(container_id)
                client.close()
                return jsonify(result)
            except Exception as e:
                return jsonify({"success": False, "error": str(e)}), 500

        @app.route("/api/docker/pull", methods=["POST"])
        def docker_pull_image():
            """Pull a Docker image."""
            import datetime, time
            data = request.json
            machine_id = data.get("machine_id")
            image_name = data.get("image_name")
            
            if not image_name:
                return jsonify({"success": False, "error": "Image name is required"}), 400
            
            started_at = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
            
            try:
                if machine_id == "localhost":
                    # Local Docker pull
                    import subprocess
                    t0 = time.time()
                    result = subprocess.run([
                        "docker", "pull", image_name
                    ], capture_output=True, text=True, timeout=600)
                    t1 = time.time()
                    
                    success = result.returncode == 0
                    output = result.stdout.strip()
                    errors = result.stderr
                else:
                    # Remote Docker pull
                    machine = next((m for m in self.machines if str(m.get("id")) == str(machine_id)), None)
                    if not machine:
                        return jsonify({"success": False, "error": "Machine not found"}), 404
                    
                    client = SSHClient(
                        machine["host"],
                        machine["username"],
                        machine.get("password"),
                        machine.get("port", 22),
                        machine.get("key"),
                    )
                    client.login()
                    t0 = time.time()
                    result = client.docker_pull_image(image_name)
                    t1 = time.time()
                    client.close()
                    
                    success = result.get("success", False)
                    output = result.get("output", "")
                    errors = result.get("errors", "")
                
                # Log execution
                completed_at = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
                exec_data = {
                    "id": str(uuid.uuid4()),
                    "machine_id": machine_id,
                    "type": "docker_pull",
                    "status": "success" if success else "failed",
                    "command": f"docker pull {image_name}",
                    "output": output,
                    "started_at": started_at,
                    "completed_at": completed_at,
                    "duration": t1 - t0,
                    "logs": errors or "",
                }
                self._insert_execution(exec_data)
                
                return jsonify({
                    "success": success,
                    "output": output,
                    "errors": errors
                })
                
            except Exception as e:
                # Log failed execution
                completed_at = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
                exec_data = {
                    "id": str(uuid.uuid4()),
                    "machine_id": machine_id,
                    "type": "docker_pull",
                    "status": "failed",
                    "command": f"docker pull {image_name}",
                    "output": "",
                    "started_at": started_at,
                    "completed_at": completed_at,
                    "duration": 0,
                    "logs": str(e),
                }
                self._insert_execution(exec_data)
                
                return jsonify({"success": False, "error": str(e)}), 500

        @app.route("/api/docker/run", methods=["POST"])
        def docker_run_container():
            """Run a Docker container."""
            import datetime, time
            data = request.json
            machine_id = data.get("machine_id")
            image_name = data.get("image_name")
            container_name = data.get("container_name")
            ports = data.get("ports", [])  # ["8080:80", "3000:3000"]
            volumes = data.get("volumes", [])  # ["/host/path:/container/path"]
            env_vars = data.get("env_vars", [])  # ["VAR=value"]
            detach = data.get("detach", True)
            additional_args = data.get("additional_args", "")
            
            if not image_name:
                return jsonify({"success": False, "error": "Image name is required"}), 400
            
            started_at = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
            
            try:
                if machine_id == "localhost":
                    # Local Docker run
                    import subprocess
                    cmd = ["docker", "run"]

                    cmd.append("-it")  # Interactive terminal
                    
                    if detach:
                        cmd.append("-d")
                    
                    if container_name:
                        cmd.extend(["--name", container_name])
                    
                    for port_mapping in ports:
                        cmd.extend(["-p", port_mapping])
                    
                    for volume_mapping in volumes:
                        cmd.extend(["-v", volume_mapping])
                    
                    for env_var in env_vars:
                        cmd.extend(["-e", env_var])
                    
                    if additional_args:
                        cmd.extend(additional_args.split())
                    
                    cmd.append(image_name)

                    print("Running command:", " ".join(cmd))
                    
                    t0 = time.time()
                    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
                    t1 = time.time()
                    
                    success = result.returncode == 0
                    output = result.stdout.strip()
                    errors = result.stderr
                    command = " ".join(cmd)
                else:
                    # Remote Docker run
                    machine = next((m for m in self.machines if str(m.get("id")) == str(machine_id)), None)
                    if not machine:
                        return jsonify({"success": False, "error": "Machine not found"}), 404
                    
                    client = SSHClient(
                        machine["host"],
                        machine["username"],
                        machine.get("password"),
                        machine.get("port", 22),
                        machine.get("key"),
                    )
                    client.login()
                    t0 = time.time()
                    result = client.docker_run_container(
                        image_name, container_name, ports, volumes, env_vars, detach, additional_args
                    )
                    t1 = time.time()
                    client.close()
                    
                    success = result.get("success", False)
                    output = result.get("output", "")
                    errors = result.get("errors", "")
                    command = result.get("command", "")
                
                # Log execution
                completed_at = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
                exec_data = {
                    "id": str(uuid.uuid4()),
                    "machine_id": machine_id,
                    "type": "docker_run",
                    "status": "success" if success else "failed",
                    "command": command,
                    "output": output,
                    "started_at": started_at,
                    "completed_at": completed_at,
                    "duration": t1 - t0,
                    "logs": errors or "",
                }
                self._insert_execution(exec_data)
                
                return jsonify({
                    "success": success,
                    "output": output,
                    "errors": errors,
                    "command": command
                })
                
            except Exception as e:
                # Log failed execution
                completed_at = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
                exec_data = {
                    "id": str(uuid.uuid4()),
                    "machine_id": machine_id,
                    "type": "docker_run",
                    "status": "failed",
                    "command": f"docker run {image_name}",
                    "output": "",
                    "started_at": started_at,
                    "completed_at": completed_at,
                    "duration": 0,
                    "logs": str(e),
                }
                self._insert_execution(exec_data)
                
                return jsonify({"success": False, "error": str(e)}), 500

        @app.route("/api/docker/debug", methods=["POST"])
        def docker_debug():
            """Debug Docker container/image identification and operations."""
            data = request.json
            machine_id = data.get("machine_id")
            identifier = data.get("identifier")  # Could be container ID or image ID
            
            if not identifier:
                return jsonify({"success": False, "error": "Identifier is required"}), 400
            
            try:
                debug_info = {
                    "identifier": identifier,
                    "is_container": False,
                    "is_image": False,
                    "containers_from_image": [],
                    "container_status": None,
                    "recommendations": []
                }
                
                if machine_id == "localhost":
                    import subprocess
                    
                    # Check if it's a container
                    container_check = subprocess.run(
                        ["docker", "ps", "-a", "--filter", f"id={identifier}", "--format", "{{.ID}}\t{{.Image}}\t{{.Status}}\t{{.Names}}"],
                        capture_output=True, text=True, timeout=10
                    )
                    
                    if container_check.returncode == 0 and container_check.stdout.strip():
                        debug_info["is_container"] = True
                        lines = container_check.stdout.strip().split('\n')
                        if lines:
                            parts = lines[0].split('\t')
                            debug_info["container_status"] = parts[2] if len(parts) > 2 else "Unknown"
                            debug_info["container_name"] = parts[3] if len(parts) > 3 else "Unknown"
                            
                            if "Up" in debug_info["container_status"]:
                                debug_info["recommendations"].append("Container is already running")
                            elif "Exited" in debug_info["container_status"]:
                                debug_info["recommendations"].append("Container can be started with 'docker start'")
                    
                    # Check if it's an image
                    image_check = subprocess.run(
                        ["docker", "images", "--filter", f"id={identifier}", "--format", "{{.ID}}\t{{.Repository}}\t{{.Tag}}"],
                        capture_output=True, text=True, timeout=10
                    )
                    
                    if image_check.returncode == 0 and image_check.stdout.strip():
                        debug_info["is_image"] = True
                        debug_info["recommendations"].append("This is an image ID. Use 'docker run' to create a new container")
                        
                        # Find containers created from this image
                        containers_check = subprocess.run(
                            ["docker", "ps", "-a", "--filter", f"ancestor={identifier}", "--format", "{{.ID}}\t{{.Image}}\t{{.Status}}\t{{.Names}}"],
                            capture_output=True, text=True, timeout=10
                        )
                        
                        if containers_check.returncode == 0 and containers_check.stdout.strip():
                            lines = containers_check.stdout.strip().split('\n')
                            for line in lines:
                                parts = line.split('\t')
                                if len(parts) >= 4:
                                    debug_info["containers_from_image"].append({
                                        "id": parts[0],
                                        "image": parts[1],
                                        "status": parts[2],
                                        "name": parts[3]
                                    })
                
                return jsonify({"success": True, "debug_info": debug_info})
                
            except Exception as e:
                return jsonify({"success": False, "error": str(e)}), 500

        @app.route("/api/docker/container/action", methods=["POST"])
        def docker_container_action():
            """Perform actions on Docker containers (start, stop, restart, remove)."""
            import datetime, time
            data = request.json
            machine_id = data.get("machine_id")
            container_id = data.get("container_id")
            action = data.get("action")  # start, stop, restart, remove
            force = data.get("force", False)
            
            if not container_id or not action:
                return jsonify({"success": False, "error": "Container ID and action are required"}), 400
            
            if action not in ["start", "stop", "restart", "remove"]:
                return jsonify({"success": False, "error": "Invalid action"}), 400
            
            started_at = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
            
            try:
                if machine_id == "localhost":
                    # Local Docker action
                    import subprocess
                    cmd = ["docker", action]
                    if action == "remove":
                        cmd = ["docker", "rm"]
                        if force:
                            cmd.append("-f")
                    elif action == "start":
                        # For start action, ensure we use the right command
                        cmd = ["docker", "start"]
                    cmd.append(container_id)
                    
                    t0 = time.time()
                    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
                    t1 = time.time()
                    
                    # Docker start is successful if return code is 0 and we get output (container ID)
                    success = result.returncode == 0
                    output = result.stdout.strip()
                    errors = result.stderr.strip()
                    command = " ".join(cmd)
                    
                    # Additional validation for start command
                    if action == "start" and success and not output:
                        # Sometimes docker start succeeds but doesn't return container ID
                        # Let's verify the container is actually running
                        verify_result = subprocess.run(
                            ["docker", "ps", "-q", "--filter", f"id={container_id}"], 
                            capture_output=True, text=True, timeout=10
                        )
                        if verify_result.returncode == 0 and verify_result.stdout.strip():
                            output = container_id  # Use the container ID as output
                        else:
                            success = False
                            errors = f"Container start command succeeded but container is not running. {errors}"
                else:
                    # Remote Docker action
                    machine = next((m for m in self.machines if str(m.get("id")) == str(machine_id)), None)
                    if not machine:
                        return jsonify({"success": False, "error": "Machine not found"}), 404
                    
                    client = SSHClient(
                        machine["host"],
                        machine["username"],
                        machine.get("password"),
                        machine.get("port", 22),
                        machine.get("key"),
                    )
                    client.login()
                    t0 = time.time()
                    
                    if action == "start":
                        result = client.docker_start_container(container_id)
                    elif action == "stop":
                        result = client.docker_stop_container(container_id)
                    elif action == "restart":
                        result = client.docker_restart_container(container_id)
                    elif action == "remove":
                        result = client.docker_remove_container(container_id, force)
                    
                    t1 = time.time()
                    client.close()
                    
                    success = result.get("success", False)
                    output = result.get("output", "")
                    errors = result.get("errors", "")
                    command = f"docker {action} {container_id}"
                
                # Log execution
                completed_at = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
                exec_data = {
                    "id": str(uuid.uuid4()),
                    "machine_id": machine_id,
                    "type": f"docker_{action}",
                    "status": "success" if success else "failed",
                    "command": command,
                    "output": output,
                    "started_at": started_at,
                    "completed_at": completed_at,
                    "duration": t1 - t0,
                    "logs": errors or "",
                }
                self._insert_execution(exec_data)
                
                return jsonify({
                    "success": success,
                    "output": output,
                    "errors": errors
                })
                
            except Exception as e:
                # Log failed execution
                completed_at = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
                exec_data = {
                    "id": str(uuid.uuid4()),
                    "machine_id": machine_id,
                    "type": f"docker_{action}",
                    "status": "failed",
                    "command": f"docker {action} {container_id}",
                    "output": "",
                    "started_at": started_at,
                    "completed_at": completed_at,
                    "duration": 0,
                    "logs": str(e),
                }
                self._insert_execution(exec_data)
                
                return jsonify({"success": False, "error": str(e)}), 500

        @app.route("/api/docker/exec", methods=["POST"])
        def docker_exec_command():
            """Execute a command inside a Docker container."""
            import datetime, time
            data = request.json
            machine_id = data.get("machine_id")
            container_id = data.get("container_id")
            command = data.get("command")
            interactive = data.get("interactive", False)
            
            if not container_id or not command:
                return jsonify({"success": False, "error": "Container ID and command are required"}), 400
            
            started_at = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
            
            try:
                if machine_id == "localhost":
                    # Local Docker exec
                    import subprocess
                    cmd = ["docker", "exec"]
                    if interactive:
                        cmd.extend(["-it"])
                    cmd.extend([container_id] + command.split())
                    
                    t0 = time.time()
                    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
                    t1 = time.time()
                    
                    success = result.returncode == 0
                    output = result.stdout.strip()
                    errors = result.stderr
                    exec_command = " ".join(cmd)
                else:
                    # Remote Docker exec
                    machine = next((m for m in self.machines if str(m.get("id")) == str(machine_id)), None)
                    if not machine:
                        return jsonify({"success": False, "error": "Machine not found"}), 404
                    
                    client = SSHClient(
                        machine["host"],
                        machine["username"],
                        machine.get("password"),
                        machine.get("port", 22),
                        machine.get("key"),
                    )
                    client.login()
                    t0 = time.time()
                    result = client.docker_exec_command(container_id, command, interactive)
                    t1 = time.time()
                    client.close()
                    
                    success = result.get("success", False)
                    output = result.get("output", "")
                    errors = result.get("errors", "")
                    exec_command = result.get("command", "")
                
                # Log execution
                completed_at = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
                exec_data = {
                    "id": str(uuid.uuid4()),
                    "machine_id": machine_id,
                    "type": "docker_exec",
                    "status": "success" if success else "failed",
                    "command": exec_command,
                    "output": output,
                    "started_at": started_at,
                    "completed_at": completed_at,
                    "duration": t1 - t0,
                    "logs": errors or "",
                }
                self._insert_execution(exec_data)
                
                return jsonify({
                    "success": success,
                    "output": output,
                    "errors": errors,
                    "command": exec_command
                })
                
            except Exception as e:
                # Log failed execution
                completed_at = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
                exec_data = {
                    "id": str(uuid.uuid4()),
                    "machine_id": machine_id,
                    "type": "docker_exec",
                    "status": "failed",
                    "command": f"docker exec {container_id} {command}",
                    "output": "",
                    "started_at": started_at,
                    "completed_at": completed_at,
                    "duration": 0,
                    "logs": str(e),
                }
                self._insert_execution(exec_data)
                
                return jsonify({"success": False, "error": str(e)}), 500

        @app.route("/api/docker/stats", methods=["POST"])
        def docker_container_stats():
            """Get real-time stats for a Docker container."""
            data = request.json
            machine_id = data.get("machine_id")
            container_id = data.get("container_id")
            
            if not container_id:
                return jsonify({"success": False, "error": "Container ID is required"}), 400
            
            if machine_id == "localhost":
                # Local Docker stats
                try:
                    import subprocess
                    result = subprocess.run([
                        "docker", "stats", "--no-stream", "--format", 
                        "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}", 
                        container_id
                    ], capture_output=True, text=True, timeout=30)
                    
                    return jsonify({
                        "success": result.returncode == 0,
                        "output": result.stdout.strip(),
                        "errors": result.stderr
                    })
                except Exception as e:
                    return jsonify({"success": False, "error": str(e)})
            
            # Remote Docker stats
            machine = next((m for m in self.machines if str(m.get("id")) == str(machine_id)), None)
            if not machine:
                return jsonify({"success": False, "error": "Machine not found"}), 404
            
            try:
                client = SSHClient(
                    machine["host"],
                    machine["username"],
                    machine.get("password"),
                    machine.get("port", 22),
                    machine.get("key"),
                )
                client.login()
                result = client.docker_get_container_stats(container_id)
                client.close()
                return jsonify(result)
            except Exception as e:
                return jsonify({"success": False, "error": str(e)}), 500

        @app.route("/api/docker/compose/up", methods=["POST"])
        def docker_compose_up():
            """Run docker-compose up."""
            import datetime, time, os, subprocess
            data = request.json
            machine_id = data.get("machine_id")
            compose_content = data.get("compose_content")
            compose_file = data.get("compose_file", "docker-compose.yml")
            detach = data.get("detach", True)
            build = data.get("build", False)
            
            if not compose_content:
                return jsonify({"success": False, "error": "Docker compose content is required"}), 400
            
            started_at = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
            
            try:
                if machine_id == "localhost":
                    # Local Docker Compose
                    import tempfile
                    with tempfile.TemporaryDirectory() as temp_dir:
                        compose_file_path = os.path.join(temp_dir, compose_file)
                        with open(compose_file_path, 'w') as f:
                            f.write(compose_content)
                        
                        cmd = ["docker-compose", "-f", compose_file_path, "up"]
                        if detach:
                            cmd.append("-d")
                        if build:
                            cmd.append("--build")
                        
                        t0 = time.time()
                        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
                        t1 = time.time()
                        
                        success = result.returncode == 0
                        output = result.stdout.strip()
                        errors = result.stderr
                        command = " ".join(cmd)
                else:
                    # Remote Docker Compose
                    machine = next((m for m in self.machines if str(m.get("id")) == str(machine_id)), None)
                    if not machine:
                        return jsonify({"success": False, "error": "Machine not found"}), 404
                    
                    client = SSHClient(
                        machine["host"],
                        machine["username"],
                        machine.get("password"),
                        machine.get("port", 22),
                        machine.get("key"),
                    )
                    client.login()
                    
                    # Create temporary compose file on remote
                    import tempfile
                    with tempfile.NamedTemporaryFile(mode='w', suffix='.yml', delete=False) as tmp_compose:
                        tmp_compose.write(compose_content)
                        tmp_compose.flush()
                        
                        # Upload compose file
                        remote_compose_path = client.send_File(tmp_compose.name)
                        os.unlink(tmp_compose.name)
                        
                        if not remote_compose_path:
                            client.close()
                            return jsonify({"success": False, "error": "Failed to upload compose file"})
                    
                    t0 = time.time()
                    result = client.docker_compose_up(remote_compose_path, detach, build)
                    t1 = time.time()
                    client.close()
                    
                    success = result.get("success", False)
                    output = result.get("output", "")
                    errors = result.get("errors", "")
                    command = result.get("command", f"docker-compose up")
                
                # Log execution
                completed_at = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
                exec_data = {
                    "id": str(uuid.uuid4()),
                    "machine_id": machine_id,
                    "type": "docker_compose_up",
                    "status": "success" if success else "failed",
                    "command": command,
                    "output": output,
                    "started_at": started_at,
                    "completed_at": completed_at,
                    "duration": t1 - t0,
                    "logs": errors or "",
                }
                self._insert_execution(exec_data)
                
                return jsonify({
                    "success": success,
                    "output": output,
                    "errors": errors
                })
                
            except Exception as e:
                # Log failed execution
                completed_at = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
                exec_data = {
                    "id": str(uuid.uuid4()),
                    "machine_id": machine_id,
                    "type": "docker_compose_up",
                    "status": "failed",
                    "command": f"docker-compose up",
                    "output": "",
                    "started_at": started_at,
                    "completed_at": completed_at,
                    "duration": 0,
                    "logs": str(e),
                }
                self._insert_execution(exec_data)
                
                return jsonify({"success": False, "error": str(e)}), 500

        @app.route("/api/docker/system/prune", methods=["POST"])
        def docker_system_prune():
            """Clean up Docker system (remove unused data)."""
            import datetime, time
            data = request.json
            machine_id = data.get("machine_id")
            all_unused = data.get("all", False)
            volumes = data.get("volumes", False)
            containers = data.get("containers", False)
            
            started_at = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
            
            try:
                if machine_id == "localhost":
                    # Local Docker system prune
                    import subprocess
                    
                    output_lines = []
                    
                    # Remove unused containers first if requested
                    if containers:
                        containers_cmd = ["docker", "container", "prune", "-f"]
                        containers_result = subprocess.run(containers_cmd, capture_output=True, text=True, timeout=300)
                        if containers_result.returncode == 0:
                            output_lines.append("Container cleanup:")
                            output_lines.append(containers_result.stdout.strip())
                            output_lines.append("")
                    
                    # Standard system prune
                    cmd = ["docker", "system", "prune", "-f"]
                    if all_unused:
                        cmd.append("-a")
                    if volumes:
                        cmd.append("--volumes")
                    
                    t0 = time.time()
                    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
                    t1 = time.time()
                    
                    success = result.returncode == 0
                    
                    # Combine outputs
                    if output_lines:
                        output_lines.append("System cleanup:")
                        output_lines.append(result.stdout.strip())
                        output = "\n".join(output_lines)
                    else:
                        output = result.stdout.strip()
                    
                    errors = result.stderr
                    command = " ".join(cmd)
                    if containers:
                        command = f"docker container prune -f && {command}"
                else:
                    # Remote Docker system prune
                    machine = next((m for m in self.machines if str(m.get("id")) == str(machine_id)), None)
                    if not machine:
                        return jsonify({"success": False, "error": "Machine not found"}), 404
                    
                    client = SSHClient(
                        machine["host"],
                        machine["username"],
                        machine.get("password"),
                        machine.get("port", 22),
                        machine.get("key"),
                    )
                    client.login()
                    t0 = time.time()
                    result = client.docker_system_prune(all_unused, volumes, containers)
                    t1 = time.time()
                    client.close()
                    
                    success = result.get("success", False)
                    output = result.get("output", "")
                    errors = result.get("errors", "")
                    command = result.get("command", "docker system prune")
                    if containers:
                        command = f"docker container prune -f && {command}"
                
                # Log execution
                completed_at = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
                exec_data = {
                    "id": str(uuid.uuid4()),
                    "machine_id": machine_id,
                    "type": "docker_system_prune",
                    "status": "success" if success else "failed",
                    "command": command,
                    "output": output,
                    "started_at": started_at,
                    "completed_at": completed_at,
                    "duration": t1 - t0,
                    "logs": errors or "",
                }
                self._insert_execution(exec_data)
                
                return jsonify({
                    "success": success,
                    "output": output,
                    "errors": errors
                })
                
            except Exception as e:
                # Log failed execution
                completed_at = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
                exec_data = {
                    "id": str(uuid.uuid4()),
                    "machine_id": machine_id,
                    "type": "docker_system_prune",
                    "status": "failed",
                    "command": "docker system prune",
                    "output": "",
                    "started_at": started_at,
                    "completed_at": completed_at,
                    "duration": 0,
                    "logs": str(e),
                }
                self._insert_execution(exec_data)
                
                return jsonify({"success": False, "error": str(e)}), 500

        # Add this endpoint to support /api/test-connection for the UI
        @app.route('/api/test-connection', methods=['POST'])
        def test_connection_api():
            data = request.json
            machine_id = data.get('machine_id')
            if not machine_id:
                return jsonify({'success': False, 'message': 'Machine ID is required'}), 400
            machine = next((m for m in self.machines if str(m.get('id')) == str(machine_id)), None)
            if not machine:
                return jsonify({'success': False, 'message': 'Machine not found'}), 404
            try:
                client = SSHClient(
                    machine["host"],
                    machine["username"],
                    machine.get("password"),
                    machine.get("port", 22),
                    machine.get("key"),
                )
                client.login()
                online = client.ping()
                client.close()
                if online:
                    return jsonify({'success': True, 'message': f'{machine["host"]} is reachable'}), 200
                else:
                    return jsonify({'success': False, 'message': f'{machine["host"]} is not reachable'}), 200
            except Exception as e:
                return jsonify({'success': False, 'message': str(e)}), 500

        print(f"Starting Flask server at http://{self.host}:{self.port}")
        socketio.run(app, host=self.host, port=self.port)

    def _execute_ansible_project_local(self, project_dir, main_file, custom_command, extra_args, target_client):
        """Execute Ansible project locally targeting remote machine."""
        import time
        import subprocess
        
        start_time = time.time()
        
        # Auto-detect main file if not provided
        if not main_file:
            main_file = target_client._detect_main_file(project_dir, "ansible")
            if not main_file:
                return {
                    "success": False,
                    "output": "",
                    "error": "No suitable Ansible playbook found in project directory",
                    "main_file": None,
                    "execution_location": "local"
                }
        
        main_file_path = os.path.join(project_dir, main_file)
        
        if not os.path.exists(main_file_path):
            return {
                "success": False,
                "output": "",
                "error": f"Main file not found: {main_file_path}",
                "main_file": main_file,
                "execution_location": "local"
            }
        
        try:
            if custom_command:
                # Use custom command in project directory
                cmd = custom_command
                if extra_args:
                    cmd += f" {extra_args}"
                
                result = subprocess.run(
                    cmd,
                    shell=True,
                    cwd=project_dir,
                    capture_output=True,
                    text=True,
                    timeout=600
                )
                
                end_time = time.time()
                
                return {
                    "success": result.returncode == 0,
                    "output": result.stdout or "",
                    "error": result.stderr or "",
                    "main_file": main_file,
                    "execution_location": "local",
                    "execution_time": end_time - start_time,
                    "command": cmd
                }
                
            elif main_file.endswith(('.yml', '.yaml')):
                # Use the existing ansible execution method
                ansible_result = target_client.run_ansible_playbook(
                    main_file_path,
                    extra_vars=extra_args,
                    become=False  # Can be enhanced to accept become parameter
                )
                
                end_time = time.time()
                
                if isinstance(ansible_result, dict):
                    return {
                        "success": ansible_result.get("success", False),
                        "output": ansible_result.get("output", ""),
                        "error": ansible_result.get("error", ""),
                        "main_file": main_file,
                        "execution_location": "local",
                        "execution_time": end_time - start_time,
                        "command": f"ansible-playbook {main_file_path}"
                    }
                else:
                    return {
                        "success": True,
                        "output": str(ansible_result),
                        "error": "",
                        "main_file": main_file,
                        "execution_location": "local",
                        "execution_time": end_time - start_time,
                        "command": f"ansible-playbook {main_file_path}"
                    }
            else:
                # Just display file content for non-playbook files
                with open(main_file_path, 'r') as f:
                    content = f.read()
                
                end_time = time.time()
                
                return {
                    "success": True,
                    "output": content,
                    "error": "",
                    "main_file": main_file,
                    "execution_location": "local",
                    "execution_time": end_time - start_time,
                    "command": f"cat {main_file_path}"
                }
                
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "output": "",
                "error": "Ansible execution timed out after 10 minutes",
                "main_file": main_file,
                "execution_location": "local"
            }
        except Exception as e:
            return {
                "success": False,
                "output": "",
                "error": f"Ansible execution failed: {str(e)}",
                "main_file": main_file,
                "execution_location": "local"
            }

    # --- Local Terraform execution helper methods ---
    def _run_terraform_init_local(self, work_dir):
        """Run terraform init locally and return (success, output, error)"""
        import subprocess
        import shutil
        
        # Check if terraform is installed
        if not shutil.which("terraform"):
            return False, "", "Terraform is not installed or not in PATH on the dashboard host."
        
        try:
            cmd = ["terraform", "init", "-lock=false"]
            result = subprocess.run(
                cmd, 
                cwd=work_dir, 
                capture_output=True, 
                text=True, 
                timeout=300  # 5 minute timeout
            )
            
            success = result.returncode == 0
            output = result.stdout or ""
            error = result.stderr or ""
            
            return success, output, error
            
        except subprocess.TimeoutExpired:
            return False, "", "Terraform init timed out after 5 minutes"
        except Exception as e:
            return False, "", f"Failed to execute terraform init: {str(e)}"

    def _run_terraform_plan_local(self, work_dir):
        """Run terraform plan locally and return (success, output, error)"""
        import subprocess
        import shutil
        
        # Check if terraform is installed
        if not shutil.which("terraform"):
            return False, "", "Terraform is not installed or not in PATH on the dashboard host."
        
        try:
            # First run init, then plan
            init_cmd = ["terraform", "init", "-lock=false"]
            init_result = subprocess.run(
                init_cmd, 
                cwd=work_dir, 
                capture_output=True, 
                text=True, 
                timeout=300
            )
            
            if init_result.returncode != 0:
                return False, init_result.stdout or "", f"Init failed: {init_result.stderr}"
            
            # Now run plan
            plan_cmd = ["terraform", "plan", "-lock=false"]
            plan_result = subprocess.run(
                plan_cmd, 
                cwd=work_dir, 
                capture_output=True, 
                text=True, 
                timeout=300
            )
            
            success = plan_result.returncode == 0
            combined_output = f"INIT OUTPUT:\n{init_result.stdout}\n\nPLAN OUTPUT:\n{plan_result.stdout}"
            error = plan_result.stderr or ""
            
            return success, combined_output, error
            
        except subprocess.TimeoutExpired:
            return False, "", "Terraform plan timed out after 5 minutes"
        except Exception as e:
            return False, "", f"Failed to execute terraform plan: {str(e)}"

    def _run_terraform_apply_local(self, work_dir):
        """Run terraform apply locally and return (success, output, error)"""
        import subprocess
        import shutil
        
        # Check if terraform is installed
        if not shutil.which("terraform"):
            return False, "", "Terraform is not installed or not in PATH on the dashboard host."
        
        try:
            # First run init, then apply
            init_cmd = ["terraform", "init", "-lock=false"]
            init_result = subprocess.run(
                init_cmd, 
                cwd=work_dir, 
                capture_output=True, 
                text=True, 
                timeout=300
            )
            
            if init_result.returncode != 0:
                return False, init_result.stdout or "", f"Init failed: {init_result.stderr}"
            
            # Now run apply with auto-approve
            apply_cmd = ["terraform", "apply", "-auto-approve", "-lock=false"]
            apply_result = subprocess.run(
                apply_cmd, 
                cwd=work_dir, 
                capture_output=True, 
                text=True, 
                timeout=600  # 10 minute timeout for apply
            )
            
            success = apply_result.returncode == 0
            combined_output = f"INIT OUTPUT:\n{init_result.stdout}\n\nAPPLY OUTPUT:\n{apply_result.stdout}"
            error = apply_result.stderr or ""
            
            return success, combined_output, error
            
        except subprocess.TimeoutExpired:
            return False, "", "Terraform apply timed out after 10 minutes"
        except Exception as e:
            return False, "", f"Failed to execute terraform apply: {str(e)}"


