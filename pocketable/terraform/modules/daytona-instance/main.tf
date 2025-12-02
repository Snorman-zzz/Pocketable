# Daytona EC2 Instance Module
# Provisions a VM to run self-hosted Daytona with Docker

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# Security Group for Daytona
resource "aws_security_group" "daytona" {
  name_prefix = "${var.environment}-daytona-"
  description = "Security group for Daytona instance"
  vpc_id      = var.vpc_id

  # SSH access (for debugging)
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.allowed_ssh_cidrs
    description = "SSH access"
  }

  # Daytona API
  ingress {
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Daytona API"
  }

  # Backend API
  ingress {
    from_port   = 3001
    to_port     = 3001
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Backend API"
  }

  # HTTP (for Caddy ACME challenge and redirects)
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTP for Caddy TLS"
  }

  # HTTPS (for Caddy TLS preview URLs)
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTPS for Caddy TLS"
  }

  # Registry
  ingress {
    from_port   = 6000
    to_port     = 6000
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/8"]
    description = "Docker Registry (internal)"
  }

  # Outbound internet access
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound"
  }

  tags = {
    Name        = "${var.environment}-daytona-sg"
    Environment = var.environment
  }

  lifecycle {
    create_before_destroy = true
  }
}

# IAM Role for EC2
resource "aws_iam_role" "daytona_instance" {
  name = "${var.environment}-daytona-instance-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
    }]
  })

  tags = {
    Name        = "${var.environment}-daytona-instance-role"
    Environment = var.environment
  }
}

# IAM Instance Profile
resource "aws_iam_instance_profile" "daytona" {
  name = "${var.environment}-daytona-instance-profile"
  role = aws_iam_role.daytona_instance.name
}

# Attach SSM managed policy (for Systems Manager access)
resource "aws_iam_role_policy_attachment" "daytona_ssm" {
  role       = aws_iam_role.daytona_instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# Allow instance to stop itself (for auto-stop feature)
resource "aws_iam_role_policy" "daytona_stop" {
  name = "${var.environment}-daytona-stop-policy"
  role = aws_iam_role.daytona_instance.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "ec2:StopInstances",
        "ec2:DescribeInstances"
      ]
      Resource = "*"
      Condition = {
        StringEquals = {
          "ec2:ResourceTag/Environment" = var.environment
        }
      }
    }]
  })
}

# EBS Volume for persistent data
resource "aws_ebs_volume" "daytona_data" {
  availability_zone = var.availability_zone
  size              = var.data_volume_size
  type              = "gp3"
  encrypted         = true

  tags = {
    Name        = "${var.environment}-daytona-data"
    Environment = var.environment
  }
}

# User data script to install Docker and Daytona
locals {
  user_data = templatefile("${path.module}/user-data.sh", {
    data_volume_device = "/dev/xvdf"
    data_mount_point   = "/var/lib/daytona"
    anthropic_api_key  = var.anthropic_api_key
    openai_api_key     = var.openai_api_key
    region             = data.aws_region.current.name
  })
}

# EC2 Instance
resource "aws_instance" "daytona" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  subnet_id              = var.subnet_id
  vpc_security_group_ids = [aws_security_group.daytona.id]
  iam_instance_profile   = aws_iam_instance_profile.daytona.name
  key_name               = var.ssh_key_name

  user_data = local.user_data

  root_block_device {
    volume_size           = 30
    volume_type           = "gp3"
    encrypted             = true
    delete_on_termination = true
  }

  tags = {
    Name        = "${var.environment}-daytona"
    Environment = var.environment
    AutoStop    = "true"  # Used by auto-stop lambda
  }

  lifecycle {
    ignore_changes = [ami]
  }
}

# Attach EBS volume
resource "aws_volume_attachment" "daytona_data" {
  device_name = "/dev/xvdf"
  volume_id   = aws_ebs_volume.daytona_data.id
  instance_id = aws_instance.daytona.id
}

# Elastic IP (so IP doesn't change on stop/start)
resource "aws_eip" "daytona" {
  instance = aws_instance.daytona.id
  domain   = "vpc"

  tags = {
    Name        = "${var.environment}-daytona-eip"
    Environment = var.environment
  }

  depends_on = [aws_instance.daytona]
}

data "aws_region" "current" {}
