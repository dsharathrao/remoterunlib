import sys
from remoterunlib.remoterunlib import SSHClient
import sqlite3
import os
import uuid

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

        # Terraform endpoints
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

        @app.route("/api/terraform/destroy", methods=["POST"])
        def terraform_destroy():
            data = request.json
            idx = int(data.get("machine_idx"))
            work_dir = data.get("work_dir")
            m = self.machines[idx]
            try:
                client = SSHClient(m["host"], m["username"], m.get("password"), m.get("port", 22), m.get("key"))
                client.login()
                result = client.run_terraform(["destroy"], work_dir, remote=True)
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
                    output = client.run_ansible_playbook(command, module=module)
                    exec_command = f"{module}: {args}"
                else:
                    # Save playbook content to a temp file if provided
                    if script_content:
                        import tempfile
                        with tempfile.NamedTemporaryFile("w", delete=False, suffix=".yml") as tmpf:
                            tmpf.write(script_content)
                            tmpf.flush()
                            playbook_path = tmpf.name
                        output = client.run_ansible_playbook(playbook_path)
                        exec_command = filename
                    else:
                        output = client.run_ansible_playbook(playbook)
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

        # --- Unified Terraform endpoint (matches frontend) ---
        @app.route("/api/run-terraform", methods=["POST"])
        def run_terraform_v2():
            data = request.json
            machine_id = data.get("machine_id")
            action = data.get("action")  # plan, apply, destroy
            work_dir = data.get("work_dir", "~")
            # Find machine by id
            machine = None
            for m in self.machines:
                if str(m.get("id")) == str(machine_id):
                    machine = m
                    break
            if not machine:
                return jsonify({"success": False, "message": "Machine not found"}), 404
            try:
                client = SSHClient(
                    machine["host"],
                    machine["username"],
                    machine.get("password"),
                    machine.get("port", 22),
                    machine.get("key"),
                )
                client.login()
                if action == "plan":
                    result = client.run_terraform_plan(work_dir, remote=True)
                elif action == "apply":
                    result = client.run_terraform_apply(work_dir, remote=True)
                elif action == "destroy":
                    result = client.run_terraform(["destroy"], work_dir, remote=True)
                else:
                    return jsonify({"success": False, "message": "Invalid action"}), 400
                client.close()
                return jsonify({"success": True, "output": result})
            except Exception as e:
                return jsonify({"success": False, "message": str(e)}), 500
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

        @app.route("/api/files/<script_type>/<filename>", methods=["GET"])
        def load_file(script_type, filename):
            # Load content of a specific file
            try:
                caller_path = os.path.abspath(sys.argv[0])
                scripts_path = os.path.dirname(caller_path)
                base_dir = os.path.join(scripts_path, "scripts", script_type)
                file_path = os.path.join(base_dir, filename)
                
                # Security check: ensure the file is within the expected directory
                if not os.path.abspath(file_path).startswith(os.path.abspath(base_dir)):
                    return jsonify({"error": "Invalid file path"}), 400
                    
                if not os.path.exists(file_path):
                    return jsonify({"error": "File not found"}), 404
                    
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    
                return jsonify({
                    "name": filename,
                    "content": content
                })
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


