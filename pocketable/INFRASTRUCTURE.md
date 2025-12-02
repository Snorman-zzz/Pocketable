# Infrastructure Strategy

## Overview

Pocketable uses a phased infrastructure approach to optimize costs while scaling:

1. **Development**: Self-hosted t3.medium with auto-stop ($11/month)
2. **Production (0-50 users)**: Daytona Cloud SDK ($0-75/month)
3. **Scale (50+ users)**: Self-hosted t3.2xlarge+ ($240+/month)

## Environment Switching

### Quick Switch

```bash
# Development: Self-hosted
cd backend
./switch-env.sh selfhosted
npm run dev

# Production: Daytona Cloud SDK
./switch-env.sh cloudsdk
npm run dev
```

### Manual Switch

```bash
# Use self-hosted
cp .env.selfhosted .env

# Use Daytona Cloud SDK
cp .env.cloudsdk .env
```

### Environment Comparison

| Aspect | Self-Hosted | Daytona Cloud SDK |
|--------|-------------|-------------------|
| **Infrastructure** | Your AWS EC2 | Daytona Cloud |
| **Timeout** | 600s (configurable) | 180s (fixed) |
| **Concurrent Sandboxes** | Unlimited (RAM-limited) | 10 (Free), 50-100 (Pro) |
| **Complex Generations** | ✅ Works | ⚠️ May timeout |
| **Cost Control** | Full control | Predictable pricing |

## Phase 1: Development (Current)

### Infrastructure Setup

**EC2 Instance: t3.medium**
- vCPU: 2
- RAM: 4 GB
- Cost: $30/month (always-on) or $11/month (auto-stop)

**Auto-Stop Configuration** (saves $19/month):

1. **Create Lambda Function** (Start EC2):
```python
# lambda_start_ec2.py
import boto3

def lambda_handler(event, context):
    ec2 = boto3.client('ec2', region_name='us-east-1')
    instance_id = 'i-xxxxx'  # Your instance ID

    # Check if stopped
    response = ec2.describe_instances(InstanceIds=[instance_id])
    state = response['Reservations'][0]['Instances'][0]['State']['Name']

    if state == 'stopped':
        ec2.start_instances(InstanceIds=[instance_id])
        return {'statusCode': 200, 'body': 'Instance starting'}

    return {'statusCode': 200, 'body': 'Instance already running'}
```

2. **Create Lambda Function** (Stop EC2 on idle):
```python
# lambda_stop_ec2.py
import boto3
from datetime import datetime, timedelta

def lambda_handler(event, context):
    ec2 = boto3.client('ec2', region_name='us-east-1')
    cloudwatch = boto3.client('cloudwatch', region_name='us-east-1')
    instance_id = 'i-xxxxx'  # Your instance ID

    # Check NetworkIn metric for last 30 minutes
    response = cloudwatch.get_metric_statistics(
        Namespace='AWS/EC2',
        MetricName='NetworkIn',
        Dimensions=[{'Name': 'InstanceId', 'Value': instance_id}],
        StartTime=datetime.utcnow() - timedelta(minutes=30),
        EndTime=datetime.utcnow(),
        Period=1800,
        Statistics=['Sum']
    )

    # If no network activity, stop instance
    if not response['Datapoints'] or response['Datapoints'][0]['Sum'] < 1000:
        ec2.stop_instances(InstanceIds=[instance_id])
        return {'statusCode': 200, 'body': 'Instance stopped due to inactivity'}

    return {'statusCode': 200, 'body': 'Instance active'}
```

3. **CloudWatch Events Rule**:
- Schedule: `rate(5 minutes)`
- Target: Lambda function (lambda_stop_ec2)

**Note**: Auto-stop is optional. Saves money during development but adds ~90s cold start delay.

### Usage

```bash
# Use self-hosted for development
./switch-env.sh selfhosted
npm run dev
```

**Benefits**:
- Unlimited sandboxes
- 600s timeout (complex generations work)
- Learn infrastructure
- Same environment as future production (Phase 3)

**Cost**: $11/month (auto-stop) or $30/month (always-on)

## Phase 2: Production Launch (0-50 Users)

### Switch to Daytona Cloud SDK

```bash
./switch-env.sh cloudsdk
npm run dev
```

### Pricing Tiers

**Free Tier** (0-20 users):
- Cost: $0/month
- Concurrent sandboxes: 10
- Best for: MVP launch, beta testing

**Pro Tier** (20-50 users):
- Cost: ~$75/month
- Concurrent sandboxes: 50-100
- Best for: Early growth

### Known Limitation: 180s Timeout

**What happens**:
- Simple prompts (30-60s): ✅ Work perfectly
- Medium complexity (90-150s): ✅ Usually complete
- Complex prompts (180s+): ❌ Gateway timeout

**User experience**:
```
User: "Build an e-commerce app with cart, checkout, and payment"
Result: "Generation failed"
User action: Retries with simpler prompt OR breaks into steps
```

**This is acceptable** because:
- $0-75/month vs $240/month self-hosted
- You have no revenue yet to justify infrastructure costs
- Users can work around timeouts by simplifying prompts

### Switching Back

Keep self-hosted EC2 running (t3.medium, auto-stop, $11/month) as:
- Backup for development
- Testing environment
- Quick rollback if Daytona Cloud has issues

## Phase 3: Scale (50+ Users)

### When to Switch

**Signals**:
- Consistently hitting 50-100 concurrent sandboxes on Daytona Pro
- User complaints about generation timeouts increasing
- Revenue justifies $240/month infrastructure cost

**Financial threshold**:
- At 50 users, you likely have $500-5000/month revenue
- $240/month infrastructure = 5-48% of revenue (acceptable)

### Switch Back to Self-Hosted

```bash
./switch-env.sh selfhosted
npm run dev
```

### Infrastructure Upgrade Path

**50-100 users**: t3.2xlarge ($240/month)
- vCPU: 8
- RAM: 32 GB
- Concurrent generations: 15-25
- Always-on (no auto-stop)

**100-200 users**: Multi-instance with Auto-Scaling
- 2× t3.xlarge ($240/month)
- Application Load Balancer ($16/month)
- Total: $256/month
- Concurrent generations: 30-50

**200+ users**: Scale horizontally
- 3-5× t3.xlarge ($360-600/month)
- Auto-scaling based on RAM usage
- CloudWatch alarms for capacity planning

### Architecture Changes for Multi-Instance

**Current** (single instance):
```
Mobile ← Backend (single EC2) → Daytona Server
```

**Multi-instance** (50+ users):
```
Mobile ← ALB ← Backend 1 → Daytona Server 1
            ↓ Backend 2 → Daytona Server 2
            ↓ Backend 3 → Daytona Server 3
```

**Required changes**:
- Each backend instance runs its own Daytona server
- Sticky sessions in ALB (route user to same backend)
- Shared PostgreSQL database (already set up)
- Shared Redis for session state (future)

**Implementation complexity**: Medium (2-3 days with Claude Code)

## Sandbox Cleanup

**Auto-cleanup** (already implemented):
- Every sandbox auto-stops after 1 hour
- `ephemeral: true` triggers auto-deletion on stop
- No manual cleanup needed
- Consistent with project-sdk

```typescript
setTimeout(async () => {
  await daytona.stop(sandbox);
}, 3600000); // 1 hour
```

## Cost Summary

| Phase | Infrastructure | Monthly Cost | Users Supported |
|-------|---------------|--------------|-----------------|
| **Development** | t3.medium (auto-stop) | $11 | 1 (you) |
| **Launch** | Daytona Cloud Free | $0 | 0-20 |
| **Early Growth** | Daytona Cloud Pro | $75 | 20-50 |
| **Scale Start** | t3.2xlarge | $240 | 50-100 |
| **Scale Growth** | Multi-instance | $256-600 | 100-200+ |

## Decision Tree

```
Current usage?
├─ Development only
│  └─ Use: Self-hosted t3.medium ($11/month)
│
├─ 0-20 users
│  └─ Use: Daytona Cloud Free ($0/month)
│
├─ 20-50 users
│  └─ Use: Daytona Cloud Pro ($75/month)
│
└─ 50+ users
   └─ Use: Self-hosted t3.2xlarge+ ($240+/month)
```

## Monitoring & Alerts

### CloudWatch Alarms

**For self-hosted**:
```bash
# High memory usage
aws cloudwatch put-metric-alarm \
  --alarm-name pocketable-high-memory \
  --metric-name MemoryUtilization \
  --namespace AWS/EC2 \
  --statistic Average \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold

# Low CPU credits (t3 burstable)
aws cloudwatch put-metric-alarm \
  --alarm-name pocketable-low-cpu-credits \
  --metric-name CPUCreditBalance \
  --namespace AWS/EC2 \
  --statistic Average \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 50 \
  --comparison-operator LessThanThreshold
```

**For Daytona Cloud**:
- Monitor sandbox usage via Daytona dashboard
- Alert when approaching tier limits (8/10 sandboxes)
- Track generation failure rates

## FAQ

### Q: Why accept timeouts on Daytona Cloud?
**A**: Zero infrastructure cost ($0-75/month) during pre-revenue phase. Users can work around timeouts by simplifying prompts. When you have 50+ paying users, you'll have revenue to justify self-hosting.

### Q: What if I hit 10 sandboxes during development?
**A**: Use your self-hosted t3.medium as fallback (`./switch-env.sh selfhosted`). Clean up old sandboxes weekly.

### Q: Cold starts with auto-stop?
**A**: First request after idle takes ~90s to start EC2. Only affects you during development. Acceptable trade-off for $19/month savings.

### Q: Can I switch environments with active sandboxes?
**A**: Yes, but sandboxes on the old environment will remain until auto-cleanup (1 hour). New operations use the new environment. Switching is seamless.

### Q: Isn't this premature optimization?
**A**: No - this optimizes for cash flow, not performance. You're deferring infrastructure costs until revenue justifies them.

## Quick Reference

```bash
# Switch to self-hosted (development)
./switch-env.sh selfhosted

# Switch to Cloud SDK (production, 0-50 users)
./switch-env.sh cloudsdk

# Check current environment
./switch-env.sh

# Restart backend
npm run dev
```

## Next Steps

1. **Today**: Continue using self-hosted t3.medium for development
2. **Before launch**: Test Daytona Cloud SDK with `./switch-env.sh cloudsdk`
3. **At launch**: Switch to Daytona Cloud Free ($0)
4. **At 20 users**: Upgrade to Daytona Cloud Pro ($75)
5. **At 50 users**: Switch back to self-hosted t3.2xlarge ($240)
