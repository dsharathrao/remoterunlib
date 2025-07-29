
from remoterunlib import SSHClient

# Example usage
if __name__ == "__main__":
    # Update with your server details
    hostname = "192.168.0.100"
    username = "sharath"
    password = ""

    client = SSHClient(hostname, username, password)
    client.login()

    # Run a shell command
    print(client.run_command("ls -l"))

    # Send and receive files
    client.send_File("demo_sendFile.txt")
    client.receive_File("/tmp/remote_file.txt", "downloaded.txt")

    # Run PowerShell command (on Windows target)
    print(client.run_powershell_command("Get-Process"))

    # Ping and reboot
    print(client.ping())
    # client.reboot(wait_until=60)

    client.close()
