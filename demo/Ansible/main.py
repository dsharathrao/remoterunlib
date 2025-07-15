from remoterunlib import SSHClient


client = SSHClient(hostname='192.168.0.100', username='sharath', password='')

client.login()

client.run_command('ls -l')

client.run_ansible_playbook('test_playbook.yml', inventory_file='inventory.ini', out='output1.log', display=False, extra_vars='my_var=my_value')
client.run_ansible_playbook('uptime', inventory_file='inventory.ini', out='output2.log')
client.run_command('ls -l')
client.run_ansible_playbook('uptime', out='output3.log')

client.close()
