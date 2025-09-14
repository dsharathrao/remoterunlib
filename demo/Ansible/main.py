
from remoteinfra import SSHClient

if __name__ == "__main__":
    client = SSHClient(hostname='192.168.0.100', username='sharath', password='')
    client.login()

    # Run a shell command
    print(client.run_command('ls -l'))

    # Run an Ansible playbook
    client.run_ansible_playbook('test_playbook.yml', inventory_file='inventory.ini')

    # Run an ad-hoc Ansible command
    client.run_ansible_playbook('uptime', inventory_file='inventory.ini')

    client.close()
