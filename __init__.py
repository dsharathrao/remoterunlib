import io
import sys
import threading
import time
import warnings
from cryptography.utils import CryptographyDeprecationWarning

with warnings.catch_warnings(action="ignore", category=CryptographyDeprecationWarning):
    import paramiko

from utils import *
TIMEOUT = 360


class SSHClient:
    def __init__(self, hostname, username, password=None, port=22, key_file=None):
        self.hostname = hostname
        self.port = port
        self.username = username
        self.password = password
        self.key_file = key_file
        self.client = None

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
            raise AuthenticationFailed("Authentication failed. Please check credentials.")
        except paramiko.SSHException as sshException:
            print(f"Unable to establish SSH connection: {sshException}")
            raise SSHException(f"Unable to establish SSH connection: {sshException}")
        except Exception as e:
            print(f"Exception in connecting: {e}")
            raise UnableToConnect(f"Unable to connect {hostname}. Please check correct details")

    def run_command(self, command, timeout=TIMEOUT, verbose=True):
        """Run a command on the remote server with timeout and live output."""
        if self.client:
            sys.stdout = io.StringIO() if not verbose else sys.__stdout__

            def target():
                nonlocal output, errors
                try:
                    print(f"\nRun_Command: {command}")
                    stdin, stdout, stderr = self.client.exec_command(command)
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
        else:
            print("Connection not established. Call login() first.")
        if not verbose:
            sys.stdout = sys.__stdout__

    def send_File(self, file):
        import os
        if self.client:
            print(f"Sending {file} to remote machine")
            sftp = self.client.open_sftp()
            self.run_command("mkdir C:\\temp", verbose=False)
            remote_script_path = f"C:\\temp\\{os.path.basename(file)}"
            sftp.put(file, remote_script_path)
            print(f"Sent file : {remote_script_path}")
            return remote_script_path
        else:
            print("Connection not established. Call login() first.")
            return None

    def run_python_file(self, script_file):
        """Run a Python function by name on the remote server."""
        import os

        if self.client:
            try:
                remote_script_path = self.send_File(script_file)
                remote_command = f"python {remote_script_path}"
                output, errors = self.run_command(remote_command, timeout=TIMEOUT)
                if errors:
                    print("Errors while executing remote function:")
                    print(errors)
                return True

            except Exception as e:
                print(f"Failed to execute remote function: {e}")
                return False
        else:
            print("Connection not established. Call login() first.")
            return None

    def run_powershell_command(self, command, timeout=360):
        """Run a PowerShell command on the remote server."""
        if self.client:
            try:
                ps_command = f'powershell -Command "{command}"'
                return self.run_command(ps_command, timeout)
            except Exception as e:
                print(f"Failed to execute remote powershell command: {e}")
        else:
            print("Connection not established. Call login() first.")
        return None

    def ping(self):
        """Check the connectivity to the remote server by running the ping command."""
        return self.run_command(f"ping -n 5 {self.hostname}")

    def reboot(self):
        """Reboot remote mahine immediatly"""
        print("Rebooting remote machine")
        return self.run_command("shutdown -r -t 0")

    def close(self):
        """Close the SSH connection."""
        if self.client:
            self.client.close()
            print("Connection closed.")
        else:
            print("Connection was not established.")


# Example usage
if __name__ == "__main__":

    hostname = "192.168.0.105"  # Replace with your server's hostname or IP
    port = 22  # SSH port (usually 22)
    username = "username"  # Replace with your SSH username
    password = "password"  # Replace with your SSH password

    ssh_client = SSHClient(hostname, username, password)
    ssh_client.login()
    result = ssh_client.run_command(
        "pip install bs4 selenium selenium_stealth webdriver-manager --upgrade"
    )
    print(result)
    result = ssh_client.run_python_file("demo/selenium_test_script.py")
    print(f"Result from remote function: {result}")
    # ssh_client.run_command("dir")
    ssh_client.send_File("demo/demo_sendFile.txt")
    ssh_client.ping()
    # ssh_client.run_command("dir")
    # ssh_client.reboot()
    result = ssh_client.run_powershell_command("Get-Process")
    print(result)
    ssh_client.close()
