import json
import boto3
import time
import os
import logging
from urllib.request import urlopen, Request
from urllib.error import URLError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

ec2 = boto3.client('ec2')
ssm = boto3.client('ssm')

INSTANCE_ID = os.environ['INSTANCE_ID']
DAYTONA_API_URL = os.environ['DAYTONA_API_URL']
BACKEND_URL = os.environ.get('BACKEND_URL', '')  # Optional: backend may not run on Daytona instance
MAX_WAIT_SECONDS = int(os.environ.get('MAX_WAIT_SECONDS', '180'))

def lambda_handler(event, context):
    """
    Lambda function to start a stopped EC2 instance and wait for services to be ready.

    Returns:
        - 200: Instance already running or successfully started
        - 500: Error occurred
    """

    logger.info(f"Checking status of instance {INSTANCE_ID}")

    try:
        # Get instance status
        response = ec2.describe_instances(InstanceIds=[INSTANCE_ID])
        instance = response['Reservations'][0]['Instances'][0]
        current_state = instance['State']['Name']

        logger.info(f"Instance current state: {current_state}")

        # If already running, check if services are ready
        if current_state == 'running':
            logger.info("Instance already running, checking services...")
            if check_services_ready():
                return {
                    'statusCode': 200,
                    'body': json.dumps({
                        'status': 'ready',
                        'message': 'Instance already running and services are ready',
                        'daytona_api_url': DAYTONA_API_URL,
                        'backend_url': BACKEND_URL
                    })
                }
            else:
                # Services not ready - try to start Docker containers
                logger.info("Services not ready, attempting to start Docker containers...")
                if start_docker_containers():
                    # Wait for services to come up
                    logger.info("Docker containers started, waiting for services...")
                    start_time = time.time()
                    while time.time() - start_time < MAX_WAIT_SECONDS:
                        if check_services_ready():
                            elapsed = int(time.time() - start_time)
                            logger.info(f"Services ready after {elapsed} seconds")
                            return {
                                'statusCode': 200,
                                'body': json.dumps({
                                    'status': 'ready',
                                    'message': f'Docker containers started and services ready after {elapsed}s',
                                    'daytona_api_url': DAYTONA_API_URL,
                                    'backend_url': BACKEND_URL,
                                    'startup_time_seconds': elapsed
                                })
                            }
                        logger.info("Services not ready yet, waiting 5 seconds...")
                        time.sleep(5)

                return {
                    'statusCode': 200,
                    'body': json.dumps({
                        'status': 'starting',
                        'message': 'Instance running but services not ready yet',
                        'wait_seconds': 30
                    })
                }

        # If stopped, start it
        if current_state == 'stopped':
            logger.info(f"Starting instance {INSTANCE_ID}")
            ec2.start_instances(InstanceIds=[INSTANCE_ID])

            # Wait for instance to be running
            logger.info("Waiting for instance to reach 'running' state...")
            waiter = ec2.get_waiter('instance_running')
            waiter.wait(InstanceIds=[INSTANCE_ID])

            logger.info("Instance is now running, waiting for services to be ready...")

            # Wait for services to be ready
            start_time = time.time()
            while time.time() - start_time < MAX_WAIT_SECONDS:
                if check_services_ready():
                    elapsed = int(time.time() - start_time)
                    logger.info(f"Services ready after {elapsed} seconds")
                    return {
                        'statusCode': 200,
                        'body': json.dumps({
                            'status': 'ready',
                            'message': f'Instance started and services ready after {elapsed}s',
                            'daytona_api_url': DAYTONA_API_URL,
                            'backend_url': BACKEND_URL,
                            'startup_time_seconds': elapsed
                        })
                    }

                logger.info("Services not ready yet, waiting 5 seconds...")
                time.sleep(5)

            # Timeout - services didn't come up in time
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'status': 'starting',
                    'message': 'Instance started but services still initializing',
                    'wait_seconds': 30
                })
            }

        # If in any other state (pending, stopping, etc.)
        return {
            'statusCode': 200,
            'body': json.dumps({
                'status': 'transitioning',
                'message': f'Instance is {current_state}, please wait',
                'current_state': current_state,
                'wait_seconds': 30
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

def check_services_ready():
    """
    Check if Daytona API (and optionally Backend) are responding.

    Returns:
        bool: True if all configured services are ready
    """
    # Check Daytona API
    try:
        req = Request(DAYTONA_API_URL, headers={'User-Agent': 'Lambda-Health-Check'})
        response = urlopen(req, timeout=5)
        if response.status != 200:
            logger.info(f"Daytona API returned status {response.status}")
            return False
    except (URLError, Exception) as e:
        logger.info(f"Daytona API not ready: {str(e)}")
        return False

    # Check Backend API if configured
    if BACKEND_URL:
        try:
            backend_health = BACKEND_URL.rstrip('/') + '/health'
            req = Request(backend_health, headers={'User-Agent': 'Lambda-Health-Check'})
            response = urlopen(req, timeout=5)
            if response.status != 200:
                logger.info(f"Backend API returned status {response.status}")
                return False
            logger.info("Both Daytona and Backend services are ready")
        except (URLError, Exception) as e:
            logger.info(f"Backend API not ready: {str(e)}")
            return False
    else:
        logger.info("Daytona API is ready (backend check skipped)")

    return True

def start_docker_containers():
    """
    Start Daytona Docker containers using AWS Systems Manager Run Command.

    Returns:
        bool: True if command was sent successfully
    """
    try:
        logger.info(f"Sending SSM command to start Docker containers on {INSTANCE_ID}")

        response = ssm.send_command(
            InstanceIds=[INSTANCE_ID],
            DocumentName='AWS-RunShellScript',
            Parameters={
                'commands': [
                    'cd /home/ubuntu/daytona',
                    'sudo docker compose up -d'
                ]
            },
            TimeoutSeconds=120
        )

        command_id = response['Command']['CommandId']
        logger.info(f"SSM command sent: {command_id}")

        # Wait a few seconds for command to execute
        time.sleep(10)

        # Check command status
        try:
            result = ssm.get_command_invocation(
                CommandId=command_id,
                InstanceId=INSTANCE_ID
            )
            status = result['Status']
            logger.info(f"SSM command status: {status}")

            if status in ['Success', 'InProgress']:
                return True
            else:
                logger.warning(f"SSM command failed with status: {status}")
                logger.warning(f"Output: {result.get('StandardOutputContent', 'N/A')}")
                logger.warning(f"Error: {result.get('StandardErrorContent', 'N/A')}")
                return False
        except Exception as e:
            # Command might still be running
            logger.info(f"Could not get command status (might still be running): {str(e)}")
            return True

    except Exception as e:
        logger.error(f"Failed to start Docker containers via SSM: {str(e)}", exc_info=True)
        return False
