#!/bin/bash
# Enterprise Lite - App Runner Docker Deployment Script
# Run with: ./scripts/deploy-apprunner.sh

set -e

# ===== Configuration =====
AWS_REGION="${AWS_REGION:-ap-southeast-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-180920475106}"
ECR_REPO_NAME="${ECR_REPO_NAME:-enterprise-lite-platform}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
APP_RUNNER_SERVICE="${APP_RUNNER_SERVICE:-enterprise-lite-platform}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Enterprise Lite - App Runner Deployment${NC}"
echo "============================================"
echo "Region: $AWS_REGION"
echo "Account: $AWS_ACCOUNT_ID"
echo "ECR Repo: $ECR_REPO_NAME"
echo "Image Tag: $IMAGE_TAG"
echo ""

# ===== Step 1: Check AWS CLI =====
echo -e "${YELLOW}Step 1: Checking AWS CLI...${NC}"
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ AWS CLI not installed. Please install it first.${NC}"
    exit 1
fi

# Check if logged in
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${YELLOW}⚠️  Not logged in. Running 'aws sso login'...${NC}"
    aws sso login --profile sunway-dev || aws sso login
fi
echo -e "${GREEN}✅ AWS CLI configured${NC}"

# ===== Step 2: Create ECR Repository (if not exists) =====
echo -e "${YELLOW}Step 2: Setting up ECR repository...${NC}"
aws ecr describe-repositories --repository-names $ECR_REPO_NAME --region $AWS_REGION 2>/dev/null || \
    aws ecr create-repository \
        --repository-name $ECR_REPO_NAME \
        --region $AWS_REGION \
        --image-scanning-configuration scanOnPush=true \
        --encryption-configuration encryptionType=AES256
echo -e "${GREEN}✅ ECR repository ready${NC}"

# ===== Step 3: Login to ECR =====
echo -e "${YELLOW}Step 3: Logging into ECR...${NC}"
aws ecr get-login-password --region $AWS_REGION | \
    docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
echo -e "${GREEN}✅ ECR login successful${NC}"

# ===== Step 4: Build Docker Image (AMD64 for App Runner) =====
echo -e "${YELLOW}Step 4: Building Docker image for linux/amd64...${NC}"
echo "⏳ This may take a few minutes..."

# Check if running on ARM (M1/M2 Mac)
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    echo -e "${YELLOW}📍 Detected ARM architecture (M1/M2 Mac)${NC}"
    echo "   Building for linux/amd64 using Docker buildx..."
    
    # Ensure buildx is available
    docker buildx create --name amd64builder --use 2>/dev/null || docker buildx use amd64builder
    
    # Build for AMD64
    docker buildx build \
        --platform linux/amd64 \
        --tag $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO_NAME:$IMAGE_TAG \
        --push \
        .
else
    # Native AMD64 build
    docker build \
        --platform linux/amd64 \
        --tag $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO_NAME:$IMAGE_TAG \
        .
    
    # Push to ECR
    echo -e "${YELLOW}Step 5: Pushing to ECR...${NC}"
    docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO_NAME:$IMAGE_TAG
fi

echo -e "${GREEN}✅ Image pushed to ECR${NC}"

# ===== Step 6: Check/Create App Runner Service =====
echo -e "${YELLOW}Step 6: Deploying to App Runner...${NC}"

ECR_IMAGE_URI="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO_NAME:$IMAGE_TAG"

# Check if service exists
SERVICE_ARN=$(aws apprunner list-services --region $AWS_REGION \
    --query "ServiceSummaryList[?ServiceName=='$APP_RUNNER_SERVICE'].ServiceArn" \
    --output text 2>/dev/null || echo "")

if [ -z "$SERVICE_ARN" ] || [ "$SERVICE_ARN" = "None" ]; then
    echo -e "${YELLOW}Creating new App Runner service...${NC}"
    echo ""
    echo -e "${RED}⚠️  IMPORTANT: Complete these steps in AWS Console:${NC}"
    echo ""
    echo "1. Go to: https://console.aws.amazon.com/apprunner"
    echo "2. Click 'Create service'"
    echo "3. Source: Container registry → Amazon ECR"
    echo "4. Image URI: $ECR_IMAGE_URI"
    echo "5. ECR access role: Create new or use existing"
    echo "6. Deployment: Automatic (for CI/CD) or Manual"
    echo "7. Service name: $APP_RUNNER_SERVICE"
    echo "8. CPU: 2 vCPU, Memory: 4 GB"
    echo "9. Port: 3000"
    echo "10. Instance role: EnterpriseLiteAppRunnerRole"
    echo ""
    echo "11. Add Environment Variables:"
    echo "    STORAGE_BACKEND = s3"
    echo "    S3_BUCKET = enterprise-lite-documents"
    echo "    S3_RAW_BUCKET = enterprise-lite-raw"
    echo "    S3_REGION = ap-southeast-1"
    echo "    COGNITO_USER_POOL_ID = ap-southeast-1_YGNYEoPCa"
    echo "    COGNITO_CLIENT_ID = 6lrbtia7o8edmdquge1g0c0pai"
    echo "    ANTHROPIC_API_KEY = (secret)"
    echo "    STRIPE_SECRET_KEY = (secret)"
    echo ""
else
    echo "Triggering deployment for existing service..."
    aws apprunner start-deployment \
        --service-arn $SERVICE_ARN \
        --region $AWS_REGION
    echo -e "${GREEN}✅ Deployment triggered!${NC}"
    echo ""
    echo "Monitor progress:"
    echo "  aws apprunner describe-service --service-arn $SERVICE_ARN --region $AWS_REGION"
fi

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}🎉 Docker image ready in ECR!${NC}"
echo ""
echo "Image URI:"
echo "  $ECR_IMAGE_URI"
echo ""




