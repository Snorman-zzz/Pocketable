#!/bin/bash
# Install Auto-Stop Monitor on Daytona EC2 Instance
set -euo pipefail

echo "Installing Auto-Stop Monitoring Service..."

# Copy Python script
sudo cp auto-stop-monitor.py /home/ubuntu/auto-stop-monitor.py
sudo chmod +x /home/ubuntu/auto-stop-monitor.py
sudo chown ubuntu:ubuntu /home/ubuntu/auto-stop-monitor.py

# Install dependencies
sudo apt-get update
sudo apt-get install -y python3-pip
sudo pip3 install requests

# Copy systemd service file
sudo cp auto-stop-monitor.service /etc/systemd/system/auto-stop-monitor.service

# Create log directory and file
sudo mkdir -p /var/lib/daytona
sudo touch /var/log/auto-stop-monitor.log
sudo chown ubuntu:ubuntu /var/log/auto-stop-monitor.log

# Add IAM permission for instance to stop itself
# This needs to be done via IAM role (already configured in Terraform)

# Reload systemd
sudo systemctl daemon-reload

# Enable and start service
sudo systemctl enable auto-stop-monitor.service
sudo systemctl start auto-stop-monitor.service

# Check status
sudo systemctl status auto-stop-monitor.service

echo ""
echo "✓ Auto-Stop Monitor installed successfully!"
echo ""
echo "Useful commands:"
echo "  - Check status: sudo systemctl status auto-stop-monitor"
echo "  - View logs: sudo journalctl -u auto-stop-monitor -f"
echo "  - Restart: sudo systemctl restart auto-stop-monitor"
echo "  - Stop: sudo systemctl stop auto-stop-monitor"
echo ""
