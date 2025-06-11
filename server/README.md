
# Keight AI Backend Server

Backend server for handling GitHub repository deployments with SST to AWS.

## Features

- Pull code from GitHub repositories
- Generate SST configuration files
- Deploy to AWS using SST CLI
- Track deployment status and logs
- RESTful API for frontend integration

## Setup

1. Clone this repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and configure your environment variables
4. Run in development: `npm run dev`
5. Build for production: `npm run build`
6. Start production server: `npm start`

## API Endpoints

### Health Check
- `GET /api/health` - Server health status

### Deployment
- `POST /api/deploy/start` - Start a new deployment
  ```json
  {
    "repoUrl": "https://github.com/user/repo.git",
    "branch": "main",
    "stage": "production"
  }
  ```

- `GET /api/deploy/status/:deploymentId` - Get deployment status

## Railway Deployment

1. Connect your GitHub repository to Railway
2. Set environment variables in Railway dashboard:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY` 
   - `AWS_REGION`
   - `GITHUB_TOKEN` (if deploying private repos)
3. Deploy!

## Environment Variables

- `PORT` - Server port (default: 3001)
- `WORKSPACE_DIR` - Directory for cloning repos (default: /tmp/deployments)
- `AWS_ACCESS_KEY_ID` - AWS credentials for SST deployment
- `AWS_SECRET_ACCESS_KEY` - AWS credentials for SST deployment
- `AWS_REGION` - AWS region (default: us-east-1)
- `GITHUB_TOKEN` - GitHub token for private repo access (optional)
