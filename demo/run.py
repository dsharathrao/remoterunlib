from remoterunlib import SSHClient




# Example usage
if __name__ == "__main__":

    hostname = "192.168.0.105"  # Replace with your server's hostname or IP
    port = 22  # SSH port (usually 22)
    username = "chinni"  # Replace with your SSH username
    password = "wipro@11"  # Replace with your SSH password

    ssh_client = SSHClient(hostname, username, password)
    ssh_client.login()
    # result = ssh_client.run_command(
    #     "pip install bs4 selenium selenium_stealth webdriver-manager --upgrade"
    # )
    # print(result)
    # result = ssh_client.run_python_file("demo/selenium_test_script.py")
    # print(f"Result from remote function: {result}")
    # ssh_client.run_command("dir")
    ssh_client.send_File("demo/demo_sendFile.txt")
    ssh_client.receive_File("C:\\temp\\sharath.txt", "sharath.txt")
    ssh_client.ping()
    ssh_client.run_command("dir")
    ssh_client.reboot()
    ssh_client.run_command("dir")
    result = ssh_client.run_powershell_command("Get-Process")
    ssh_client.close()
