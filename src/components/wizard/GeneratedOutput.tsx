import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Download, CheckCircle, Code, Shield, Sparkles, Edit3, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface WizardData {
  selectedRepo?: {
    id: string;
    name: string;
    github_repo_url: string | null;
  };
  aiPrompt?: string;
  selectedServices?: string[];
  generatedCode?: string;
  iamRole?: string;
}

interface GeneratedOutputProps {
  wizardData: WizardData;
  onCodeGenerated: (code: string, iam: string) => void;
  onEditPrompt: () => void;
  iterationCount?: number;
}

const GeneratedOutput = ({ wizardData, onCodeGenerated, onEditPrompt, iterationCount = 1 }: GeneratedOutputProps) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState({
    terraform: '',
    deployScript: '',
    dockerFile: '',
    iamPolicy: ''
  });
  const { toast } = useToast();

  useEffect(() => {
    generateInfrastructure();
  }, []);

  const generateInfrastructure = async () => {
    setIsGenerating(true);
    
    // Simulate AI generation with realistic delay
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Mock generated content based on the wizard data
    const mockContent = {
      terraform: `# Terraform configuration for ${wizardData.selectedRepo?.name}
provider "aws" {
  region = "us-west-2"
}

# S3 bucket for static assets
resource "aws_s3_bucket" "app_assets" {
  bucket = "${wizardData.selectedRepo?.name}-assets-\${random_id.bucket_suffix.hex}"
}

# CloudFront distribution
resource "aws_cloudfront_distribution" "app_cdn" {
  origin {
    domain_name = aws_s3_bucket.app_assets.bucket_regional_domain_name
    origin_id   = "S3-\${aws_s3_bucket.app_assets.bucket}"
  }
  
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  
  default_cache_behavior {
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-\${aws_s3_bucket.app_assets.bucket}"
    
    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
    
    viewer_protocol_policy = "redirect-to-https"
  }
}

# Application Load Balancer
resource "aws_lb" "app_lb" {
  name               = "${wizardData.selectedRepo?.name}-lb"
  internal           = false
  load_balancer_type = "application"
  subnets            = [aws_subnet.public_1.id, aws_subnet.public_2.id]
  
  enable_deletion_protection = false
}`,

      deployScript: `#!/bin/bash
set -e

echo "🚀 Starting deployment for ${wizardData.selectedRepo?.name}"

# Build the application
echo "📦 Building application..."
npm install
npm run build

# Upload to S3
echo "☁️  Uploading to S3..."
aws s3 sync dist/ s3://\${S3_BUCKET_NAME} --delete

# Invalidate CloudFront cache
echo "🔄 Invalidating CloudFront cache..."
aws cloudfront create-invalidation --distribution-id \${CLOUDFRONT_DISTRIBUTION_ID} --paths "/*"

# Deploy API if exists
if [ -d "api" ]; then
  echo "🔧 Deploying API..."
  cd api
  npm install
  npm run deploy
  cd ..
fi

echo "✅ Deployment completed successfully!"
echo "🌐 Your application is available at: https://\${CLOUDFRONT_DOMAIN_NAME}"`,

      dockerFile: `# Multi-stage build for ${wizardData.selectedRepo?.name}
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD curl -f http://localhost/ || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]`,

      iamPolicy: `{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3BucketAccess",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::${wizardData.selectedRepo?.name}-assets-*",
        "arn:aws:s3:::${wizardData.selectedRepo?.name}-assets-*/*"
      ]
    },
    {
      "Sid": "CloudFrontAccess", 
      "Effect": "Allow",
      "Action": [
        "cloudfront:CreateInvalidation",
        "cloudfront:GetDistribution",
        "cloudfront:ListDistributions"
      ],
      "Resource": "*"
    },
    {
      "Sid": "EC2Access",
      "Effect": "Allow", 
      "Action": [
        "ec2:DescribeInstances",
        "ec2:DescribeImages",
        "ec2:DescribeKeyPairs",
        "ec2:DescribeSecurityGroups",
        "ec2:DescribeSubnets"
      ],
      "Resource": "*"
    }
  ]
}`
    };

    setGeneratedContent(mockContent);
    onCodeGenerated(mockContent.terraform, mockContent.iamPolicy);
    setIsGenerating(false);
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied!",
        description: `${label} copied to clipboard`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (isGenerating) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Generating Infrastructure Code</h3>
        <p className="text-gray-600">Our AI is analyzing your requirements and creating optimized configurations...</p>
        <div className="mt-4 flex justify-center">
          <div className="flex items-center gap-2 text-sm text-blue-600">
            <Sparkles className="h-4 w-4 animate-pulse" />
            <span>Optimizing for cost and performance</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Review & Deploy</h2>
        <p className="text-gray-600">Generated infrastructure code and deployment configuration</p>
        {iterationCount > 1 && (
          <div className="flex items-center justify-center gap-2 mt-2">
            <RefreshCw className="h-4 w-4 text-blue-600" />
            <span className="text-sm text-blue-600">Configuration updated (Iteration {iterationCount})</span>
          </div>
        )}
      </div>

      {/* Summary Card */}
      <Card className="mb-6 bg-green-50 border-green-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-green-800">
                <CheckCircle className="h-5 w-5" />
                Configuration Generated Successfully
              </CardTitle>
              <CardDescription className="text-green-700">
                Based on your requirements for <strong>{wizardData.selectedRepo?.name}</strong> using{' '}
                {wizardData.selectedServices?.join(', ') || 'selected AWS services'}
              </CardDescription>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={onEditPrompt}
              className="border-green-300 text-green-800 hover:bg-green-100"
            >
              <Edit3 className="h-4 w-4 mr-2" />
              Edit Prompt
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Generated Code Tabs */}
      <Tabs defaultValue="terraform" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="terraform">Terraform</TabsTrigger>
          <TabsTrigger value="deploy">Deploy Script</TabsTrigger>
          <TabsTrigger value="docker">Dockerfile</TabsTrigger>
          <TabsTrigger value="iam">IAM Policy</TabsTrigger>
        </TabsList>

        <TabsContent value="terraform">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Code className="h-5 w-5" />
                  <CardTitle>Terraform Configuration</CardTitle>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => copyToClipboard(generatedContent.terraform, 'Terraform configuration')}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => downloadFile(generatedContent.terraform, 'main.tf')}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                </div>
              </div>
              <CardDescription>Infrastructure as Code configuration for AWS</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="bg-gray-50 p-4 rounded-lg text-sm overflow-x-auto">
                <code>{generatedContent.terraform}</code>
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deploy">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Code className="h-5 w-5" />
                  <CardTitle>Deployment Script</CardTitle>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => copyToClipboard(generatedContent.deployScript, 'Deploy script')}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => downloadFile(generatedContent.deployScript, 'deploy.sh')}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                </div>
              </div>
              <CardDescription>Automated deployment script</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="bg-gray-50 p-4 rounded-lg text-sm overflow-x-auto">
                <code>{generatedContent.deployScript}</code>
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="docker">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Code className="h-5 w-5" />
                  <CardTitle>Dockerfile</CardTitle>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => copyToClipboard(generatedContent.dockerFile, 'Dockerfile')}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => downloadFile(generatedContent.dockerFile, 'Dockerfile')}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                </div>
              </div>
              <CardDescription>Container configuration for your application</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="bg-gray-50 p-4 rounded-lg text-sm overflow-x-auto">
                <code>{generatedContent.dockerFile}</code>
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="iam">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  <CardTitle>IAM Policy</CardTitle>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => copyToClipboard(generatedContent.iamPolicy, 'IAM policy')}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => downloadFile(generatedContent.iamPolicy, 'iam-policy.json')}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                </div>
              </div>
              <CardDescription>
                Add this IAM policy to your AWS Management Console for deployment permissions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="bg-gray-50 p-4 rounded-lg text-sm overflow-x-auto">
                <code>{generatedContent.iamPolicy}</code>
              </pre>
              <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <Shield className="h-5 w-5 text-amber-600 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-amber-800">AWS Setup Required</h4>
                    <p className="text-sm text-amber-700 mt-1">
                      Create an IAM role in your AWS Management Console and attach this policy 
                      to enable the deployment process.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default GeneratedOutput;