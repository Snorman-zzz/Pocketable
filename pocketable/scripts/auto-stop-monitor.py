#!/usr/bin/env python3
"""
Auto-Stop Monitoring Service for Daytona EC2 Instance

Monitors backend API activity and automatically stops the EC2 instance
after a configured period of inactivity to save costs.

This script should be run as a systemd service on the EC2 instance.
"""

import time
import logging
import os
import json
import subprocess
from datetime import datetime, timedelta
from pathlib import Path
import requests

# Configuration
BACKEND_LOG_FILE = "/var/log/pocketable-backend.log"
ACTIVITY_FILE = "/var/lib/daytona/last-activity.json"
IDLE_THRESHOLD_MINUTES = int(os.environ.get('IDLE_THRESHOLD_MINUTES', '120'))  # 2 hours
CHECK_INTERVAL_SECONDS = int(os.environ.get('CHECK_INTERVAL_SECONDS', '300'))  # 5 minutes
BACKEND_URL = os.environ.get('BACKEND_URL', 'http://localhost:3001')

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/var/log/auto-stop-monitor.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


def get_last_activity_time():
    """
    Get the last activity timestamp from multiple sources:
    1. Backend API health check timestamp
    2. Last modified time of backend log file
    3. Stored activity file

    Returns:
        datetime: Last activity timestamp
    """
    activity_times = []

    # Check backend health endpoint
    try:
        response = requests.get(f"{BACKEND_URL}/health", timeout=5)
        if response.status_code == 200:
            # If backend responds, it's active now
            activity_times.append(datetime.now())
            logger.debug("Backend is responding to health checks")
    except Exception as e:
        logger.debug(f"Backend health check failed: {e}")

    # Check backend log file modification time
    try:
        if os.path.exists(BACKEND_LOG_FILE):
            log_mtime = os.path.getmtime(BACKEND_LOG_FILE)
            activity_times.append(datetime.fromtimestamp(log_mtime))
            logger.debug(f"Backend log last modified: {datetime.fromtimestamp(log_mtime)}")
    except Exception as e:
        logger.debug(f"Could not check log file: {e}")

    # Check stored activity file
    try:
        if os.path.exists(ACTIVITY_FILE):
            with open(ACTIVITY_FILE, 'r') as f:
                data = json.load(f)
                stored_time = datetime.fromisoformat(data['last_activity'])
                activity_times.append(stored_time)
                logger.debug(f"Stored activity time: {stored_time}")
    except Exception as e:
        logger.debug(f"Could not read activity file: {e}")

    # Check Docker container stats (if containers are running, there's activity)
    try:
        result = subprocess.run(
            ['docker', 'ps', '--format', '{{.Names}}'],
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.returncode == 0 and result.stdout.strip():
            container_count = len(result.stdout.strip().split('\n'))
            if container_count > 0:
                logger.debug(f"Found {container_count} running containers")
                # Don't add activity time just because containers are running
                # Only add if backend is actually being used
    except Exception as e:
        logger.debug(f"Could not check Docker containers: {e}")

    # Return the most recent activity time
    if activity_times:
        most_recent = max(activity_times)
        logger.info(f"Last activity detected: {most_recent}")
        return most_recent
    else:
        # No activity detected, return stored time or very old time
        logger.warning("No activity detected from any source")
        return datetime.now() - timedelta(days=1)


def update_activity_file(timestamp):
    """
    Update the activity file with the latest timestamp.

    Args:
        timestamp (datetime): Activity timestamp
    """
    try:
        os.makedirs(os.path.dirname(ACTIVITY_FILE), exist_ok=True)
        with open(ACTIVITY_FILE, 'w') as f:
            json.dump({
                'last_activity': timestamp.isoformat(),
                'last_check': datetime.now().isoformat()
            }, f, indent=2)
        logger.debug(f"Updated activity file with timestamp: {timestamp}")
    except Exception as e:
        logger.error(f"Could not update activity file: {e}")


def stop_instance():
    """
    Stop the current EC2 instance using AWS CLI.
    This requires the instance to have an IAM role with ec2:StopInstances permission.
    """
    try:
        # Get instance ID from metadata service
        response = requests.get(
            'http://169.254.169.254/latest/meta-data/instance-id',
            timeout=2
        )
        instance_id = response.text.strip()

        logger.info(f"Stopping instance {instance_id} due to inactivity...")

        # Get region from metadata
        response = requests.get(
            'http://169.254.169.254/latest/meta-data/placement/region',
            timeout=2
        )
        region = response.text.strip()

        # Stop the instance
        result = subprocess.run(
            ['aws', 'ec2', 'stop-instances',
             '--instance-ids', instance_id,
             '--region', region],
            capture_output=True,
            text=True,
            timeout=30
        )

        if result.returncode == 0:
            logger.info(f"Successfully initiated instance stop: {instance_id}")
            return True
        else:
            logger.error(f"Failed to stop instance: {result.stderr}")
            return False

    except Exception as e:
        logger.error(f"Error stopping instance: {e}")
        return False


def check_and_stop_if_idle():
    """
    Check if the instance has been idle for longer than the threshold.
    If so, stop the instance.

    Returns:
        bool: True if instance should continue running, False if stopped
    """
    try:
        last_activity = get_last_activity_time()
        now = datetime.now()
        idle_duration = now - last_activity
        idle_minutes = idle_duration.total_seconds() / 60

        logger.info(f"Idle for {idle_minutes:.1f} minutes (threshold: {IDLE_THRESHOLD_MINUTES} minutes)")

        # Update activity file
        update_activity_file(last_activity)

        # Check if idle threshold exceeded
        if idle_minutes >= IDLE_THRESHOLD_MINUTES:
            logger.warning(f"Instance has been idle for {idle_minutes:.1f} minutes, initiating shutdown...")

            # Give a grace period for any in-flight requests
            logger.info("Waiting 60 seconds before shutdown (grace period)...")
            time.sleep(60)

            # Final check
            final_activity = get_last_activity_time()
            if (datetime.now() - final_activity).total_seconds() / 60 >= IDLE_THRESHOLD_MINUTES:
                if stop_instance():
                    logger.info("Instance stop initiated successfully")
                    return False
                else:
                    logger.error("Failed to stop instance, will retry on next check")
            else:
                logger.info("Activity detected during grace period, canceling shutdown")

        return True

    except Exception as e:
        logger.error(f"Error in check_and_stop_if_idle: {e}", exc_info=True)
        return True  # Continue running on error


def main():
    """
    Main loop for the auto-stop monitoring service.
    """
    logger.info("="*60)
    logger.info("Auto-Stop Monitoring Service Started")
    logger.info(f"Idle threshold: {IDLE_THRESHOLD_MINUTES} minutes")
    logger.info(f"Check interval: {CHECK_INTERVAL_SECONDS} seconds")
    logger.info("="*60)

    while True:
        try:
            should_continue = check_and_stop_if_idle()
            if not should_continue:
                logger.info("Instance stop initiated, exiting monitor")
                break

            # Wait before next check
            logger.debug(f"Sleeping for {CHECK_INTERVAL_SECONDS} seconds...")
            time.sleep(CHECK_INTERVAL_SECONDS)

        except KeyboardInterrupt:
            logger.info("Received interrupt signal, shutting down gracefully...")
            break
        except Exception as e:
            logger.error(f"Unexpected error in main loop: {e}", exc_info=True)
            time.sleep(CHECK_INTERVAL_SECONDS)


if __name__ == '__main__':
    main()
