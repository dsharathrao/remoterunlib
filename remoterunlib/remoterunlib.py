import io
import platform
import subprocess
import sys
import threading
import time
import traceback
import warnings

from cryptography.utils import CryptographyDeprecationWarning

with warnings.catch_warnings():
    warnings.simplefilter("ignore", CryptographyDeprecationWarning)
    import paramiko
    import paramiko.ssh_exception

from .utils import AuthenticationFailed, Singleton, SSHException, UnableToConnect


class SSHClient:
    TIMEOUT = 360

    def __init__(self, hostname, username, password=None, port=22, key_file=None):
        self.hostname = hostname
        self.port = port
        self.username = username
        self.password = password
        self.key_file = key_file
        self.client = None

    @classmethod
    def change_default_timeout(cls, new_timeout):
        cls.TIMEOUT = new_timeout

    def login(self):
        """Establish an SSH connection to the server."""
        self.client = paramiko.SSHClient()
        self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        try:
            if self.key_file:
                key = paramiko.RSAKey.from_private_key_file(self.key_file)
                self.client.connect(
                    self.hostname, port=self.port, username=self.username, pkey=key
                )
            else:
                self.client.connect(
                    self.hostname,
                    port=self.port,
                    username=self.username,
                    password=self.password,
                )
            print("Connected successfully.")
        except paramiko.AuthenticationException:
            print("Authentication failed.")
            raise AuthenticationFailed(
                "Authentication failed. Please check credentials."
            )
        except paramiko.SSHException as sshException:
            print(f"Unable to establish SSH connection: {sshException}")
            raise SSHException(f"Unable to establish SSH connection: {sshException}")
        except Exception as e:
            print(f"Exception in connecting: {e}")
            raise UnableToConnect(
                f"Unable to connect {self.hostname}. Please check correct details"
            )

    def run_command(self, command, timeout=TIMEOUT, verbose=True):
        """Run a command on the remote server with timeout and live output."""
        if self.client:
            try:
                if verbose:
                    sys.stdout = sys.__stdout__
                    sys.stderr = sys.__stderr__
                else:
                    sys.stdout = io.StringIO()
                    sys.stderr = io.StringIO()

                def target():
                    nonlocal output, errors
                    try:
                        print(f"\nRun_Command: {command}")
                        _, stdout, stderr = self.client.exec_command(command)
                        start_time = time.time()
                        while not stdout.channel.exit_status_ready():
                            if time.time() - start_time > timeout:
                                # Timeout occurred, kill the command
                                stdout.channel.close()  # Send termination signal
                                print(
                                    f"\nCommand timed out after {timeout} seconds and has been terminated."
                                )
                                break
                            if stdout.channel.recv_ready():
                                sys.stdout.write(stdout.channel.recv(1024).decode())
                                sys.stdout.flush()
                            if stderr.channel.recv_ready():
                                sys.stderr.write(stderr.channel.recv(1024).decode())
                                sys.stderr.flush()
                            time.sleep(0.5)
                        output = stdout.read().decode()
                        errors = stderr.read().decode()
                    except Exception as e:
                        errors = str(e)

                output = ""
                errors = ""
                thread = threading.Thread(target=target)
                thread.start()

                start_time = time.time()
                while thread.is_alive():
                    if time.time() - start_time > timeout:
                        # Timeout has occurred
                        thread.join(timeout=0)  # Ensure the thread terminates
                        break
                    time.sleep(0.5)

                thread.join()  # Wait for the thread to finish

                if output:
                    print("\nOutput:")
                    print(output)
                if errors:
                    print("Errors:")
                    print(errors)

                return output, errors
            except Exception as why:
                print(f"Error running command: {why}")
                return None, str(why)
            finally:
                sys.stdout = sys.__stdout__
        else:
            print("Connection not established. Call login() first.")

    def get_remote_os(self):
        """Detect the remote OS and return as a dict: {'os': 'windows'} or {'os': 'linux'}"""
        if not self.client:
            print("Connection not established. Call login() first.")
            return {"os": None}
        try:
            # Try Windows command
            out, err = self.run_command("ver", verbose=False)
            if out and "Microsoft" in out:
                return {"os": "windows"}
            # Try Linux command
            out, err = self.run_command("uname", verbose=False)
            if out and "Linux" in out:
                return {"os": "linux"}
        except Exception as e:
            print(f"Error detecting remote OS: {e}")
        return {"os": None}

    def get_remote_home(self):
        """
        Returns the remote user's home directory as a string, or None on failure.
        """
        remote_os = self.get_remote_os().get("os")
        if remote_os == "windows":
            # Use PowerShell to get home dir
            result = self.run_command(
                'powershell -Command "Write-Output $env:USERPROFILE"', verbose=False
            )
            if result and isinstance(result, tuple):
                out, err = result
                home = out.strip().splitlines()[0] if out else None
                if home:
                    return home
            # Fallback: try C:\Users\{username}
            return f"C:\\Users\\{self.username}"
        elif remote_os == "linux":
            result = self.run_command("echo $HOME", verbose=False)
            if result and isinstance(result, tuple):
                out, err = result
                home = out.strip().splitlines()[0] if out else None
                if home:
                    return home
            return f"/home/{self.username}"
        return None

    def send_File(self, file, path=None):
        import os

        if self.client:
            try:
                if not os.path.isfile(file):
                    print(f"Local file does not exist: {file}")
                    return None
                print(f"Sending {file} to remote machine")
                sftp = self.client.open_sftp()
                remote_os = self.get_remote_os().get("os")
                print(f"Detected remote OS: {remote_os}")
                if path:
                    if remote_os == "windows":
                        self.run_command(f"mkdir {path}", verbose=False)
                        remote_script_path = f"{path}\\{os.path.basename(file)}"
                    else:
                        self.run_command(f"mkdir -p {path}", verbose=False)
                        remote_script_path = f"{path}/{os.path.basename(file)}"
                    sftp.put(file, remote_script_path)
                else:
                    # Use get_remote_home for user-specific temp directory
                    remote_home = self.get_remote_home()
                    if not remote_home:
                        print("Could not determine remote home directory.")
                        return None
                    import random
                    import string

                    rand_str = "".join(
                        random.choices(string.ascii_letters + string.digits, k=8)
                    )
                    temp_dir = os.path.join(remote_home, f".tmp_{rand_str}")
                    if remote_os and remote_os.lower() == "windows":
                        ps_cmd = f"powershell -Command \"New-Item -ItemType Directory -Path '{temp_dir}' -Force | Out-Null; Write-Output '{temp_dir}'\""
                        result = self.run_command(ps_cmd, verbose=False)
                        if result and isinstance(result, tuple):
                            out, err = result
                            temp_path = out.strip().splitlines()[0] if out else temp_dir
                        else:
                            temp_path = temp_dir
                        remote_script_path = f"{temp_path}\\{os.path.basename(file)}"
                    elif remote_os and remote_os.lower() == "linux":
                        self.run_command(f"mkdir -p '{temp_dir}'", verbose=False)
                        temp_path = temp_dir
                        remote_script_path = f"{temp_path}/{os.path.basename(file)}"
                        print(f"Remote script path: {remote_script_path}")
                    else:
                        print("Unknown remote OS. Cannot determine temp path.")
                        return None
                    sftp.put(file, remote_script_path)
                print(f"Sent file : {remote_script_path}")
                return remote_script_path
            except Exception as e:
                print(f"Failed to send file: {e}")
                return None
            finally:
                try:
                    sftp.close()
                except Exception:
                    pass
        else:
            print("Connection not established. Call login() first.")
            return None

    def send_Directory(self, local_dir, remote_path=None):
        """
        Recursively send a local directory to the remote host using SFTP.
        local_dir: path to local directory
        remote_path: path to remote directory (if None, create temp dir in remote user's home)
        Returns the remote directory path or None on failure.
        """
        import os

        if not self.client:
            print("Connection not established. Call login() first.")
            return None
        try:
            sftp = self.client.open_sftp()
            remote_os = self.get_remote_os().get("os")
            if remote_path is None:
                # Create temp dir in remote user's home directory
                remote_home = self.get_remote_home()
                if not remote_home:
                    print("Could not determine remote home directory.")
                    return None
                # Use a unique subdirectory name
                import random
                import string

                rand_str = "".join(
                    random.choices(string.ascii_letters + string.digits, k=8)
                )
                base_name = os.path.basename(local_dir.rstrip(os.sep))
                remote_temp_dir = os.path.join(
                    remote_home, f".tmp_{base_name}_{rand_str}"
                )
                # Create the directory on remote
                if remote_os == "windows":
                    # Use PowerShell to create directory and get short path
                    ps_cmd = f"powershell -Command \"New-Item -ItemType Directory -Path '{remote_temp_dir}' -Force | Out-Null; Write-Output '{remote_temp_dir}'\""
                    result = self.run_command(ps_cmd, verbose=False)
                    if result and isinstance(result, tuple):
                        out, err = result
                        remote_path = (
                            out.strip().splitlines()[0] if out else remote_temp_dir
                        )
                    else:
                        remote_path = remote_temp_dir
                else:
                    # Linux: mkdir -p
                    self.run_command(f"mkdir -p '{remote_temp_dir}'", verbose=False)
                    remote_path = remote_temp_dir
                print(f"Remote temp directory for transfer: {remote_path}")

            # Recursively create directories and upload files
            def _recursive_upload(local_path, remote_path):
                try:
                    sftp.mkdir(remote_path)
                except Exception:
                    pass  # Directory may already exist
                for item in os.listdir(local_path):
                    lpath = os.path.join(local_path, item)
                    rpath = os.path.join(remote_path, item)
                    if os.path.isdir(lpath):
                        _recursive_upload(lpath, rpath)
                    else:
                        sftp.put(lpath, rpath)

            _recursive_upload(local_dir, remote_path)
            print(f"Sent directory: {local_dir} to {remote_path}")
            return remote_path
        except Exception as e:
            print(f"Failed to send directory: {e}")
            return None
        finally:
            try:
                sftp.close()
            except Exception:
                pass

    def receive_File(self, remote_path, local_path):
        """Receive a file from the remote machine to the local machine."""
        if self.client:
            try:
                print(f"Receiving {remote_path} from remote machine")
                sftp = self.client.open_sftp()

                # Retrieve the file from the remote machine
                sftp.get(remote_path, local_path)

                print(f"Received file and saved as: {local_path}")
                return True
            except Exception as e:
                print(f"Failed to receive file: {e}")
                return False
            finally:
                sftp.close()
        else:
            print("Connection not established. Call login() first.")
            return None

    def run_python_file(self, script_file, timeout=TIMEOUT):
        """Run a Python script file on the remote server, using python3 for Linux and python for Windows."""
        if self.client:
            try:
                remote_script_path = self.send_File(script_file)
                print(f"Running remote script: {remote_script_path}")
                if not remote_script_path:
                    print("Failed to send script file to remote machine.")
                    return None, "Failed to send script file"

                remote_os = self.get_remote_os().get("os")
                if remote_os == "linux":
                    remote_command = f"python3 {remote_script_path}"
                elif remote_os == "windows":
                    remote_command = f"python {remote_script_path}"
                else:
                    print("Unknown remote OS. Cannot determine Python interpreter.")
                    return None, "Unknown remote OS"

                output, errors = self.run_command(remote_command, timeout=timeout)
                if errors:
                    print("Errors while executing remote function:")
                    print(errors)
                return output, errors
            except Exception as e:
                print(f"Failed to execute remote function: {e}")
                return None, str(e)
        else:
            print("Connection not established. Call login() first.")
            return None, "Not connected"

    def run_powershell_command(self, command, timeout=360):
        """Run a PowerShell command on the remote server."""
        if not self.client:
            print("Connection not established. Call login() first.")
            return None

        remote_os = self.get_remote_os().get("os")
        try:
            if remote_os == "windows":
                ps_command = f'powershell -Command "{command}"'
                return self.run_command(ps_command, timeout)
            elif remote_os == "linux":
                # Check if pwsh is available
                out, err = self.run_command("which pwsh", verbose=False)
                if out.strip():
                    ps_command = f'pwsh -Command "{command}"'
                    return self.run_command(ps_command, timeout)
                else:
                    print(
                        "PowerShell (pwsh) is not installed on the remote Linux machine. Please install the PowerShell package."
                    )
                    return None
            else:
                print("Unknown remote OS. Cannot run PowerShell command.")
                return None
        except Exception as e:
            print(f"Failed to execute remote PowerShell command: {e}")
            return None

    def run_ansible_playbook(
        self,
        playbook_or_command,
        extra_vars=None,
        inventory_file=None,
        out=None,
        display=True,
        ansible_remote_tmp=None,
        module="command",
        become=False,
    ):
        """
        Runs an Ansible playbook or an ad-hoc command targeting the remote host.
        Ansible must be installed on the machine running this script.
        This method only runs on a Linux host.

        Args:
            playbook_or_command (str): Path to playbook file or ad-hoc command.
            extra_vars (str, optional): Extra variables for Ansible.
            inventory_file (str, optional): Path to inventory file. If None, a temporary inventory is created.
            module (str, optional): Ansible module to use for ad-hoc commands. Defaults to "command".
            become (bool, optional): Whether to run with privilege escalation (sudo). Defaults to False.
        """
        is_local = platform.system().lower() == "linux"
        if not is_local:
            error_msg = (
                "Operation not permitted: Ansible execution is only supported on Linux-based control nodes. "
                "Please ensure that the host machine is running a supported Linux distribution to use this feature."
            )
            print(error_msg)
            return {"success": False, "output": "", "error": error_msg}

        import os
        import shutil
        import subprocess
        import tempfile

        # Set default remote tmp if not provided
        if ansible_remote_tmp is None:
            ansible_remote_tmp = "/tmp"

        is_playbook = os.path.isfile(playbook_or_command)
        executable = "ansible-playbook" if is_playbook else "ansible"

        if not shutil.which(executable):
            error_msg = f"Error: {executable} command not found. Please install Ansible."
            print(error_msg)
            return {"success": False, "output": "", "error": error_msg}

        if is_playbook and not os.path.isfile(playbook_or_command):
            error_msg = f"Error: Playbook file not found at {playbook_or_command}"
            print(error_msg)
            return {"success": False, "output": "", "error": error_msg}

        # Print whether running locally or remotely (for Ansible, always local in this method)
        if is_local:
            print("[Ansible] Running Locally:")
        else:
            print("[Ansible] Running Remotely:")

        temp_inventory_path = None
        if inventory_file is None:
            # Detect remote OS to set correct ansible_connection
            remote_os = self.get_remote_os().get("os")
            if remote_os == "windows":
                inventory_content = (
                    f"{self.hostname} ansible_port={self.port} ansible_user={self.username} "
                    f"ansible_connection=winrm ansible_winrm_transport=ntlm ansible_winrm_server_cert_validation=ignore\n"
                )
            else:
                inventory_content = f"{self.hostname} ansible_port={self.port} ansible_user={self.username} ansible_connection=paramiko\n"
            with tempfile.NamedTemporaryFile(
                mode="w", delete=False, suffix=".ini"
            ) as inv_file:
                temp_inventory_path = inv_file.name
                inv_file.write(inventory_content)
            inventory_path = temp_inventory_path
        else:
            inventory_path = inventory_file

        try:
            if is_playbook:
                command = [executable, "-i", inventory_path, playbook_or_command]
            else:
                # Ad-hoc command
                remote_os = self.get_remote_os().get("os")
                if inventory_file is None:
                    # Use the passed module parameter, but adjust for Windows if needed
                    if remote_os == "windows" and module in ["command", "shell"]:
                        module_name = "win_shell" if module == "shell" else "win_command"
                    else:
                        module_name = module
                    command = [
                        executable,
                        self.hostname,
                        "-i",
                        inventory_path,
                        "-m",
                        module_name,
                        "-a",
                        playbook_or_command,
                    ]
                else:
                    # Use the passed module parameter, but adjust for Windows if needed
                    if remote_os == "windows" and module in ["command", "shell"]:
                        module_name = "win_shell" if module == "shell" else "win_command"
                    else:
                        module_name = module
                    command = [
                        executable,
                        "all",
                        "-i",
                        inventory_path,
                        "-m",
                        module_name,
                        "-a",
                        playbook_or_command,
                    ]

            extra_vars_list = []
            if self.password:
                extra_vars_list.append(
                    "ansible_password=****** ansible_become_password=******"
                )
            if extra_vars:
                extra_vars_list.append(extra_vars)
            if extra_vars_list:
                command_to_print = command + ["--extra-vars", " ".join(extra_vars_list)]
            else:
                command_to_print = command.copy()
            if self.key_file:
                command_to_print.extend(["--private-key", self.key_file])
            
            # Add --become flag if requested
            if become:
                command_to_print.append("--become")

            # Build the real command (with real password) for execution
            real_extra_vars_list = []
            if self.password:
                real_extra_vars_list.append(
                    f"ansible_password={self.password} ansible_become_password={self.password}"
                )
            if extra_vars:
                real_extra_vars_list.append(extra_vars)
            real_command = command.copy()
            if real_extra_vars_list:
                real_command.extend(["--extra-vars", " ".join(real_extra_vars_list)])
            if self.key_file:
                real_command.extend(["--private-key", self.key_file])
            
            # Add --become flag to real command if requested
            if become:
                real_command.append("--become")
            # Do NOT add --remote-tmp again here

            print(f"Running Ansible: {' '.join(command_to_print)}")

            # Set environment for Ansible to use UTF-8 and disable host key checking
            ansible_env = os.environ.copy()
            ansible_env["PYTHONIOENCODING"] = "utf-8"
            ansible_env["ANSIBLE_HOST_KEY_CHECKING"] = "False"
            if ansible_remote_tmp:
                ansible_env["ANSIBLE_REMOTE_TMP"] = ansible_remote_tmp

            # Open output file if specified
            file_handle = None
            if out is not None:
                file_handle = open(out, "w", encoding="utf-8")

            output_buffer = ""
            error_buffer = ""
            try:
                process = subprocess.Popen(
                    real_command,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    env=ansible_env,
                    bufsize=1,
                )

                if display:
                    print("--- Ansible Output ---")

                while True:
                    output = process.stdout.readline()
                    if output == "" and process.poll() is not None:
                        break
                    if output:
                        output_buffer += output
                        if display:
                            print(output, end="")
                        if file_handle:
                            file_handle.write(output)

                stderr_output = process.stderr.read()
                if stderr_output:
                    error_buffer += stderr_output
                    if display:
                        print("--- Ansible Errors ---")
                        print(stderr_output)
                    if file_handle:
                        file_handle.write("--- Ansible Errors ---\n")
                        file_handle.write(stderr_output)

                result = process.wait()
                success = result == 0
                return {"success": success, "output": output_buffer, "error": error_buffer}
            finally:
                if file_handle:
                    file_handle.close()

        except Exception as e:
            error_msg = f"An error occurred while running Ansible: {e}"
            print(error_msg)
            return {"success": False, "output": "", "error": error_msg}
        finally:
            if temp_inventory_path and os.path.exists(temp_inventory_path):
                os.remove(temp_inventory_path)

    def run_terraform_init(
        self, work_dir, backend_config=None, env_vars=None, remote=False
    ):
        """
        Initialize Terraform in the given directory.
        backend_config: dict of backend config (e.g., AWS/Azure/onprem)
        env_vars: dict of environment variables
        remote: if True, run on remote host via SSH; else, run locally
        """
        import os
        import shlex
        import shutil
        import subprocess

        tf_cmd = ["terraform", "init", "-lock=false"]
        # Check if terraform is installed and in PATH
        if not shutil.which("terraform"):
            print("Error: Terraform is not installed or not in PATH.")
            return False
        if backend_config:
            for k, v in backend_config.items():
                tf_cmd.extend(["-backend-config", f"{k}={v}"])
        env = os.environ.copy()
        if env_vars:
            env.update(env_vars)
        cmd_str = " ".join(shlex.quote(x) for x in tf_cmd)
        if remote:
            # Send working dir to remote, run init, optionally fetch .terraform dir back
            print(f"[Terraform] Running remotely: {cmd_str}")
            # Use send_Directory for directory transfer
            remote_dir = (
                self.send_Directory(work_dir) if os.path.isdir(work_dir) else None
            )
            if not remote_dir:
                print("Failed to send working directory to remote host.")
                return False
            remote_cmd = f"cd {remote_dir} && {cmd_str}"
            result = self.run_command(remote_cmd)
            if result is None:
                print("Failed to execute remote command.")
                return False
            out, err = result
            print(out)
            if err:
                print(err)
            return err == ""
        else:
            print(f"[Terraform] Running locally: {cmd_str}")
            proc = subprocess.run(
                tf_cmd, cwd=work_dir, env=env, capture_output=True, text=True
            )
            print(proc.stdout)
            if proc.stderr:
                print(proc.stderr)
            return proc.returncode == 0

    def run_terraform_plan(
        self,
        work_dir,
        var_file=None,
        vars_dict=None,
        env_vars=None,
        out_plan=None,
        remote=False,
    ):
        """
        Run 'terraform plan' in the given directory.
        var_file: path to .tfvars file
        vars_dict: dict of variables to pass
        env_vars: dict of environment variables
        out_plan: filename to save the plan output
        remote: if True, run on remote host via SSH; else, run locally
        """
        import os
        import shlex
        import shutil
        import subprocess

        tf_cmd = ["terraform", "plan", "-lock=false"]
        # Check if terraform is installed and in PATH
        if not shutil.which("terraform"):
            print("Error: Terraform is not installed or not in PATH.")
            return False
        if var_file:
            tf_cmd.extend(["-var-file", var_file])
        if vars_dict:
            for k, v in vars_dict.items():
                tf_cmd.extend(["-var", f"{k}={v}"])
        if out_plan:
            tf_cmd.extend(["-out", out_plan])
        env = os.environ.copy()
        if env_vars:
            env.update(env_vars)
        cmd_str = " ".join(shlex.quote(x) for x in tf_cmd)
        if remote:
            print(f"[Terraform] Running remotely: {cmd_str}")
            remote_dir = (
                self.send_Directory(work_dir) if os.path.isdir(work_dir) else None
            )
            if not remote_dir:
                print("Failed to send working directory to remote host.")
                return False
            # Always run remote terraform init before plan
            init_cmd = "terraform init -lock=false"
            print(f"[Terraform] Running remote init: {init_cmd}")
            remote_init_cmd = f"cd {remote_dir} && {init_cmd}"
            init_result = self.run_command(remote_init_cmd)
            if init_result is None:
                print("Remote terraform init failed. Aborting.")
                return False
            out, err = (
                init_result if isinstance(init_result, tuple) else (init_result, "")
            )
            print(out)
            if err:
                print(err)
                print("Remote terraform init failed. Aborting.")
                return False
            remote_cmd = f"cd {remote_dir} && {cmd_str}"
            result = self.run_command(remote_cmd)
            if result is None:
                print("Failed to execute remote command.")
                return False
            out, err = result if isinstance(result, tuple) else (result, "")
            print(out)
            if err:
                print(err)
            return err == ""
        else:
            print(f"[Terraform] Running locally: {cmd_str}")
            proc = subprocess.run(
                tf_cmd, cwd=work_dir, env=env, capture_output=True, text=True
            )
            print(proc.stdout)
            if proc.stderr:
                print(proc.stderr)
            return proc.returncode == 0

    def run_terraform_apply(
        self, work_dir, plan_file=None, auto_approve=True, env_vars=None, remote=False
    ):
        """
        Run 'terraform apply' in the given directory.
        plan_file: path to plan file (optional)
        auto_approve: if True, pass -auto-approve
        env_vars: dict of environment variables
        remote: if True, run on remote host via SSH; else, run locally
        """
        import os
        import shlex
        import shutil
        import subprocess

        tf_cmd = ["terraform", "apply", "-lock=false"]
        # Check if terraform is installed and in PATH
        if not shutil.which("terraform"):
            print("Error: Terraform is not installed or not in PATH.")
            return False
        # -auto-approve must come before the plan file if plan_file is specified
        if auto_approve:
            tf_cmd.append("-auto-approve")
        if plan_file:
            tf_cmd.append(plan_file)
        env = os.environ.copy()
        if env_vars:
            env.update(env_vars)
        cmd_str = " ".join(shlex.quote(x) for x in tf_cmd)
        if remote:
            print(f"[Terraform] Running remotely: {cmd_str}")
            remote_dir = (
                self.send_Directory(work_dir) if os.path.isdir(work_dir) else None
            )
            if not remote_dir:
                print("Failed to send working directory to remote host.")
                return False
            # Always run remote terraform init before apply
            init_cmd = "terraform init -lock=false"
            print(f"[Terraform] Running remote init: {init_cmd}")
            remote_init_cmd = f"cd {remote_dir} && {init_cmd}"
            init_result = self.run_command(remote_init_cmd)
            if init_result is None:
                print("Remote terraform init failed. Aborting.")
                return False
            out, err = (
                init_result if isinstance(init_result, tuple) else (init_result, "")
            )
            print(out)
            if err:
                print(err)
                print("Remote terraform init failed. Aborting.")
                return False
            remote_cmd = f"cd {remote_dir} && {cmd_str}"
            result = self.run_command(remote_cmd)
            if result is None:
                print("Failed to execute remote command.")
                return False
            out, err = result if isinstance(result, tuple) else (result, "")
            print(out)
            if err:
                print(err)
            return err == ""
        else:
            print(f"[Terraform] Running locally: {cmd_str}")
            proc = subprocess.run(
                tf_cmd, cwd=work_dir, env=env, capture_output=True, text=True
            )
            print(proc.stdout)
            if proc.stderr:
                print(proc.stderr)
            return proc.returncode == 0

    def run_terraform(
        self, work_dir, command_args, env_vars=None, remote=False
    ):
        """
        Run a custom Terraform command in the given directory.
        command_args: list of terraform CLI arguments (e.g., ["state", "list"])
        env_vars: dict of environment variables
        remote: if True, run on remote host via SSH; else, run locally
        """
        import os
        import shlex
        import shutil
        import subprocess

        # Only add -lock=false for commands that support it
        lock_supported = {"init", "plan", "apply", "import", "destroy"}
        tf_cmd = ["terraform"] + command_args
        if command_args and command_args[0] in lock_supported:
            tf_cmd.append("-lock=false")
        # Check if terraform is installed and in PATH
        if not shutil.which("terraform"):
            print("Error: Terraform is not installed or not in PATH.")
            return False
        env = os.environ.copy()
        if env_vars:
            env.update(env_vars)
        cmd_str = " ".join(shlex.quote(x) for x in tf_cmd)
        if remote:
            print(f"[Terraform] Running remotely: {cmd_str}")
            remote_dir = (
                self.send_Directory(work_dir) if os.path.isdir(work_dir) else None
            )
            if not remote_dir:
                print("Failed to send working directory to remote host.")
                return False
            remote_cmd = f"cd {remote_dir} && {cmd_str}"
            result = self.run_command(remote_cmd)
            if result is None:
                print("Failed to execute remote command.")
                return False
            out, err = result if isinstance(result, tuple) else (result, "")
            print(out)
            if err:
                print(err)
            return err == ""
        else:
            print(f"[Terraform] Running locally: {cmd_str}")
            proc = subprocess.run(
                tf_cmd, cwd=work_dir, env=env, capture_output=True, text=True
            )
            print(proc.stdout)
            if proc.stderr:
                print(proc.stderr)
            return proc.returncode == 0

    def run_terraform_import(
        self, work_dir, resource, resource_id, env_vars=None, remote=False
    ):
        """
        Run 'terraform import' to import existing infrastructure into Terraform state.
        resource: resource address (e.g., aws_instance.example)
        resource_id: ID of the resource to import
        env_vars: dict of environment variables
        remote: if True, run on remote host via SSH; else, run locally
        """
        import os
        import shlex
        import subprocess

        tf_cmd = ["terraform", "import", "-lock=false", resource, resource_id]
        env = os.environ.copy()
        if env_vars:
            env.update(env_vars)
        cmd_str = " ".join(shlex.quote(x) for x in tf_cmd)
        if remote:
            print(f"[Terraform] Running remotely: {cmd_str}")
            remote_dir = (
                self.send_Directory(work_dir) if os.path.isdir(work_dir) else None
            )
            if not remote_dir:
                print("Failed to send working directory to remote host.")
                return False
            # Always run remote terraform init before import
            init_cmd = "terraform init -lock=false"
            print(f"[Terraform] Running remote init: {init_cmd}")
            remote_init_cmd = f"cd {remote_dir} && {init_cmd}"
            init_result = self.run_command(remote_init_cmd)
            if init_result is None:
                print("Remote terraform init failed. Aborting.")
                return False
            out, err = (
                init_result if isinstance(init_result, tuple) else (init_result, "")
            )
            print(out)
            if err:
                print(err)
                print("Remote terraform init failed. Aborting.")
                return False
            remote_cmd = f"cd {remote_dir} && {cmd_str}"
            result = self.run_command(remote_cmd)
            if result is None:
                print("Failed to execute remote command.")
                return False
            out, err = result if isinstance(result, tuple) else (result, "")
            print(out)
            if err:
                print(err)
            return err == ""
        else:
            print(f"[Terraform] Running locally: {cmd_str}")
            proc = subprocess.run(
                tf_cmd, cwd=work_dir, env=env, capture_output=True, text=True
            )
            print(proc.stdout)
            if proc.stderr:
                print(proc.stderr)
            return proc.returncode == 0

    def ping(self):
        """Check the connectivity to the remote server by running the ping command locally."""

        count_flag = "-n" if platform.system().lower() == "windows" else "-c"
        try:
            result = subprocess.run(
                ["ping", count_flag, "5", self.hostname],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=30,
            )
            print(result.stdout)
            if result.returncode == 0:
                return True
            else:
                print(result.stderr)
                return False
        except Exception as e:
            print(f"Ping failed: {e}")
            return False

    def reboot(self, wait_until=300):
        """Reboot remote machine immediately, using appropriate command for Windows or Linux (no sudo)."""
        print("Rebooting remote machine")
        try:
            remote_os = self.get_remote_os().get("os")
            if remote_os == "windows":
                # Use 'shutdown /r /t 0' for Windows, which does not require sudo
                reboot_cmd = "shutdown /r /t 0"
            elif remote_os == "linux":
                # Try 'reboot' first, which does not require sudo on most systems
                reboot_cmd = f"echo {self.password} | sudo -S  reboot"
            else:
                print("Unknown remote OS. Cannot determine reboot command.")
                return False

            result = self.run_command(reboot_cmd, verbose=False)
            if result is None:
                print("Failed to execute reboot command.")
                return False
            out, err = result if isinstance(result, tuple) else (result, "")
            time.sleep(20)
            self.wait(timeout=wait_until)
            return not err
        except Exception as e:
            print(f"Unexpected error: {e}")
            print(traceback.format_exc())
        return False

    def wait(self, timeout=300, interval=10):
        """Wait until the remote machine is back online after a reboot.

        Args:
            timeout (int): Maximum time to wait in seconds.
            interval (int): Interval between connection attempts in seconds.
        """
        print("Waiting for the remote machine...")
        start_time = time.time()

        while (time.time() - start_time) < timeout:
            try:
                # Attempt to establish a new SSH connection
                self.client = paramiko.SSHClient()
                self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
                self.client.connect(
                    hostname=self.hostname,
                    port=self.port,
                    username=self.username,
                    password=self.password,
                    timeout=10,
                )
                print("Remote machine is back online.")
                return True
            except (
                TimeoutError,
                paramiko.ssh_exception.SSHException,
                paramiko.ssh_exception.NoValidConnectionsError,
            ) as e:
                # If connection failed, wait for the interval period before retrying
                print(
                    f"Machine is not reachable yet (Error: {e}). Retrying in {interval} seconds..."
                )
                time.sleep(interval)
            except Exception as e:
                print(f"Unexpected error: {e}")
                print(traceback.format_exc())
                break

        print("Timeout reached. The remote machine did not come back online.")
        return False

    def close(self):
        """Close the SSH connection."""
        if self.client:
            self.client.close()
            print("Connection closed.")
        else:
            print("Connection was not established.")

    # Enhanced Terraform methods that return both success status and output
    def run_terraform_init_with_output(self, work_dir, backend_config=None, env_vars=None, remote=False):
        """
        Initialize Terraform in the given directory with output capture.
        Returns: (success: bool, output: str, error: str)
        """
        import os
        import shlex
        import shutil
        import subprocess

        tf_cmd = ["terraform", "init", "-lock=false"]
        if backend_config:
            for k, v in backend_config.items():
                tf_cmd.extend(["-backend-config", f"{k}={v}"])
        
        env = os.environ.copy()
        if env_vars:
            env.update(env_vars)
        
        cmd_str = " ".join(shlex.quote(x) for x in tf_cmd)
        
        if remote:
            # Send working dir to remote, run init
            remote_dir = self.send_Directory(work_dir) if (work_dir and os.path.isdir(work_dir)) else None
            if work_dir and not remote_dir:
                return False, "", "Failed to send working directory to remote host."
            
            if remote_dir:
                remote_cmd = f"cd {remote_dir} && {cmd_str}"
            else:
                remote_cmd = cmd_str
                
            result = self.run_command(remote_cmd)
            if result is None:
                return False, "", "Failed to execute remote command."
            
            out, err = result if isinstance(result, tuple) else (str(result), "")
            success = not bool(err)
            return success, out or "", err or ""
        else:
            # Check if terraform is installed locally
            if not shutil.which("terraform"):
                return False, "", "Terraform is not installed or not in PATH."
            
            proc = subprocess.run(
                tf_cmd, cwd=work_dir, env=env, capture_output=True, text=True
            )
            success = proc.returncode == 0
            return success, proc.stdout or "", proc.stderr or ""

    def run_terraform_plan_with_output(self, work_dir, var_file=None, vars_dict=None, env_vars=None, out_plan=None, remote=False):
        """
        Run 'terraform plan' in the given directory with output capture.
        Returns: (success: bool, output: str, error: str)
        """
        import os
        import shlex
        import shutil
        import subprocess

        tf_cmd = ["terraform", "plan", "-lock=false"]
        if var_file:
            tf_cmd.extend(["-var-file", var_file])
        if vars_dict:
            for k, v in vars_dict.items():
                tf_cmd.extend(["-var", f"{k}={v}"])
        if out_plan:
            tf_cmd.extend(["-out", out_plan])
        
        env = os.environ.copy()
        if env_vars:
            env.update(env_vars)
        
        cmd_str = " ".join(shlex.quote(x) for x in tf_cmd)
        
        if remote:
            # Send working dir to remote
            remote_dir = self.send_Directory(work_dir) if (work_dir and os.path.isdir(work_dir)) else None
            if work_dir and not remote_dir:
                return False, "", "Failed to send working directory to remote host."
            
            # Always run init first for remote execution
            init_cmd = "terraform init -lock=false"
            if remote_dir:
                remote_init_cmd = f"cd {remote_dir} && {init_cmd}"
            else:
                remote_init_cmd = init_cmd
                
            init_result = self.run_command(remote_init_cmd)
            if init_result is None:
                return False, "", "Remote terraform init failed."
            
            init_out, init_err = init_result if isinstance(init_result, tuple) else (str(init_result), "")
            if init_err:
                return False, init_out or "", f"Init failed: {init_err}"
            
            # Now run plan
            if remote_dir:
                remote_cmd = f"cd {remote_dir} && {cmd_str}"
            else:
                remote_cmd = cmd_str
                
            result = self.run_command(remote_cmd)
            if result is None:
                return False, init_out or "", "Failed to execute remote plan command."
            
            out, err = result if isinstance(result, tuple) else (str(result), "")
            combined_output = f"INIT OUTPUT:\n{init_out}\n\nPLAN OUTPUT:\n{out or ''}"
            success = not bool(err)
            return success, combined_output, err or ""
        else:
            # Check if terraform is installed locally
            if not shutil.which("terraform"):
                return False, "", "Terraform is not installed or not in PATH."
            
            proc = subprocess.run(
                tf_cmd, cwd=work_dir, env=env, capture_output=True, text=True
            )
            success = proc.returncode == 0
            return success, proc.stdout or "", proc.stderr or ""

    def run_terraform_apply_with_output(self, work_dir, plan_file=None, auto_approve=True, env_vars=None, remote=False):
        """
        Run 'terraform apply' in the given directory with output capture.
        Returns: (success: bool, output: str, error: str)
        """
        import os
        import shlex
        import shutil
        import subprocess

        tf_cmd = ["terraform", "apply", "-lock=false"]
        if auto_approve:
            tf_cmd.append("-auto-approve")
        if plan_file:
            tf_cmd.append(plan_file)
        
        env = os.environ.copy()
        if env_vars:
            env.update(env_vars)
        
        cmd_str = " ".join(shlex.quote(x) for x in tf_cmd)
        
        if remote:
            # Send working dir to remote
            remote_dir = self.send_Directory(work_dir) if (work_dir and os.path.isdir(work_dir)) else None
            if work_dir and not remote_dir:
                return False, "", "Failed to send working directory to remote host."
            
            # Always run init first for remote execution
            init_cmd = "terraform init -lock=false"
            if remote_dir:
                remote_init_cmd = f"cd {remote_dir} && {init_cmd}"
            else:
                remote_init_cmd = init_cmd
                
            init_result = self.run_command(remote_init_cmd)
            if init_result is None:
                return False, "", "Remote terraform init failed."
            
            init_out, init_err = init_result if isinstance(init_result, tuple) else (str(init_result), "")
            if init_err:
                return False, init_out or "", f"Init failed: {init_err}"
            
            # Now run apply
            if remote_dir:
                remote_cmd = f"cd {remote_dir} && {cmd_str}"
            else:
                remote_cmd = cmd_str
                
            result = self.run_command(remote_cmd)
            if result is None:
                return False, init_out or "", "Failed to execute remote apply command."
            
            out, err = result if isinstance(result, tuple) else (str(result), "")
            combined_output = f"INIT OUTPUT:\n{init_out}\n\nAPPLY OUTPUT:\n{out or ''}"
            success = not bool(err)
            return success, combined_output, err or ""
        else:
            # Check if terraform is installed locally
            if not shutil.which("terraform"):
                return False, "", "Terraform is not installed or not in PATH."
            
            proc = subprocess.run(
                tf_cmd, cwd=work_dir, env=env, capture_output=True, text=True
            )
            success = proc.returncode == 0
            return success, proc.stdout or "", proc.stderr or ""

    def run_project_directory(
        self,
        project_dir,
        main_file=None,
        project_type="python",
        custom_command=None,
        remote=True,
        extra_args=None,
    ):
        """
        Execute a project directory by copying it and running the main file.
        
        Args:
            project_dir (str): Path to the project directory
            main_file (str, optional): Main file to execute. If None, will try to detect automatically.
            project_type (str): Type of project ('python', 'ansible', 'terraform')
            custom_command (str, optional): Custom command to execute instead of default
            remote (bool): Whether to run on remote host (True) or locally (False)
            extra_args (str, optional): Additional arguments to pass to the execution command
        
        Returns:
            dict: Execution result with success, output, error, and execution details
        """
        import os
        import shutil
        import subprocess
        import tempfile
        
        if not os.path.isdir(project_dir):
            return {
                "success": False,
                "output": "",
                "error": f"Project directory not found: {project_dir}",
                "main_file": main_file,
                "execution_location": "none"
            }
        
        # Auto-detect main file if not provided
        if not main_file:
            main_file = self._detect_main_file(project_dir, project_type)
            if not main_file:
                return {
                    "success": False,
                    "output": "",
                    "error": f"No main file found for {project_type} project in {project_dir}",
                    "main_file": None,
                    "execution_location": "none"
                }
        
        # Validate main file exists
        main_file_path = os.path.join(project_dir, main_file)
        if not os.path.exists(main_file_path):
            return {
                "success": False,
                "output": "",
                "error": f"Main file not found: {main_file_path}",
                "main_file": main_file,
                "execution_location": "none"
            }
        
        execution_location = "remote" if remote else "local"
        
        try:
            if remote and self.client:
                # Remote execution: upload directory and execute
                return self._execute_project_remote(project_dir, main_file, project_type, custom_command, extra_args)
            else:
                # Local execution: execute in local directory
                return self._execute_project_local(project_dir, main_file, project_type, custom_command, extra_args)
                
        except Exception as e:
            return {
                "success": False,
                "output": "",
                "error": f"Project execution failed: {str(e)}",
                "main_file": main_file,
                "execution_location": execution_location
            }
    
    def _detect_main_file(self, project_dir, project_type):
        """Detect the main file for a project based on type and common patterns."""
        import os
        
        if project_type == "python":
            # Look for common Python main files
            candidates = [
                "main.py", "app.py", "run.py", "__main__.py", 
                "start.py", "server.py", "manage.py"
            ]
            for candidate in candidates:
                if os.path.exists(os.path.join(project_dir, candidate)):
                    return candidate
            
            # Look for any Python file if no main file found
            for file in os.listdir(project_dir):
                if file.endswith('.py') and not file.startswith('_'):
                    return file
                    
        elif project_type == "ansible":
            # Look for common Ansible files
            candidates = [
                "playbook.yml", "playbook.yaml", "main.yml", "main.yaml",
                "site.yml", "site.yaml", "deploy.yml", "deploy.yaml"
            ]
            for candidate in candidates:
                if os.path.exists(os.path.join(project_dir, candidate)):
                    return candidate
                    
            # Look for any YAML file
            for file in os.listdir(project_dir):
                if file.endswith(('.yml', '.yaml')):
                    return file
                    
        elif project_type == "terraform":
            # Look for common Terraform files
            candidates = [
                "main.tf", "terraform.tf", "infrastructure.tf", "resources.tf"
            ]
            for candidate in candidates:
                if os.path.exists(os.path.join(project_dir, candidate)):
                    return candidate
                    
            # Look for any .tf file
            for file in os.listdir(project_dir):
                if file.endswith('.tf'):
                    return file
        
        return None
    
    def _execute_project_remote(self, project_dir, main_file, project_type, custom_command, extra_args):
        """Execute project on remote host."""
        import time
        
        if not self.client:
            return {
                "success": False,
                "output": "",
                "error": "Not connected to remote host. Call login() first.",
                "main_file": main_file,
                "execution_location": "remote"
            }
        
        start_time = time.time()
        
        # Upload entire project directory
        print(f"Uploading project directory {project_dir} to remote host...")
        remote_dir = self.send_Directory(project_dir)
        
        if not remote_dir:
            return {
                "success": False,
                "output": "",
                "error": "Failed to upload project directory to remote host",
                "main_file": main_file,
                "execution_location": "remote"
            }
        
        print(f"Project uploaded to: {remote_dir}")
        
        # Detect remote OS for command construction
        remote_os_info = self.get_remote_os()
        remote_os = remote_os_info.get("os", "linux").lower()
        
        # Build execution command
        if custom_command:
            # Use custom command
            exec_cmd = f"cd '{remote_dir}' && {custom_command}"
            if extra_args:
                exec_cmd += f" {extra_args}"
        else:
            # Build default command based on project type
            exec_cmd = self._build_execution_command(remote_dir, main_file, project_type, remote_os, extra_args)
        
        print(f"Executing command: {exec_cmd}")
        
        # Execute the command
        output, errors = self.run_command(exec_cmd)
        end_time = time.time()
        
        return {
            "success": not bool(errors),
            "output": output or "",
            "error": errors or "",
            "main_file": main_file,
            "execution_location": "remote",
            "execution_time": end_time - start_time,
            "remote_directory": remote_dir,
            "command": exec_cmd
        }
    
    def _execute_project_local(self, project_dir, main_file, project_type, custom_command, extra_args):
        """Execute project locally."""
        import subprocess
        import time
        import os
        
        start_time = time.time()
        
        # Build execution command for local execution
        if custom_command:
            # Use custom command
            exec_cmd = custom_command
            if extra_args:
                exec_cmd += f" {extra_args}"
        else:
            # Build default command based on project type
            exec_cmd = self._build_execution_command(project_dir, main_file, project_type, "linux", extra_args)
        
        print(f"Executing locally: {exec_cmd}")
        
        try:
            # Execute locally
            result = subprocess.run(
                exec_cmd,
                shell=True,
                cwd=project_dir,
                capture_output=True,
                text=True,
                timeout=600  # 10 minute timeout
            )
            
            end_time = time.time()
            
            return {
                "success": result.returncode == 0,
                "output": result.stdout or "",
                "error": result.stderr or "",
                "main_file": main_file,
                "execution_location": "local",
                "execution_time": end_time - start_time,
                "command": exec_cmd,
                "return_code": result.returncode
            }
            
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "output": "",
                "error": "Command execution timed out after 10 minutes",
                "main_file": main_file,
                "execution_location": "local",
                "command": exec_cmd
            }
        except Exception as e:
            return {
                "success": False,
                "output": "",
                "error": f"Local execution failed: {str(e)}",
                "main_file": main_file,
                "execution_location": "local",
                "command": exec_cmd
            }
    
    def _build_execution_command(self, work_dir, main_file, project_type, os_type, extra_args):
        """Build execution command based on project type and OS."""
        
        if project_type == "python":
            # Python execution
            if os_type == "windows":
                python_cmd = "python"
            else:
                python_cmd = "python3"
            
            cmd = f"{python_cmd} {main_file}"
            if extra_args:
                cmd += f" {extra_args}"
            
            # For remote execution, include cd command
            if not work_dir.endswith(main_file):
                cmd = f"cd '{work_dir}' && {cmd}"
                
        elif project_type == "ansible":
            # Ansible execution (always runs locally, targeting remote)
            # Note: For ansible, work_dir should be the playbook path for local execution
            # or the remote directory path for remote setup
            if main_file.endswith(('.yml', '.yaml')):
                if work_dir.endswith(main_file):
                    # work_dir is the full path to playbook
                    cmd = f"ansible-playbook {work_dir}"
                else:
                    # work_dir is directory, main_file is relative
                    cmd = f"ansible-playbook {work_dir}/{main_file}"
                    
                if extra_args:
                    cmd += f" {extra_args}"
            else:
                # Not a playbook, just display content
                if os_type == "windows":
                    cmd = f"type {main_file}"
                else:
                    cmd = f"cat {main_file}"
                
                if not work_dir.endswith(main_file):
                    cmd = f"cd '{work_dir}' && {cmd}"
                    
        elif project_type == "terraform":
            # Terraform execution with proper workflow
            if main_file.endswith('.tf'):
                # Full Terraform workflow: init -> plan -> apply
                base_cmd = "terraform init"
                if extra_args and "init-only" in extra_args:
                    cmd = base_cmd
                elif extra_args and "plan-only" in extra_args:
                    cmd = f"{base_cmd} && terraform plan"
                else:
                    cmd = f"{base_cmd} && terraform plan -out=tfplan && terraform apply -auto-approve tfplan"
                    
                if extra_args and not any(x in extra_args for x in ["init-only", "plan-only"]):
                    # Add extra args to apply command
                    clean_args = extra_args.replace("init-only", "").replace("plan-only", "").strip()
                    if clean_args:
                        cmd = cmd.replace("terraform apply", f"terraform apply {clean_args}")
            else:
                # Not a Terraform file, just display content
                if os_type == "windows":
                    cmd = f"type {main_file}"
                else:
                    cmd = f"cat {main_file}"
                    
            # For remote execution, include cd command
            if not work_dir.endswith(main_file):
                cmd = f"cd '{work_dir}' && {cmd}"
        else:
            # Generic execution - just display the file
            if os_type == "windows":
                cmd = f"type {main_file}"
            else:
                cmd = f"cat {main_file}"
                
            if not work_dir.endswith(main_file):
                cmd = f"cd '{work_dir}' && {cmd}"
        
        return cmd

    # === DOCKER MANAGEMENT METHODS ===
    
    def docker_info(self):
        """Get Docker system information."""
        if not self.client:
            print("Connection not established. Call login() first.")
            return {"success": False, "error": "No connection"}
        
        try:
            # Get Docker version and info
            version_output, version_errors = self.run_command("docker --version", verbose=False)
            info_output, info_errors = self.run_command("docker info --format json", verbose=False)
            
            if version_errors and "command not found" in version_errors.lower():
                return {"success": False, "error": "Docker is not installed on this machine"}
            
            return {
                "success": True,
                "version": version_output.strip() if version_output else "",
                "info": info_output.strip() if info_output else "",
                "errors": version_errors or info_errors
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def docker_list_images(self):
        """List all Docker images."""
        if not self.client:
            print("Connection not established. Call login() first.")
            return {"success": False, "error": "No connection"}
        
        try:
            output, errors = self.run_command("docker images --format 'table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.CreatedAt}}\t{{.Size}}'", verbose=False)
            
            if errors and "command not found" in errors.lower():
                return {"success": False, "error": "Docker is not installed on this machine"}
            
            return {
                "success": True,
                "output": output.strip() if output else "",
                "errors": errors
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def docker_list_containers(self, all_containers=True):
        """List Docker containers."""
        if not self.client:
            print("Connection not established. Call login() first.")
            return {"success": False, "error": "No connection"}
        
        try:
            flag = "-a" if all_containers else ""
            cmd = f"docker ps {flag} --format 'table {{.ID}}\t{{.Image}}\t{{.Command}}\t{{.CreatedAt}}\t{{.Status}}\t{{.Ports}}\t{{.Names}}'"
            output, errors = self.run_command(cmd, verbose=False)
            
            if errors and "command not found" in errors.lower():
                return {"success": False, "error": "Docker is not installed on this machine"}
            
            return {
                "success": True,
                "output": output.strip() if output else "",
                "errors": errors
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def docker_list_networks(self):
        """List Docker networks."""
        if not self.client:
            print("Connection not established. Call login() first.")
            return {"success": False, "error": "No connection"}
        
        try:
            output, errors = self.run_command("docker network ls --format 'table {{.ID}}\t{{.Name}}\t{{.Driver}}\t{{.Scope}}'", verbose=False)
            
            if errors and "command not found" in errors.lower():
                return {"success": False, "error": "Docker is not installed on this machine"}
            
            return {
                "success": True,
                "output": output.strip() if output else "",
                "errors": errors
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def docker_list_volumes(self):
        """List Docker volumes."""
        if not self.client:
            print("Connection not established. Call login() first.")
            return {"success": False, "error": "No connection"}
        
        try:
            output, errors = self.run_command("docker volume ls --format 'table {{.Driver}}\t{{.Name}}'", verbose=False)
            
            if errors and "command not found" in errors.lower():
                return {"success": False, "error": "Docker is not installed on this machine"}
            
            return {
                "success": True,
                "output": output.strip() if output else "",
                "errors": errors
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def docker_inspect_container(self, container_id):
        """Inspect a Docker container."""
        if not self.client:
            print("Connection not established. Call login() first.")
            return {"success": False, "error": "No connection"}
        
        try:
            output, errors = self.run_command(f"docker inspect {container_id}", verbose=False)
            
            return {
                "success": not bool(errors),
                "output": output.strip() if output else "",
                "errors": errors
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def docker_container_logs(self, container_id, tail=50):
        """Get container logs."""
        if not self.client:
            print("Connection not established. Call login() first.")
            return {"success": False, "error": "No connection"}
        
        try:
            output, errors = self.run_command(f"docker logs --tail {tail} {container_id}", verbose=False)
            
            return {
                "success": True,
                "output": output.strip() if output else "",
                "errors": errors
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def docker_pull_image(self, image_name):
        """Pull a Docker image."""
        if not self.client:
            print("Connection not established. Call login() first.")
            return {"success": False, "error": "No connection"}
        
        try:
            print(f"Pulling Docker image: {image_name}")
            output, errors = self.run_command(f"docker pull {image_name}", timeout=600)
            
            success = not bool(errors) or "downloaded" in output.lower() or "up to date" in output.lower()
            
            return {
                "success": success,
                "output": output.strip() if output else "",
                "errors": errors
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def docker_run_container(self, image_name, container_name=None, ports=None, volumes=None, env_vars=None, detach=True, additional_args=""):
        """Run a Docker container."""
        if not self.client:
            print("Connection not established. Call login() first.")
            return {"success": False, "error": "No connection"}
        
        try:
            cmd = "docker run"
            
            if detach:
                cmd += " -d"
            
            if container_name:
                cmd += f" --name {container_name}"
            
            if ports:
                for port_mapping in ports:
                    cmd += f" -p {port_mapping}"
            
            if volumes:
                for volume_mapping in volumes:
                    cmd += f" -v {volume_mapping}"
            
            if env_vars:
                for env_var in env_vars:
                    cmd += f" -e {env_var}"
            
            if additional_args:
                cmd += f" {additional_args}"
            
            cmd += f" {image_name} tail -f /dev/null"
            
            print(f"Running Docker container: {cmd}")
            output, errors = self.run_command(cmd)
            
            success = not bool(errors) or len(output.strip()) > 0
            
            return {
                "success": success,
                "output": output.strip() if output else "",
                "errors": errors,
                "command": cmd
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def docker_stop_container(self, container_id):
        """Stop a Docker container."""
        if not self.client:
            print("Connection not established. Call login() first.")
            return {"success": False, "error": "No connection"}
        
        try:
            output, errors = self.run_command(f"docker stop {container_id}")
            
            success = not bool(errors)
            
            return {
                "success": success,
                "output": output.strip() if output else "",
                "errors": errors
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def docker_start_container(self, container_id):
        """Start a Docker container."""
        if not self.client:
            print("Connection not established. Call login() first.")
            return {"success": False, "error": "No connection"}
        
        try:
            # Start the container in detached mode
            output, errors = self.run_command(f"docker start {container_id}")
            
            # Docker start command typically returns the container ID on success
            # If there are no errors and we got output, it's successful
            success = not bool(errors) and bool(output.strip())
            
            # If start failed but container might need interactive/TTY flags, try alternative
            if not success and errors:
                print(f"Standard start failed, trying with detached mode: {errors}")
                # Try starting with detached flag (for containers that need it)
                output2, errors2 = self.run_command(f"docker start {container_id}")
                if not bool(errors2) and bool(output2.strip()):
                    success = True
                    output = output2
                    errors = errors2
            
            return {
                "success": success,
                "output": output.strip() if output else "",
                "errors": errors,
                "command": f"docker start {container_id}"
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def docker_restart_container(self, container_id):
        """Restart a Docker container."""
        if not self.client:
            print("Connection not established. Call login() first.")
            return {"success": False, "error": "No connection"}
        
        try:
            output, errors = self.run_command(f"docker restart {container_id}")
            
            success = not bool(errors)
            
            return {
                "success": success,
                "output": output.strip() if output else "",
                "errors": errors
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def docker_remove_container(self, container_id, force=False):
        """Remove a Docker container."""
        if not self.client:
            print("Connection not established. Call login() first.")
            return {"success": False, "error": "No connection"}
        
        try:
            cmd = f"docker rm {container_id}"
            if force:
                cmd = f"docker rm -f {container_id}"
            
            output, errors = self.run_command(cmd)
            
            success = not bool(errors)
            
            return {
                "success": success,
                "output": output.strip() if output else "",
                "errors": errors
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def docker_remove_image(self, image_id, force=False):
        """Remove a Docker image."""
        if not self.client:
            print("Connection not established. Call login() first.")
            return {"success": False, "error": "No connection"}
        
        try:
            cmd = f"docker rmi {image_id}"
            if force:
                cmd = f"docker rmi -f {image_id}"
            
            output, errors = self.run_command(cmd)
            
            success = not bool(errors)
            
            return {
                "success": success,
                "output": output.strip() if output else "",
                "errors": errors
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def docker_exec_command(self, container_id, command, interactive=False):
        """Execute a command inside a Docker container."""
        if not self.client:
            print("Connection not established. Call login() first.")
            return {"success": False, "error": "No connection"}
        
        try:
            cmd = f"docker exec"
            if interactive:
                cmd += " -it"
            cmd += f" {container_id} {command}"
            
            output, errors = self.run_command(cmd)
            
            return {
                "success": True,
                "output": output.strip() if output else "",
                "errors": errors,
                "command": cmd
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def docker_build_image(self, dockerfile_path, image_name, build_context="."):
        """Build a Docker image from Dockerfile."""
        if not self.client:
            print("Connection not established. Call login() first.")
            return {"success": False, "error": "No connection"}
        
        try:
            cmd = f"docker build -f {dockerfile_path} -t {image_name} {build_context}"
            
            print(f"Building Docker image: {cmd}")
            output, errors = self.run_command(cmd, timeout=600)
            
            success = "successfully built" in output.lower() or "successfully tagged" in output.lower()
            
            return {
                "success": success,
                "output": output.strip() if output else "",
                "errors": errors,
                "command": cmd
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def docker_get_container_stats(self, container_id):
        """Get real-time stats for a container."""
        if not self.client:
            print("Connection not established. Call login() first.")
            return {"success": False, "error": "No connection"}
        
        try:
            # Get one-time stats (no streaming)
            output, errors = self.run_command(f"docker stats --no-stream --format 'table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}' {container_id}", verbose=False)
            
            return {
                "success": not bool(errors),
                "output": output.strip() if output else "",
                "errors": errors
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def docker_compose_up(self, compose_file_path, detach=True, build=False):
        """Run docker-compose up."""
        if not self.client:
            print("Connection not established. Call login() first.")
            return {"success": False, "error": "No connection"}
        
        try:
            cmd = f"docker-compose -f {compose_file_path} up"
            if detach:
                cmd += " -d"
            if build:
                cmd += " --build"
            
            output, errors = self.run_command(cmd, timeout=600)
            
            success = not bool(errors) or "started" in output.lower()
            
            return {
                "success": success,
                "output": output.strip() if output else "",
                "errors": errors,
                "command": cmd
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def docker_compose_down(self, compose_file_path, remove_volumes=False):
        """Run docker-compose down."""
        if not self.client:
            print("Connection not established. Call login() first.")
            return {"success": False, "error": "No connection"}
        
        try:
            cmd = f"docker-compose -f {compose_file_path} down"
            if remove_volumes:
                cmd += " -v"
            
            output, errors = self.run_command(cmd)
            
            success = not bool(errors)
            
            return {
                "success": success,
                "output": output.strip() if output else "",
                "errors": errors,
                "command": cmd
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def docker_system_prune(self, all_unused=False, volumes=False, containers=False):
        """Clean up Docker system."""
        if not self.client:
            print("Connection not established. Call login() first.")
            return {"success": False, "error": "No connection"}
        
        try:
            output_lines = []
            
            # Remove unused containers first if requested
            if containers:
                containers_output, containers_errors = self.run_command("docker container prune -f")
                if not containers_errors:
                    output_lines.append("Container cleanup:")
                    output_lines.append(containers_output.strip())
                    output_lines.append("")
            
            # Standard system prune
            cmd = "docker system prune -f"
            if all_unused:
                cmd += " -a"
            if volumes:
                cmd += " --volumes"
            
            output, errors = self.run_command(cmd)
            
            success = not bool(errors)
            
            # Combine outputs
            if output_lines:
                output_lines.append("System cleanup:")
                output_lines.append(output.strip())
                final_output = "\n".join(output_lines)
            else:
                final_output = output.strip() if output else ""
            
            return {
                "success": success,
                "output": final_output,
                "errors": errors,
                "command": cmd
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def docker_get_running_containers_with_ports(self):
        """Get running containers with exposed ports information."""
        if not self.client:
            print("Connection not established. Call login() first.")
            return {"success": False, "error": "No connection"}
        
        try:
            # Get detailed container information with ports
            output, errors = self.run_command("docker ps --format 'json'", verbose=False)
            
            if errors and "command not found" in errors.lower():
                return {"success": False, "error": "Docker is not installed on this machine"}
            
            return {
                "success": True,
                "output": output.strip() if output else "",
                "errors": errors
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def __del__(self):
        """Ensure the SSH connection is closed when the object is deleted."""
        self.close()
