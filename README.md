
# remoterunlib

`remoterunlib` is a Python library that facilitates remote command execution, Python function invocation, and PowerShell command execution over SSH. It is built on top of the Paramiko library and provides a simple interface for managing SSH connections and running commands or functions on remote machines.

## Features

- **SSH Connection Management**: Easily manage SSH connections with support for password and key-based authentication.
- **Remote Command Execution**: Run shell commands on remote machines.
- **Remote Python Function Invocation**: Serialize and execute Python functions remotely.
- **PowerShell Command Execution**: Execute PowerShell commands on remote Windows machines.
- **Remote machine Restart**: Restart the remote machine
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

## Contributing

Contributions are welcome! Please feel free to submit a pull request or open an issue on GitHub.

## License

This project is licensed under the MIT License. See the LICENSE file for more details.

## Acknowledgments

`remoterunlib` is built on top of [Paramiko](https://www.paramiko.org/). We thank the Paramiko team and contributors for their excellent work.

## Disclaimer

Running remote commands and executing functions on remote machines can pose security risks. Ensure that you only connect to trusted servers and that your use of this library complies with your organization's security policies.
