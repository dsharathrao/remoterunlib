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
# Assume you have a local Terraform directory with local backend (no backend_config needed)
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
