import json
import boto3
import logging
import urllib.request
import urllib.error
import os
from datetime import datetime, timedelta

logger = logging.getLogger()
logger.setLevel(logging.INFO)

ec2 = boto3.client('ec2')
cloudwatch = boto3.client('cloudwatch')

def check_daytona_workspaces(instance_public_ip, api_key):
    """
    Check Daytona API for active workspaces.

    Returns:
        tuple: (active_count, total_count, workspace_states)
    """
    try:
        url = f"http://{instance_public_ip}:3000/api/workspace"
        req = urllib.request.Request(url)
        req.add_header('Authorization', f'Bearer {api_key}')

        with urllib.request.urlopen(req, timeout=10) as response:
            workspaces = json.loads(response.read().decode())

        active_workspaces = [w for w in workspaces if w.get('state') == 'running']
        workspace_states = {w.get('id'): w.get('state') for w in workspaces}

        logger.info(f"Daytona workspaces: {len(workspaces)} total, {len(active_workspaces)} active")
        logger.info(f"Workspace states: {workspace_states}")

        return len(active_workspaces), len(workspaces), workspace_states

    except urllib.error.URLError as e:
        logger.warning(f"Could not reach Daytona API: {e}")
        # If API is unreachable, assume no workspaces (instance might be stopping)
        return 0, 0, {}
    except Exception as e:
        logger.error(f"Error checking Daytona workspaces: {e}")
        # On error, be conservative and assume workspaces exist
        return 1, 1, {'error': str(e)}

def lambda_handler(event, context):
    """
    Lambda function to stop EC2 instance using hybrid approach.

    Stops instance when BOTH conditions are met:
    1. No active Daytona workspaces (state != 'running')
    2. Network traffic < 100 MB in last 30 minutes

    This prevents stopping during actual use while allowing background traffic.

    Returns:
        - 200: Instance stopped or still active
        - 500: Error occurred
    """

    instance_id = event.get('instance_id')
    if not instance_id:
        logger.error("No instance_id provided in event")
        return {
            'statusCode': 400,
            'body': json.dumps({
                'status': 'error',
                'message': 'instance_id is required'
            })
        }

    # Get environment variables
    daytona_api_key = os.environ.get('DAYTONA_API_KEY', '')
    instance_public_ip = os.environ.get('INSTANCE_PUBLIC_IP', '')

    logger.info(f"Checking activity for instance {instance_id}")

    try:
        # Get instance status
        response = ec2.describe_instances(InstanceIds=[instance_id])
        instance = response['Reservations'][0]['Instances'][0]
        current_state = instance['State']['Name']

        logger.info(f"Instance current state: {current_state}")

        # Only check activity if instance is running
        if current_state != 'running':
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'status': 'skipped',
                    'message': f'Instance is {current_state}, not running',
                    'instance_id': instance_id,
                    'current_state': current_state
                })
            }

        # Check NetworkIn metric for last 30 minutes
        end_time = datetime.utcnow()
        start_time = end_time - timedelta(minutes=30)

        response = cloudwatch.get_metric_statistics(
            Namespace='AWS/EC2',
            MetricName='NetworkIn',
            Dimensions=[{'Name': 'InstanceId', 'Value': instance_id}],
            StartTime=start_time,
            EndTime=end_time,
            Period=1800,  # 30 minutes
            Statistics=['Sum']
        )

        # Check if there's network activity
        if not response['Datapoints']:
            logger.info("No network data available, instance likely just started")
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'status': 'active',
                    'message': 'No metrics yet, assuming active',
                    'instance_id': instance_id
                })
            }

        network_bytes = response['Datapoints'][0]['Sum']
        network_mb = network_bytes / (1024 * 1024)  # Convert to MB
        logger.info(f"Network traffic in last 30 min: {network_bytes} bytes ({network_mb:.2f} MB)")

        # Check Daytona workspaces if API credentials are available
        active_workspaces = 0
        total_workspaces = 0
        workspace_states = {}

        if daytona_api_key and instance_public_ip:
            active_workspaces, total_workspaces, workspace_states = check_daytona_workspaces(
                instance_public_ip,
                daytona_api_key
            )
        else:
            logger.warning("Daytona API credentials not configured, skipping workspace check")

        # Hybrid approach: Stop only if BOTH conditions are met
        # 1. No active workspaces
        # 2. Network traffic < 100 MB
        should_stop = active_workspaces == 0 and network_mb < 100

        if should_stop:
            logger.info(
                f"Instance idle - stopping {instance_id}. "
                f"Active workspaces: {active_workspaces}, Network: {network_mb:.2f} MB"
            )
            ec2.stop_instances(InstanceIds=[instance_id])

            return {
                'statusCode': 200,
                'body': json.dumps({
                    'status': 'stopped',
                    'message': 'Instance stopped due to inactivity',
                    'instance_id': instance_id,
                    'network_mb': round(network_mb, 2),
                    'network_threshold_mb': 100,
                    'active_workspaces': active_workspaces,
                    'total_workspaces': total_workspaces,
                    'workspace_states': workspace_states
                })
            }

        # Instance still active - log reason
        reason = []
        if active_workspaces > 0:
            reason.append(f"{active_workspaces} active workspace(s)")
        if network_mb >= 100:
            reason.append(f"high network traffic ({network_mb:.2f} MB)")

        reason_str = " and ".join(reason) if reason else "unknown"
        logger.info(f"Instance active: {reason_str}")

        return {
            'statusCode': 200,
            'body': json.dumps({
                'status': 'active',
                'message': f'Instance still active: {reason_str}',
                'instance_id': instance_id,
                'network_mb': round(network_mb, 2),
                'active_workspaces': active_workspaces,
                'total_workspaces': total_workspaces,
                'workspace_states': workspace_states
            })
        }

    except Exception as e:
        logger.error(f"Error: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'body': json.dumps({
                'status': 'error',
                'message': str(e)
            })
        }
