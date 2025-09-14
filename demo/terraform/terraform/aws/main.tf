variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t2.micro"
}

variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

terraform {
  required_providers {
    null = {
      source = "hashicorp/null"
    }
  }
}

resource "null_resource" "example" {
  provisioner "local-exec" {
    command = "echo Hello from AWS example"
  }
}
