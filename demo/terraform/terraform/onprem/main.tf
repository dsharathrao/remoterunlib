variable "hostname" {
  description = "On-prem host name"
  type        = string
  default     = "localhost"
}

variable "ip" {
  description = "On-prem host IP"
  type        = string
  default     = "127.0.0.1"
}

terraform {
  required_providers {
    null = {
      source = "hashicorp/null"
    }
  }
}

resource "null_resource" "onprem_example" {
  provisioner "local-exec" {
    command = "echo Hello from On-Prem example"
  }
}
