# remoterunlib


`remoterunlib` is a Python library for remote command execution, file transfer, Docker, Ansible, Terraform, PowerShell, and more, all over SSH. It also provides a modern Flask dashboard for managing remote machines and infrastructure from your browser or Python code.

## OpenSSH setup

Windows : [openssh_install](https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_install_firstuse?tabs=powershell)


## Features

- **SSH Connection Management**: Connect to remote machines with password or key authentication.
- **Remote Command Execution**: Run shell, PowerShell, and Python commands/scripts remotely.
- **File Transfer**: Send and receive files easily.
- **Docker Management**: List, start, stop, remove containers/images, and run Docker Compose projects.
- **Ansible Automation**: Run playbooks and ad-hoc commands on remote hosts.
- **Terraform Automation**: Run init/plan/apply/import and custom Terraform commands locally or remotely.
- **Web Dashboard**: Manage everything from a modern Flask dashboard with REST API and live logs.
- **Execution History**: Track, cancel, and view status of remote executions.
## Installation

Install the package using pip:

```sh
pip install remoterunlib
```


## Usage


## Usage Examples

See the `demo/` folder for more examples.

### 1. Connect and Run Commands
```python
from remoterunlib import SSHClient

client = SSHClient(hostname='192.168.1.10', username='user', password='pass')
client.login()

# Run shell command
result = client.run_command('ls -l')
print(result)

# Run PowerShell command (on Windows target)
ps_result = client.run_powershell_command('Get-Process')
print(ps_result)

client.close()
```

### 2. File Transfer
```python
client.send_File('local_file.txt')  # Send file to remote
client.receive_File('/remote/path/file.txt', 'downloaded.txt')  # Receive file from remote
```

### 3. Docker Management
```python
# List containers and images
print(client.docker_list_containers())
print(client.docker_list_images())

# Start/Stop/Remove containers
client.docker_start_container('container_name')
client.docker_stop_container('container_name')
client.docker_remove_container('container_name')

# Run Docker Compose project
client.docker_compose_project_action('docker-compose.yml', action='up', detach=True)
```

### 4. Ansible Automation
```python
# Run playbook
client.run_ansible_playbook('test_playbook.yml', inventory_file='inventory.ini')

# Run ad-hoc command
client.run_ansible_playbook('uptime', inventory_file='inventory.ini')
```

### 5. Terraform Automation
```python
# Local execution
client.run_terraform_init(work_dir='terraform/aws')
client.run_terraform_plan(work_dir='terraform/aws', vars_dict={'instance_type': 't2.micro'})
client.run_terraform_apply(work_dir='terraform/aws', plan_file='tfplan')

# Remote execution (if SSH target has Terraform)
client.run_terraform_init(work_dir='terraform/aws', remote=True)
```

### 6. Web Dashboard
```python
from remoterunlib import Dashboard

dashboard = Dashboard(host='localhost', port=8000)
dashboard.serve()  # Starts the Flask dashboard
```


#### 6. Docker Management (localhost)
You can manage Docker containers and images from both the Dashboard (web UI) and directly using Python code with remoterunlib methods. This is useful for DevOps, automation, and enterprise infrastructure.

**A. Using Dashboard (Web UI):**
```python
from remoterunlib import Dashboard
client = Dashboard(host='localhost', port=8000)
client.serve()
# Open http://localhost:8000 in your browser
# Go to Docker tab to manage containers/images easily
```

**B. Using Python Code ([demo/docker/docker_example.py](https://github.com/dsharathrao/remoterunlib/blob/main/demo/docker/docker_example.py)):**
```python
from remoterunlib import SSHClient

# Connect to localhost (Docker must be installed)
client = SSHClient(hostname="localhost", username="your_username", password="your_password")
client.login()

# List Docker containers
containers = client.docker_list_containers()
print("Containers:", containers)

# List Docker images
images = client.docker_list_images()
print("Images:", images)

# Start a container
result = client.docker_start_container(container_id_or_name="my_container")
print("Start container result:", result)

# Stop a container
result = client.docker_stop_container(container_id_or_name="my_container")
print("Stop container result:", result)

# Remove a container
result = client.docker_remove_container(container_id_or_name="my_container")
print("Remove container result:", result)

# Remove an image
result = client.docker_remove_image(image_id_or_name="my_image")
print("Remove image result:", result)

client.close()
```

For a full working example, see [demo/docker/docker_example.py](https://github.com/dsharathrao/remoterunlib/blob/main/demo/docker/docker_example.py).

#### 7. Run Ansible Playbook ([demo/Ansible/main.py](https://github.com/dsharathrao/remoterunlib/blob/main/demo/Ansible/main.py))
```python
client.run_ansible_playbook('test_playbook.yml', inventory_file='inventory.ini')
```

#### 8. Run Terraform ([demo/terraform/main.py](https://github.com/dsharathrao/remoterunlib/blob/main/demo/terraform/main.py))
```python
client.run_terraform_init(work_dir='terraform/aws')
client.run_terraform_plan(work_dir='terraform/aws')
client.run_terraform_apply(work_dir='terraform/aws', plan_file='tfplan')
```




### Dashboard: Enterprise Remote Management Made Simple

The `remoterunlib` Dashboard is a professional web application for managing remote machines, running commands, scripts, Docker, Ansible, Terraform, and more. Just run the Dashboard and open in your browser. All features are available with live logs, REST API, and a secure, responsive UI. Designed for IT teams, DevOps, and cloud engineers.


### Dashboard Screenshots

1. Home
   ![Dashboard Home](https://raw.githubusercontent.com/dsharathrao/remoterunlib/refs/heads/main/asserts/dashboard/dashboard1.png)
2. Machine Management
   ![Machine Management](https://raw.githubusercontent.com/dsharathrao/remoterunlib/refs/heads/main/asserts/dashboard/dashboard2.png)
3. CLI Commands
   ![Execute CLI Commands](https://raw.githubusercontent.com/dsharathrao/remoterunlib/refs/heads/main/asserts/dashboard/dashboard3.png)
4. Python Scripts
   ![Run Python Scripts](https://raw.githubusercontent.com/dsharathrao/remoterunlib/refs/heads/main/asserts/dashboard/dashboard4.png)
5. Ansible Playbooks
   ![Run Ansible Playbooks](https://raw.githubusercontent.com/dsharathrao/remoterunlib/refs/heads/main/asserts/dashboard/dashboard5.png)
6. Terraform
   ![Run Terraform Playbooks](https://raw.githubusercontent.com/dsharathrao/remoterunlib/refs/heads/main/asserts/dashboard/dashboard6.png)
7. Docker
   ![Manage Docker engine](https://raw.githubusercontent.com/dsharathrao/remoterunlib/refs/heads/main/asserts/dashboard/dashboard7.png)

Many more features coming soon...
---


### Quick Start (Dashboard)

```python
from remoterunlib import Dashboard
client = Dashboard(host='localhost', port=8000)
client.serve()
# Open http://localhost:8000 in browser
```


This launches a Flask server at `http://localhost:8000` with a secure, responsive web UI and REST API. You can manage machines, run commands, scripts, Docker, Ansible, Terraform, and more from your browser. All actions are logged and can be integrated with CI/CD pipelines.


#### Key Features

- **Command Execution**: Run shell commands on any managed machine, with live logs and error reporting.
- **Python Script Runner**: Upload and execute Python scripts, view output and errors in real time.
- **File & Directory Transfer**: Send/receive files and directories between local and remote hosts.
- **Ansible Automation**: Run playbooks or ad-hoc commands, monitor execution, and review logs/history.
- **Terraform Automation**: Plan, apply, import, and manage infrastructure as code, with full output and error tracking.
- **Docker Management**: Start/stop containers, view images, and more (localhost).
- **Execution History**: Every action is logged; review past executions, outputs, and errors.
- **Live Logs**: Real-time streaming of command/script/playbook output via WebSocket.
- **REST API**: Integrate with CI/CD pipelines, automation tools, or custom dashboards.


#### API Endpoints

- `GET /api/machines` — List all machines
- `POST /api/machines` — Add a new machine
- `PUT /api/machines/<machine_id>` — Update a machine
- `DELETE /api/machines/<machine_id>` — Delete a machine
- `POST /api/execute-command` — Execute a shell command on a machine
- `POST /api/run-python` — Run a Python script on a machine
- `POST /api/run-ansible` — Run an Ansible playbook or ad-hoc command
- `POST /api/run-terraform` — Run Terraform plan/apply/destroy
- `POST /api/docker` — Manage Docker containers/images (localhost)
- `POST /api/ping-machine` — Ping a machine by ID

The dashboard also provides a web UI at `/` and supports live logs via WebSocket (`/ws`).

---


### Advanced Usage

#### Key-based Authentication
```python
client = SSHClient(hostname='remote_host', port=22, username='user', key_file='/path/to/private_key')
client.login()
```

#### Timeout and Live Output
```python
output, errors = client.run_command('long_running_command', timeout=10)
```

#### Singleton Pattern
```python
client1 = SSHClient(hostname='remote_host', port=22, username='user', password='password')
client2 = SSHClient(hostname='remote_host', port=22, username='user', password='password')
assert client1 is client2
```

#### Ansible Playbooks/Ad-hoc ([demo/Ansible/main.py](https://github.com/dsharathrao/remoterunlib/blob/main/demo/Ansible/main.py))
```python
client.run_ansible_playbook('site.yml', inventory_file='inventory.ini', out='ansible_output.log', display=True)
client.run_ansible_playbook('uptime', inventory_file='inventory.ini', out='adhoc_output.log')
```

#### Terraform Automation ([demo/terraform/main.py](https://github.com/dsharathrao/remoterunlib/blob/main/demo/terraform/main.py))
```python
aws_backend = {'bucket': 'my-tf-state-bucket', 'key': 'state/terraform.tfstate', 'region': 'us-east-1'}
client.run_terraform_init(work_dir='terraform/aws', backend_config=aws_backend)
client.run_terraform_plan(work_dir='terraform/aws', vars_dict={'instance_type': 't2.micro'})
client.run_terraform_apply(work_dir='terraform/aws', plan_file='tfplan')
client.run_terraform_import(work_dir='terraform/aws', resource='null_resource.example', resource_id='some-id')
```


## Contributing
Contributions are welcome! Please submit a pull request or open an issue on GitHub.

## License
MIT License. See LICENSE file for details.

## Acknowledgments
`remoterunlib` is built on [Paramiko](https://www.paramiko.org/) and Flask. Thanks to all contributors.

## Disclaimer
Running remote commands/scripts can be risky. Connect only to trusted servers and follow your company security policies.
