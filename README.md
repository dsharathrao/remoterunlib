# remoterunlib

`remoterunlib` is a Python library that facilitates remote command execution, Python function invocation, and PowerShell command execution over SSH. It is built on top of the Paramiko library and provides a simple interface for managing SSH connections and running commands or functions on remote machines.

## OpenSSH setup

Windows : [openssh_install](https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_install_firstuse?tabs=powershell)


## Features

- **SSH Connection Management**: Easily manage SSH connections with support for password and key-based authentication.
- **Remote Command Execution**: Run shell commands on remote machines.
- **Remote Python Function Invocation**: Serialize and execute Python functions remotely.
- **PowerShell Command Execution**: Execute PowerShell commands on remote Windows machines.
-- **Remote machine Restart**: Restart the remote machine
- **Web Dashboard**: Manage remote machines and execute commands via a Flask-based web dashboard with REST API and WebSocket support.
## Installation

Install the package using pip:

```sh
pip install remoterunlib
```

## Usage

### Basic Usage

#### Initializing the SSH Client

```python
from remoterunlib import SSHClient

# Initialize the SSH client
client = SSHClient(hostname='remote_host', port=22, username='user', password='password')
client.login()
```

#### Running Shell Commands

```python
# Run a shell command
output, errors = client.run_command('ls -la', verbose=True) # if verbose False won't display live output in console
if output:
    print("Shell Output:")
    print(output)
if errors:
    print("Shell Errors:")
    print(errors)
```

#### Send files to remote machine

```python
# with default path
remote_script_path = client.send_File("demo_sendFile.txt") # send to C:\temp (Creates temp directory if not exists)
print(remote_script_path) # returns c:\temp\demo_sendFile.txt

# with custom path
remote_script_path = client.send_File("demo_sendFile.txt", "D:\\New") # send to D:\\New (Creates New directory if not exists)
print(remote_script_path)

```

#### Receive files to remote machine

```python
status = client.receive_File("C:\\temp\\sharath.txt", "sharath.txt") # receive file from remote to local directory where script executes
print(status) # return True, False or None (if connection not established)

# with custom path
status = client.receive_File("C:\\temp\\sharath.txt", "D:\\sharath.txt") # receive file from remote to local directory with the full path specified
print(status) # return True, False or None (if connection not established)

```

#### Running Python Functions Remotely

```python

# Run the Python file remotely
# Will copy to Remote machine (#default path: C:\temp)
ssh_client.run_python_file("demo/selenium_test_script.py")
```

#### Running PowerShell Commands

```python
# Run a PowerShell command
ps_output, ps_errors = client.run_powershell_command('Get-Process', verbose=True)  # if verbose False won't display live output in console
if ps_output:
    print("PowerShell Output:")
    print(ps_output)
if ps_errors:
    print("PowerShell Errors:")
    print(ps_errors)
```

#### ping machine

```python
# ping the remote machine
ssh_client.ping() # returns True if no errors occured
```

#### Reboot machine

```python
# Reboot remote machine and wait until wake up based on timeout
ssh_client.reboot(wait_until=300) # wait until 300 seconds
```

#### Closing the SSH Connection

```python
# Close the SSH connection
client.close()
```


### Dashboard API Server

You can launch a web-based dashboard to manage remote machines, execute commands, run Python scripts, Ansible, and Terraform, all from a browser UI.

#### Quick Start

```python
from remoterunlib import Dashboard

client = Dashboard(host='localhost', port=8000)
client.serve()
```

This will start a Flask server at `http://localhost:8000` with a web UI and REST API. You can add machines, run commands, scripts, and more from the browser.

See [`demo/dashboard_example.py`](demo/dashboard_example.py) for a minimal example.

#### API Endpoints

- `GET /api/machines` — List all machines
- `POST /api/machines` — Add a new machine
- `PUT /api/machines/<machine_id>` — Update a machine
- `DELETE /api/machines/<machine_id>` — Delete a machine
- `POST /api/execute-command` — Execute a shell command on a machine
- `POST /api/run-python` — Run a Python script on a machine
- `POST /api/run-ansible` — Run an Ansible playbook or ad-hoc command
- `POST /api/run-terraform` — Run Terraform plan/apply/destroy
- `POST /api/ping-machine` — Ping a machine by ID

The dashboard also provides a web UI at `/` and supports live logs via WebSocket (`/ws`).

---

### Advanced Usage

#### Using Key-based Authentication

```python
client = SSHClient(hostname='remote_host', port=22, username='user', key_file='/path/to/private_key')
client.login()
```

#### Handling Timeouts and Live Output

The `run_command` method supports a timeout parameter and displays live output. If a command exceeds the timeout, it will be terminated, and a timeout message will be displayed.

```python
output, errors = client.run_command('some_long_running_command', timeout=10)
```

#### Singleton Pattern

`SSHClient` uses the singleton pattern, ensuring that only one instance per hostname is created. If you attempt to create another instance with the same hostname, the existing instance will be returned.

```python
client1 = SSHClient(hostname='remote_host', port=22, username='user', password='password')
client2 = SSHClient(hostname='remote_host', port=22, username='user', password='password')

# client1 and client2 are the same instance
assert client1 is client2
```

#### Running Ansible Playbooks or Ad-hoc Commands

You can use `run_ansible_playbook` to run an Ansible playbook or an ad-hoc command on the remote host. This requires Ansible to be installed on your local (controller) machine.

See example usage in [`demo/Ansible/main.py`](demo/Ansible/main.py).

**Run a playbook:**

```python
from remoterunlib import SSHClient

client = SSHClient(hostname='remote_host', username='user', password='password')
client.login()

# Run an Ansible playbook (YAML file)
client.run_ansible_playbook('site.yml', inventory_file='inventory.ini', out='ansible_output.log', display=True)

client.close()
```


**Run an ad-hoc command:**

```python
from remoterunlib import SSHClient

client = SSHClient(hostname='remote_host', username='user', password='password')
client.login()

# Run an ad-hoc Ansible command (e.g., uptime)
client.run_ansible_playbook('uptime', inventory_file='inventory.ini', out='adhoc_output.log')

client.close()
```

#### Running Terraform Commands (Local & Remote)

You can use `SSHClient` to automate Terraform workflows, both locally and on a remote host (if Terraform is installed there). Below is an example:

```python
from remoterunlib import SSHClient

client = SSHClient(hostname='192.168.0.105', username='sharath', password='')
client.login()

# --- Terraform Examples ---
# Example 1: Initialize Terraform for AWS backend (local execution)
aws_backend = {
    'bucket': 'my-tf-state-bucket',
    'key': 'state/terraform.tfstate',
    'region': 'us-east-1'
}
client.run_terraform_init(work_dir='terraform/aws', backend_config=aws_backend, remote=False)

# Example 2: Plan with variables (local execution)
tf_vars = {'instance_type': 't2.micro', 'region': 'us-east-1'}
client.run_terraform_plan(work_dir='terraform/aws', vars_dict=tf_vars, out_plan='tfplan', remote=False)

# Example 3: Apply the plan (local execution)
client.run_terraform_apply(work_dir='terraform/aws', plan_file='tfplan', auto_approve=True, remote=False)

# Example 4: Run a custom Terraform command (show state list)
client.run_terraform(work_dir='terraform/aws', command_args=['state', 'list'], remote=False)

# Example 5: Local (on-prem) Terraform usage (no cloud backend)
client.run_terraform_init(work_dir='terraform/onprem', remote=False)
client.run_terraform_plan(work_dir='terraform/onprem', vars_dict={'hostname': 'myserver', 'ip': '192.168.1.10'}, out_plan='onpremplan', remote=False)
client.run_terraform_apply(work_dir='terraform/onprem', plan_file='onpremplan', auto_approve=True, remote=False)

# Example 6: (Optional) Run Terraform remotely (if SSH target is a Linux host with Terraform installed)
client.run_terraform_init(work_dir='terraform/aws', backend_config=aws_backend, remote=True)
client.run_terraform_plan(work_dir='terraform/aws', vars_dict=tf_vars, out_plan='tfplan', remote=True)
client.run_terraform_apply(work_dir='terraform/aws', plan_file='tfplan', auto_approve=True, remote=True)

client.run_terraform_import(
    work_dir='terraform/aws',
    resource='null_resource.example',
    resource_id='some-id',
    remote=False
)

client.close()
```

See [`demo/terraform/main.py`](demo/terraform/main.py) for a full working example.

- `playbook_or_command`: Path to playbook file (YAML) or ad-hoc command string.
- `inventory_file`: Path to your Ansible inventory file. If not provided, a temporary inventory is created.
- `out`: File to save Ansible output.
- `display`: If True, prints output to console.
- `extra_vars`: Extra variables for Ansible (optional).

## Contributing

Contributions are welcome! Please feel free to submit a pull request or open an issue on GitHub.

## License

This project is licensed under the MIT License. See the LICENSE file for more details.

## Acknowledgments

`remoterunlib` is built on top of [Paramiko](https://www.paramiko.org/). We thank the Paramiko team and contributors for their excellent work.

## Disclaimer

Running remote commands and executing functions on remote machines can pose security risks. Ensure that you only connect to trusted servers and that your use of this library complies with your organization's security policies.
