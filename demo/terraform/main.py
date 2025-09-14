
from remoteinfra import SSHClient

if __name__ == "__main__":
    client = SSHClient(hostname='192.168.0.105', username='sharath', password='')
    client.login()

    # Initialize Terraform (local)
    client.run_terraform_init(work_dir='terraform/aws')

    # Plan and apply (local)
    tf_vars = {'instance_type': 't2.micro', 'region': 'us-east-1'}
    client.run_terraform_plan(work_dir='terraform/aws', vars_dict=tf_vars, out_plan='tfplan')
    client.run_terraform_apply(work_dir='terraform/aws', plan_file='tfplan', auto_approve=True)

    # Run a custom Terraform command
    client.run_terraform(work_dir='terraform/aws', command_args=['state', 'list'])

    # On-prem example
    client.run_terraform_init(work_dir='terraform/onprem')
    client.run_terraform_plan(work_dir='terraform/onprem', vars_dict={'hostname': 'myserver', 'ip': '192.168.1.10'}, out_plan='onpremplan')
    client.run_terraform_apply(work_dir='terraform/onprem', plan_file='onpremplan', auto_approve=True)

    # Remote execution (if SSH target has Terraform)
    client.run_terraform_init(work_dir='terraform/aws', remote=True)
    client.run_terraform_plan(work_dir='terraform/aws', vars_dict=tf_vars, out_plan='tfplan', remote=True)
    client.run_terraform_apply(work_dir='terraform/aws', plan_file='tfplan', auto_approve=True, remote=True)

    client.close()
