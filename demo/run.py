from remoterunlib import SSHClient




# Example usage
if __name__ == "__main__":

    hostname = "hostname or IP"  # Replace with your server's hostname or IP
    port = 22  # SSH port (usually 22)
    username = "username"  # Replace with your SSH username
    password = "password"  # Replace with your SSH password

    ssh_client = SSHClient(hostname, username, password)
    ssh_client.login()
    # result = ssh_client.run_command(
    #     "pip install bs4 selenium selenium_stealth webdriver-manager --upgrade"
    # )
    # print(result)
    # result = ssh_client.run_python_file("demo/selenium_test_script.py")
    # print(f"Result from remote function: {result}")
    # ssh_client.run_command("dir")
    
    ssh_client.send_File("demo_sendFile.txt")
    ssh_client.receive_File("C:\\temp\\sharath.txt", "sharath.txt")
    ssh_client.ping()
    ssh_client.run_command("dir")
    # ssh_client.reboot()
    ssh_client.run_command("dir")
    ssh_client1 = SSHClient(hostname, username, password)
    result = ssh_client1.run_powershell_command("Get-Process")
    ssh_client.close()
    ssh_client1.close()
