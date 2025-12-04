# Enterprise Lite - AWS Infrastructure

## Architecture Overview

Enterprise Lite supports two deployment modes:

### Mode 1: Shared Infrastructure (Default)
- Single AWS account for all tenants
- Shared S3 buckets with tenant prefixes
- Cost tracking via S3 object tags

### Mode 2: Multi-Account (Landing Zone)
- Each customer gets their own AWS account
- Dedicated S3 buckets per customer
- True resource isolation
- AWS Account Factory for provisioning

---

## 🚀 App Runner Deployment

### Quick Start

```bash
# 1. Create IAM role for App Runner
aws iam create-role \
  --role-name EnterpriseLiteAppRunnerRole \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "tasks.apprunner.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'

# 2. Attach the policy
aws iam put-role-policy \
  --role-name EnterpriseLiteAppRunnerRole \
  --policy-name EnterpriseLiteAccess \
  --policy-document file://infrastructure/apprunner-iam-policy.json

# 3. Create App Runner service (via Console is easier for secrets)
```

### Deploy via AWS Console

1. Go to **AWS App Runner** → **Create service**
2. **Source**: Choose "Source code repository"
3. **Connect**: Link your GitHub/GitLab repo
4. **Build settings**: Use `apprunner.yaml`
5. **Service settings**:
   - Port: `3000`
   - Instance role: `EnterpriseLiteAppRunnerRole`
6. **Environment variables** (add as secrets):
   ```
   ANTHROPIC_API_KEY = sk-ant-xxx...
   STRIPE_SECRET_KEY = sk_test_xxx...
   STRIPE_WEBHOOK_SECRET = whsec_xxx...
   COGNITO_USER_POOL_ID = ap-southeast-1_YGNYEoPCa
   COGNITO_CLIENT_ID = 6lrbtia7o8edmdquge1g0c0pai
   ```
7. Click **Create & deploy**

### Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `STORAGE_BACKEND` | ✅ | Set to `s3` |
| `S3_BUCKET` | ✅ | Processed documents bucket |
| `S3_RAW_BUCKET` | ✅ | Raw uploads bucket |
| `S3_REGION` | ✅ | e.g., `ap-southeast-1` |
| `ANTHROPIC_API_KEY` | ✅ | Claude API key |
| `COGNITO_USER_POOL_ID` | ✅ | Cognito pool ID |
| `COGNITO_CLIENT_ID` | ✅ | Cognito app client ID |
| `STRIPE_SECRET_KEY` | ⚠️ | For billing (optional for MVP) |
| `PER_TENANT_BUCKETS` | ⚠️ | Set `true` for per-customer S3 |
| `BUCKET_PREFIX` | ⚠️ | Prefix for tenant buckets |

### Post-Deployment Checklist

- [ ] Verify health: `curl https://your-app.ap-southeast-1.awsapprunner.com/`
- [ ] Test upload: Upload a document via Sales AI
- [ ] Test chat: Ask a question about uploaded docs
- [ ] Check S3: Verify files in buckets
- [ ] Check logs: CloudWatch → App Runner logs
- [ ] Configure custom domain (optional)
- [ ] Set up Stripe webhook endpoint

---

## 🐳 Docker Deployment (Recommended)

### One-Command Deploy

```bash
# From project root
./scripts/deploy-apprunner.sh
```

### Manual Steps

#### 1. Build Docker Image (for AMD64)

**⚠️ IMPORTANT: App Runner requires linux/amd64 images!**

```bash
# On M1/M2 Mac (ARM) - MUST use buildx
docker buildx build \
  --platform linux/amd64 \
  --tag 180920475106.dkr.ecr.ap-southeast-1.amazonaws.com/enterprise-lite-platform:latest \
  --push \
  .

# On Intel Mac/Linux (AMD64) - regular build works
docker build \
  --platform linux/amd64 \
  --tag 180920475106.dkr.ecr.ap-southeast-1.amazonaws.com/enterprise-lite-platform:latest \
  .
```

#### 2. Push to ECR

```bash
# Login to ECR
aws ecr get-login-password --region ap-southeast-1 | \
  docker login --username AWS --password-stdin 180920475106.dkr.ecr.ap-southeast-1.amazonaws.com

# Create repo (first time only)
aws ecr create-repository \
  --repository-name enterprise-lite-platform \
  --region ap-southeast-1

# Push
docker push 180920475106.dkr.ecr.ap-southeast-1.amazonaws.com/enterprise-lite-platform:latest
```

#### 3. Create App Runner Service (Console)

1. Go to **App Runner** → **Create service**
2. Source: **Container registry** → **Amazon ECR**
3. Image URI: `180920475106.dkr.ecr.ap-southeast-1.amazonaws.com/enterprise-lite-platform:latest`
4. Deployment trigger: **Automatic** (optional)
5. ECR access role: Create new service role
6. **Service settings**:
   - CPU: **2 vCPU**
   - Memory: **4 GB**
   - Port: **3000**
   - Instance role: `EnterpriseLiteAppRunnerRole`
7. Add environment variables (see table above)
8. Click **Create & deploy**

### Test Local Docker Build

```bash
# Build locally
docker build -t enterprise-lite-local .

# Run locally (create .env file first)
docker run -p 3000:3000 --env-file .env enterprise-lite-local

# Test
curl http://localhost:3000/health
```

---

## Existing Resources (Your Setup)

### DynamoDB Tables (ap-southeast-1)
| Table | Partition Key | Sort Key |
|-------|--------------|----------|
| Companies | tenantId | companyId |
| Personas | tenantId | personaId |
| PersonasConfig | tenantId | personaId |
| Transcripts | tenantId | conversationId |
| Analytics | tenantId | eventId |
| LinkTracking | linkId | - |

### S3 Buckets
- `enterprise-lite-dev-raw` - Raw uploads
- `enterprise-lite-dev-processed` - Processed documents

### Cognito
- User Pool: `ap-southeast-1_YGNYEoPCa`
- Client ID: `6lrbtia7o8edmdquge1g0c0pai`

---

## Multi-Account Setup (Landing Zone)

### Prerequisites
1. AWS Control Tower set up and running
2. Account Factory enabled in Service Catalog
3. Platform account in the Shared Services OU

### Step 1: Get Account Factory Product ID

```bash
aws servicecatalog search-products \
  --filters FullTextSearch="AWS Control Tower Account Factory" \
  --profile sunway-dev \
  --region ap-southeast-1
```

### Step 2: Configure Environment Variables

Add to your `.env`:

```bash
# Multi-Account Configuration
MULTI_ACCOUNT_ENABLED=true
ACCOUNT_FACTORY_PRODUCT_ID=prod-xxxxxxxxx
CUSTOMER_OU_ID=ou-xxxx-xxxxxxxx
PLATFORM_ACCOUNT_ID=180920475106
CROSS_ACCOUNT_ROLE_NAME=EnterpriseLitePlatformRole
BUCKET_PREFIX=enterprise-lite

# SSO Admin for new accounts
SSO_ADMIN_EMAIL=admin@yourcompany.com
SSO_ADMIN_FIRST_NAME=Platform
SSO_ADMIN_LAST_NAME=Admin
```

### Step 3: Deploy Customer Account Baseline

The baseline template (`customer-account-baseline.yaml`) should be:

**Option A: Deploy via StackSets** (Recommended)
```bash
aws cloudformation create-stack-set \
  --stack-set-name enterprise-lite-customer-baseline \
  --template-body file://infrastructure/customer-account-baseline.yaml \
  --permission-model SERVICE_MANAGED \
  --auto-deployment Enabled=true,RetainStacksOnAccountRemoval=true \
  --profile sunway-dev
```

**Option B: Account Factory Customizations**
Add as a customization blueprint in Account Factory.

### Step 4: Provision a Customer Account

```javascript
import accountFactory from './src/services/account-factory.js';

// Provision new account
const result = await accountFactory.provisionCustomerAccount({
  tenantId: 'acme-corp',
  companyName: 'Acme Corporation',
  email: 'aws+acme-corp@yourcompany.com', // Must be unique
  adminEmail: 'admin@acme-corp.com'
});

// Check status (takes 20-30 minutes)
const status = await accountFactory.getProvisioningStatus(result.provisionedProductId);
```

### Step 5: Initialize Customer Account

After provisioning completes:

```javascript
// Get the new account ID
const accountId = await accountFactory.getAccountIdFromProduct(result.provisionedProductId);

// Initialize (creates S3 buckets, etc.)
await accountFactory.initializeCustomerAccount(accountId, 'acme-corp', 'Acme Corporation');

// Register for cross-account access
import { registerTenantAccount } from './src/storage/index.js';

registerTenantAccount('acme-corp', {
  accountId: accountId,
  region: 'ap-southeast-1'
});
```

---

## API Usage

### Using Cross-Account Storage

```javascript
import { getStorageForTenant, tenantHasDedicatedAccount } from './src/storage/index.js';

// Automatically uses cross-account or shared based on tenant config
const storage = getStorageForTenant('acme-corp');

// Save file
await storage.save('documents/file.pdf', buffer, {
  contentType: 'application/pdf'
});

// Read file
const data = await storage.read('documents/file.pdf');

// Check if tenant has dedicated account
if (tenantHasDedicatedAccount('acme-corp')) {
  console.log('Using dedicated AWS account');
}
```

---

## Cost Allocation

### Shared Mode
- S3 objects tagged with `tenant-id`
- Use S3 Storage Lens or Cost Explorer with tags

### Multi-Account Mode
- Each account appears separately in consolidated billing
- Use AWS Organizations Cost Explorer
- Perfect cost attribution per customer

---

## Security

### IAM Role Trust Policy

The `EnterpriseLitePlatformRole` in customer accounts trusts your platform account:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "AWS": "arn:aws:iam::PLATFORM_ACCOUNT_ID:root"
    },
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": {
        "sts:ExternalId": "TENANT_ID"
      }
    }
  }]
}
```

### Permissions Granted
- S3: Full access to customer buckets only
- CloudWatch Logs: Write to customer log groups

---

## Cleanup / Offboarding

### Terminate Customer Account

```javascript
// WARNING: This is destructive!
await accountFactory.terminateCustomerAccount(provisionedProductId, 'acme-corp');
```

This will:
1. Remove the account from the organization
2. Delete all resources in the account
3. Close the AWS account (after 90-day waiting period)

---

## Troubleshooting

### Account Provisioning Stuck
Check Service Catalog provisioned products status:
```bash
aws servicecatalog describe-provisioned-product \
  --id pp-xxxxxxxxx \
  --profile sunway-dev
```

### Cross-Account Access Denied
1. Verify the role exists in customer account
2. Check External ID matches tenant ID
3. Verify platform account ID in trust policy

### S3 Access Issues
1. Check bucket policy allows the cross-account role
2. Verify bucket names match expected format
