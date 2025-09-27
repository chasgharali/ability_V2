# Deployment Guide - Ability V2

This guide covers deploying the Ability V2 video interview platform to AWS with full accessibility compliance.

## Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   CloudFront    │    │   S3 Bucket     │    │   Route 53      │
│   (CDN)         │◄───┤   (Frontend)    │◄───┤   (DNS)         │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │
         ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   ALB           │    │   ECS/Fargate   │    │   RDS/Atlas     │
│   (Load Balancer)│◄───┤   (Backend)     │◄───┤   (Database)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   ElastiCache   │    │   S3 Bucket     │    │   SES           │
│   (Redis)       │    │   (File Storage)│    │   (Email)       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Prerequisites

- AWS CLI configured with appropriate permissions
- Docker installed locally
- Node.js 18+ and npm
- MongoDB Atlas account or self-hosted MongoDB
- Twilio account with Video API enabled
- Domain name (optional but recommended)

## Environment Variables

### Backend (.env)
```bash
# Server Configuration
NODE_ENV=production
PORT=5000
HOST=0.0.0.0

# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/ability_v2
REDIS_URL=redis://your-elasticache-endpoint:6379

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-min-32-characters
JWT_REFRESH_SECRET=your-super-secret-refresh-key-min-32-characters
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# AWS Configuration
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_REGION=us-east-1
AWS_S3_BUCKET=ability-v2-uploads
AWS_SES_FROM_EMAIL=noreply@yourdomain.com

# Twilio Configuration
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_API_KEY=your-twilio-api-key
TWILIO_API_SECRET=your-twilio-api-secret
TWILIO_VIDEO_SERVICE_SID=your-video-service-sid

# CORS Configuration
CORS_ORIGIN=https://yourdomain.com

# API Base URL
API_BASE_URL=https://api.yourdomain.com
```

### Frontend (.env)
```bash
REACT_APP_API_URL=https://api.yourdomain.com
REACT_APP_SOCKET_URL=https://api.yourdomain.com
REACT_APP_TWILIO_ACCOUNT_SID=your-twilio-account-sid
REACT_APP_TWILIO_API_KEY=your-twilio-api-key
REACT_APP_TWILIO_API_SECRET=your-twilio-api-secret
```

## Step 1: Database Setup

### MongoDB Atlas (Recommended)
1. Create a new cluster on MongoDB Atlas
2. Create a database user with read/write permissions
3. Whitelist your server IP addresses
4. Get the connection string and update `MONGODB_URI`

### Self-hosted MongoDB
1. Launch an EC2 instance with MongoDB
2. Configure security groups for port 27017
3. Set up authentication and SSL
4. Update `MONGODB_URI` with your connection string

## Step 2: Redis Setup (ElastiCache)

```bash
# Create ElastiCache Redis cluster
aws elasticache create-cache-cluster \
  --cache-cluster-id ability-v2-redis \
  --cache-node-type cache.t3.micro \
  --engine redis \
  --num-cache-nodes 1 \
  --security-group-ids sg-your-security-group
```

## Step 3: S3 Buckets Setup

```bash
# Create S3 bucket for file uploads
aws s3 mb s3://ability-v2-uploads
aws s3api put-bucket-cors --bucket ability-v2-uploads --cors-configuration file://cors-config.json

# Create S3 bucket for frontend hosting
aws s3 mb s3://ability-v2-frontend
aws s3 website s3://ability-v2-frontend --index-document index.html --error-document index.html
```

### CORS Configuration (cors-config.json)
```json
{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
      "AllowedOrigins": ["https://yourdomain.com"],
      "MaxAgeSeconds": 3000
    }
  ]
}
```

## Step 4: Backend Deployment (ECS/Fargate)

### 1. Create Dockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY server/package*.json ./
RUN npm ci --only=production

# Copy source code
COPY server/ .

# Create logs directory
RUN mkdir -p logs

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5000/health || exit 1

# Start application
CMD ["npm", "start"]
```

### 2. Build and Push Docker Image
```bash
# Build image
docker build -t ability-v2-backend .

# Tag for ECR
docker tag ability-v2-backend:latest your-account-id.dkr.ecr.us-east-1.amazonaws.com/ability-v2-backend:latest

# Push to ECR
docker push your-account-id.dkr.ecr.us-east-1.amazonaws.com/ability-v2-backend:latest
```

### 3. Create ECS Task Definition
```json
{
  "family": "ability-v2-backend",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::your-account:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::your-account:role/ecsTaskRole",
  "containerDefinitions": [
    {
      "name": "ability-v2-backend",
      "image": "your-account-id.dkr.ecr.us-east-1.amazonaws.com/ability-v2-backend:latest",
      "portMappings": [
        {
          "containerPort": 5000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        }
      ],
      "secrets": [
        {
          "name": "MONGODB_URI",
          "valueFrom": "arn:aws:ssm:us-east-1:your-account:parameter/ability-v2/mongodb-uri"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/ability-v2-backend",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

### 4. Create ECS Service
```bash
aws ecs create-service \
  --cluster your-cluster-name \
  --service-name ability-v2-backend \
  --task-definition ability-v2-backend:1 \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-12345,subnet-67890],securityGroups=[sg-12345],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=arn:aws:elasticloadbalancing:us-east-1:your-account:targetgroup/ability-v2-backend/1234567890123456,containerName=ability-v2-backend,containerPort=5000"
```

## Step 5: Frontend Deployment

### 1. Build Frontend
```bash
cd client
npm install
npm run build
```

### 2. Deploy to S3
```bash
# Sync build files to S3
aws s3 sync build/ s3://ability-v2-frontend --delete

# Set proper permissions
aws s3api put-object-acl --bucket ability-v2-frontend --key index.html --acl public-read
```

### 3. CloudFront Distribution
```bash
# Create CloudFront distribution
aws cloudfront create-distribution --distribution-config file://cloudfront-config.json
```

### CloudFront Configuration (cloudfront-config.json)
```json
{
  "CallerReference": "ability-v2-frontend-2024",
  "Comment": "Ability V2 Frontend Distribution",
  "DefaultRootObject": "index.html",
  "Origins": {
    "Quantity": 1,
    "Items": [
      {
        "Id": "S3-ability-v2-frontend",
        "DomainName": "ability-v2-frontend.s3.amazonaws.com",
        "S3OriginConfig": {
          "OriginAccessIdentity": ""
        }
      }
    ]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "S3-ability-v2-frontend",
    "ViewerProtocolPolicy": "redirect-to-https",
    "TrustedSigners": {
      "Enabled": false,
      "Quantity": 0
    },
    "ForwardedValues": {
      "QueryString": false,
      "Cookies": {
        "Forward": "none"
      }
    },
    "MinTTL": 0,
    "DefaultTTL": 86400,
    "MaxTTL": 31536000
  },
  "Enabled": true,
  "PriceClass": "PriceClass_100"
}
```

## Step 6: Load Balancer Setup

### Application Load Balancer
```bash
# Create ALB
aws elbv2 create-load-balancer \
  --name ability-v2-alb \
  --subnets subnet-12345 subnet-67890 \
  --security-groups sg-12345

# Create target group
aws elbv2 create-target-group \
  --name ability-v2-backend \
  --protocol HTTP \
  --port 5000 \
  --vpc-id vpc-12345 \
  --target-type ip \
  --health-check-path /health

# Create listener
aws elbv2 create-listener \
  --load-balancer-arn arn:aws:elasticloadbalancing:us-east-1:your-account:loadbalancer/app/ability-v2-alb/1234567890123456 \
  --protocol HTTPS \
  --port 443 \
  --certificates CertificateArn=arn:aws:acm:us-east-1:your-account:certificate/12345678-1234-1234-1234-123456789012 \
  --default-actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:us-east-1:your-account:targetgroup/ability-v2-backend/1234567890123456
```

## Step 7: SSL Certificate (ACM)

```bash
# Request SSL certificate
aws acm request-certificate \
  --domain-name yourdomain.com \
  --subject-alternative-names api.yourdomain.com \
  --validation-method DNS
```

## Step 8: DNS Configuration (Route 53)

```bash
# Create hosted zone
aws route53 create-hosted-zone --name yourdomain.com --caller-reference 2024-01-01

# Create A record for frontend
aws route53 change-resource-record-sets --hosted-zone-id Z1234567890 --change-batch file://dns-changes.json
```

### DNS Changes (dns-changes.json)
```json
{
  "Changes": [
    {
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "yourdomain.com",
        "Type": "A",
        "AliasTarget": {
          "DNSName": "d1234567890.cloudfront.net",
          "EvaluateTargetHealth": false,
          "HostedZoneId": "Z2FDTNDATAQYW2"
        }
      }
    },
    {
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "api.yourdomain.com",
        "Type": "A",
        "AliasTarget": {
          "DNSName": "ability-v2-alb-1234567890.us-east-1.elb.amazonaws.com",
          "EvaluateTargetHealth": true,
          "HostedZoneId": "Z35SXDOTRQ7X7K"
        }
      }
    }
  ]
}
```

## Step 9: Security Configuration

### Security Groups
```bash
# ALB Security Group
aws ec2 create-security-group \
  --group-name ability-v2-alb-sg \
  --description "Security group for Ability V2 ALB" \
  --vpc-id vpc-12345

# Allow HTTPS from anywhere
aws ec2 authorize-security-group-ingress \
  --group-id sg-12345 \
  --protocol tcp \
  --port 443 \
  --cidr 0.0.0.0/0

# ECS Security Group
aws ec2 create-security-group \
  --group-name ability-v2-ecs-sg \
  --description "Security group for Ability V2 ECS tasks" \
  --vpc-id vpc-12345

# Allow HTTP from ALB
aws ec2 authorize-security-group-ingress \
  --group-id sg-67890 \
  --protocol tcp \
  --port 5000 \
  --source-group sg-12345
```

### IAM Roles
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::ability-v2-uploads/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ses:SendEmail",
        "ses:SendRawEmail"
      ],
      "Resource": "*"
    }
  ]
}
```

## Step 10: Monitoring and Logging

### CloudWatch Logs
```bash
# Create log group
aws logs create-log-group --log-group-name /ecs/ability-v2-backend

# Set retention policy
aws logs put-retention-policy \
  --log-group-name /ecs/ability-v2-backend \
  --retention-in-days 30
```

### CloudWatch Alarms
```bash
# CPU utilization alarm
aws cloudwatch put-metric-alarm \
  --alarm-name "ability-v2-high-cpu" \
  --alarm-description "High CPU utilization" \
  --metric-name CPUUtilization \
  --namespace AWS/ECS \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2
```

## Step 11: CI/CD Pipeline (GitHub Actions)

### .github/workflows/deploy.yml
```yaml
name: Deploy to AWS

on:
  push:
    branches: [main]

jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      
      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v1
      
      - name: Build and push Docker image
        run: |
          docker build -t ability-v2-backend .
          docker tag ability-v2-backend:latest $ECR_REGISTRY/ability-v2-backend:latest
          docker push $ECR_REGISTRY/ability-v2-backend:latest
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
      
      - name: Update ECS service
        run: |
          aws ecs update-service --cluster your-cluster --service ability-v2-backend --force-new-deployment

  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
          cache-dependency-path: client/package-lock.json
      
      - name: Install dependencies
        run: cd client && npm ci
      
      - name: Build frontend
        run: cd client && npm run build
        env:
          REACT_APP_API_URL: https://api.yourdomain.com
      
      - name: Deploy to S3
        run: |
          aws s3 sync client/build/ s3://ability-v2-frontend --delete
          aws cloudfront create-invalidation --distribution-id YOUR_DISTRIBUTION_ID --paths "/*"
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

## Step 12: Accessibility Testing

### Automated Testing
```bash
# Install axe-core for accessibility testing
npm install --save-dev @axe-core/react jest-axe

# Run accessibility tests
npm run test:accessibility
```

### Manual Testing Checklist
- [ ] Test with NVDA screen reader
- [ ] Test with JAWS screen reader
- [ ] Test keyboard-only navigation
- [ ] Test with high contrast mode
- [ ] Test with zoom up to 200%
- [ ] Test with reduced motion preferences
- [ ] Verify color contrast ratios (4.5:1 minimum)
- [ ] Test focus indicators
- [ ] Verify skip links work
- [ ] Test live regions for dynamic updates

## Step 13: Performance Optimization

### Frontend Optimization
```bash
# Enable gzip compression
aws s3api put-bucket-website --bucket ability-v2-frontend --website-configuration file://website-config.json

# Set cache headers
aws s3api put-object --bucket ability-v2-frontend --key index.html --cache-control "no-cache"
aws s3api put-object --bucket ability-v2-frontend --key static/js/* --cache-control "max-age=31536000"
```

### Backend Optimization
```bash
# Enable Redis caching
# Configure connection pooling
# Set up database indexes
# Enable compression middleware
```

## Step 14: Backup and Disaster Recovery

### Database Backup
```bash
# MongoDB Atlas automated backups (recommended)
# Or set up regular MongoDB dumps
mongodump --uri="mongodb+srv://..." --out=/backup/$(date +%Y%m%d)
```

### S3 Cross-Region Replication
```bash
aws s3api put-bucket-replication \
  --bucket ability-v2-uploads \
  --replication-configuration file://replication-config.json
```

## Step 15: Security Hardening

### WAF Configuration
```bash
# Create WAF Web ACL
aws wafv2 create-web-acl \
  --name ability-v2-waf \
  --scope REGIONAL \
  --default-action Allow={} \
  --rules file://waf-rules.json
```

### Security Headers
```javascript
// Add to Express app
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "https:"],
    },
  },
}));
```

## Monitoring and Maintenance

### Health Checks
- Backend: `GET /health`
- Database connectivity
- Redis connectivity
- S3 access
- Twilio API access

### Log Monitoring
- Application logs in CloudWatch
- Access logs in ALB
- Error tracking with Sentry (optional)

### Performance Monitoring
- CloudWatch metrics
- Application Performance Monitoring (APM)
- Real User Monitoring (RUM)

## Cost Optimization

### Estimated Monthly Costs (US East 1)
- ECS Fargate (2 tasks): ~$50
- ALB: ~$20
- CloudFront: ~$10
- S3 Storage: ~$5
- ElastiCache: ~$15
- Route 53: ~$1
- **Total: ~$100/month**

### Cost Optimization Tips
- Use Spot instances for non-critical workloads
- Implement auto-scaling
- Use S3 Intelligent Tiering
- Monitor and optimize CloudWatch logs retention
- Use Reserved Instances for predictable workloads

## Troubleshooting

### Common Issues
1. **CORS errors**: Check CORS configuration in backend
2. **WebSocket connection fails**: Verify ALB supports WebSocket
3. **File upload fails**: Check S3 permissions and CORS
4. **Video call issues**: Verify Twilio credentials and network
5. **Database connection**: Check security groups and connection string

### Debug Commands
```bash
# Check ECS service status
aws ecs describe-services --cluster your-cluster --services ability-v2-backend

# View CloudWatch logs
aws logs tail /ecs/ability-v2-backend --follow

# Test ALB health
curl -I https://api.yourdomain.com/health

# Check S3 bucket policy
aws s3api get-bucket-policy --bucket ability-v2-uploads
```

This deployment guide provides a comprehensive setup for a production-ready, accessible video interview platform. Adjust the configurations based on your specific requirements and scale.
