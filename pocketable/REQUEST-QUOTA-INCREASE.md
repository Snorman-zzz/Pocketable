# AWS Quota Increase Request Guide

## Issue
Your AWS account is restricted to Free Tier eligible instances only, preventing deployment of t3.xlarge (required for Daytona).

**Error:** `The specified instance type is not eligible for Free Tier`

## What You Need

**Instance Type:** t3.xlarge (4 vCPU, 16GB RAM)
**Current Quota:** 16 vCPUs (sufficient)
**Issue:** Instance type restriction, not vCPU quota

## Option 1: Request via AWS Console (Recommended)

### Step 1: Open Service Quotas

```bash
open "https://us-east-1.console.aws.amazon.com/servicequotas/home/services/ec2/quotas"
```

Or manually navigate to:
- AWS Console → Service Quotas → AWS Services → Amazon Elastic Compute Cloud (Amazon EC2)

### Step 2: Request Quota Increase

1. Search for: **"Running On-Demand Standard (A, C, D, H, I, M, R, T, Z) instances"**
2. Click the quota name
3. Click **"Request quota increase"** button
4. **New quota value:** Enter `32` (double your current 16 vCPUs)
5. Click **"Request"**

### Step 3: Fill Out the Request

**Use case description:**
```
I need to deploy a development environment for a mobile application backend that requires running self-hosted Daytona (a development sandbox platform similar to GitHub Codespaces).

Technical Requirements:
- Instance Type: t3.xlarge (4 vCPU, 16GB RAM)
- Purpose: Development environment with Docker containers
- Usage Pattern: Intermittent (40 hours/month with auto-stop after 2 hours idle)
- Cost Optimization: Using stop/start model to minimize costs (~$20/month)

Current Issue:
My account appears restricted to Free Tier instances only. I'm requesting permission to use Standard instance types (specifically t3.xlarge) for this development workload.

Region: us-east-1
Account ID: 422228628693
```

## Option 2: Contact AWS Support Directly

If Service Quotas request doesn't work (common with Educate/Academy accounts):

### Submit a Support Case

```bash
open "https://console.aws.amazon.com/support/home#/case/create"
```

**Case Details:**
- **Service:** Service limit increase
- **Category:** EC2 Instances
- **Severity:** Normal
- **Subject:** Request to enable Standard instance types (t3.xlarge)
- **Description:** Use the text above from "Use case description"

**Attachments:** Include this request document

## Option 3: Check Account Type

Your account might be AWS Educate or AWS Academy, which have permanent restrictions. Check:

```bash
# Check if this is an Educate account
aws organizations describe-organization 2>&1
```

If it's an Educate/Academy account, you may need to:
1. **Upgrade to a regular AWS account** (requires credit card)
2. **Create a new standard AWS account** (easiest solution)
3. **Work with your organization's AWS administrator**

## Option 4: Workaround - Deploy to Regular AWS Account

If you have access to another AWS account:

1. Create a new standard AWS account at https://aws.amazon.com
2. Add your credit card (required for Standard instances)
3. Configure new credentials:
   ```bash
   aws configure --profile production
   ```
4. Update Terraform to use new profile:
   ```bash
   export AWS_PROFILE=production
   cd terraform/environments/daytona-dev
   terraform apply
   ```

## Expected Timeline

- **Service Quotas request:** Usually approved within 24-48 hours
- **Support case:** May take 1-3 business days
- **Account upgrade:** Immediate (if you create new account)

## Alternative: Use Smaller Instance (Not Recommended)

While Daytona requires t3.xlarge minimum, you could try:

**t3.large** (2 vCPU, 8GB RAM) - May work but:
- ⚠️ Performance issues likely
- ⚠️ Docker containers may crash
- ⚠️ Sandbox builds will be slow
- **Cost:** ~$65/month always-on or ~$10/month stop/start model

Would only recommend for light testing.

## Verification After Approval

Once approved, verify you can create t3.xlarge:

```bash
aws ec2 run-instances \
  --image-id ami-07a3add10195338ad \
  --instance-type t3.xlarge \
  --key-name equity-calculator-key \
  --dry-run
```

If successful, proceed with Terraform deployment:

```bash
cd /Users/yuan/Documents/project/pocketable/terraform/environments/daytona-dev
terraform apply
```

## Need Help?

If you encounter issues:
1. Check AWS Account Settings → Account → Account Type
2. Verify billing information is up to date
3. Check for any service control policies (Organizations)
4. Contact your AWS administrator if using organizational account

---

**Current Status:** Waiting for quota increase approval
**Next Step:** Submit request via AWS Console (Option 1 above)
