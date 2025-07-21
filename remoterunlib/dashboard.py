import sys
from remoterunlib.remoterunlib import SSHClient


class Dashboard:
    """A simple Flask-based dashboard to manage remote machines and execute commands."""
    def __init__(self, host="", port=5000):
        """Initialize the dashboard."""
        self.host = "0.0.0.0" if not host else host
        self.port = 5000 if not port else port
        self.machines = []  # In-memory list of machines

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
            print("Fetching machines")
            print(self.machines)
            print("Machines fetched")
            return jsonify(self.machines)

        @app.route("/api/machines", methods=["POST"])
        def add_machine():
            import uuid
            data = request.json
            # Ensure 'key' is set from 'key_path' if present
            if 'key_path' in data:
                data['key'] = data['key_path']
                del data['key_path']

            # Check for existing machine with the same host and username (case-insensitive, trimmed)
            for m in self.machines:
                if m['host'].strip().lower() == data['host'].strip().lower() and \
                   m['username'].strip().lower() == data['username'].strip().lower():
                    return jsonify({"success": False, "message": "Machine with the same host and username already exists."}), 400

            # Assign a unique id if not present
            if 'id' not in data or not data['id']:
                data['id'] = str(uuid.uuid4())

            self.machines.append(data)
            return jsonify({"success": True, "machine": data, "created": True})

        @app.route("/api/machines/<machine_id>", methods=["PUT"])
        def update_machine(machine_id):
            data = request.json
            # Ensure 'key' is set from 'key_path' if present
            if 'key_path' in data:
                data['key'] = data['key_path']
                del data['key_path']

            # Find the machine to update
            machine = next((m for m in self.machines if m['id'] == machine_id), None)
            if not machine:
                return jsonify({"success": False, "message": "Machine not found."}), 404

            # Check for duplicates (ignore the current machine)
            for m in self.machines:
                if m['id'] != machine_id and \
                   m['host'].strip().lower() == data['host'].strip().lower() and \
                   m['username'].strip().lower() == data['username'].strip().lower():
                    return jsonify({"success": False, "message": "Another machine with the same host and username already exists."}), 400

            # Update the machine
            machine.update(data)
            return jsonify({"success": True, "machine": machine, "updated": True})

        @app.route("/api/machines/<machine_id>", methods=["DELETE"])
        def delete_machine_by_id(machine_id):
            for i, m in enumerate(self.machines):
                if str(m.get("id")) == str(machine_id):
                    self.machines.pop(i)
                    return jsonify({"success": True})
            return jsonify({"success": False, "error": "Machine not found"}), 404

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
            data = request.json
            machine_id = data.get("machine_id")
            command = data.get("command")
            timeout = int(data.get("timeout", 30))
            # Find machine by id (not index)
            print("Neneu")
            print(machine_id)
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
                output, errors = client.run_command(command, timeout=timeout)
                client.close()
                return jsonify({"success": True, "output": output, "errors": errors})
            except Exception as e:
                return jsonify({"success": False, "message": str(e)}), 500

        # Test connection by machine_id
        @app.route("/api/test-connection", methods=["POST"])
        def test_connection():
            data = request.json
            machine_id = data.get("machine_id")
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
                online = client.ping()
                client.close()
                return jsonify({"success": online})
            except Exception as e:
                return jsonify({"success": False, "message": str(e)}), 500
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
                output, errors = client.run_python_file(script_path, timeout=timeout)
                client.close()
                if errors:
                    return jsonify({"success": False, "output": output, "message": errors}), 500
                return jsonify({"success": True, "output": output})
            except Exception as e:
                return jsonify({"success": False, "message": str(e)}), 500

        # --- Unified Ansible endpoint (matches frontend) ---
        @app.route("/api/run-ansible", methods=["POST"])
        def run_ansible_v2():
            data = request.json
            machine_id = data.get("machine_id")
            mode = data.get("mode", "adhoc")
            module = data.get("module")
            args = data.get("args")
            playbook = data.get("playbook")
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
                if mode == "adhoc":
                    command = f"ansible all -m {module} -a '{args}'"
                    result = client.run_ansible_playbook(command)
                else:
                    result = client.run_ansible_playbook(playbook)
                client.close()
                return jsonify({"success": True, "output": result})
            except Exception as e:
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


        print(f"Starting Flask server at http://{self.host}:{self.port}")
        socketio.run(app, host=self.host, port=self.port)


