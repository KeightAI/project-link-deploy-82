
# Keight Deployment Server

A Node.js backend service for deploying projects via SST (Serverless Stack) on Render.

## Features

- Clone GitHub repositories
- Run SST deployments with configurable stages
- Real-time deployment status and logs
- REST API for deployment management
- Designed for Render hosting

## API Endpoints

### Start Deployment
```
POST /api/deploy/start
```

**Body:**
```json
{
  "repoUrl": "https://github.com/username/repo.git",
  "branch": "main",
  "stage": "production"
}
```

**Response:**
```json
{
  "deploymentId": "uuid",
  "status": "started",
  "message": "Deployment initiated successfully"
}
```

### Get Deployment Status
```
GET /api/deploy/status/:deploymentId
```

**Response:**
```json
{
  "id": "uuid",
  "status": "deploying",
  "startTime": "2023-...",
  "logs": ["[timestamp] message", ...],
  "config": { ... }
}
```

### Get Deployment Logs
```
GET /api/deploy/logs/:deploymentId
```

**Response:**
```json
{
  "logs": ["[timestamp] message", ...]
}
```

## Deployment on Render

1. **Connect Repository:** Connect your GitHub repository to Render
2. **Set Environment Variables:** Configure the required environment variables in Render dashboard
3. **Deploy:** Render will automatically build and deploy your service

### Required Environment Variables

- `AWS_ACCESS_KEY_ID` - Your AWS access key for SST deployments
- `AWS_SECRET_ACCESS_KEY` - Your AWS secret key
- `AWS_REGION` - AWS region (default: us-east-1)
- `GITHUB_TOKEN` - (Optional) For private repositories

### Optional Environment Variables

- `WORKSPACE_DIR` - Directory for cloning repos (default: /tmp/deployments)
- `PORT` - Server port (Render sets this automatically)

## Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Copy environment file:**
   ```bash
   cp .env.example .env
   ```

3. **Configure environment variables in `.env`**

4. **Start development server:**
   ```bash
   npm run dev
   ```

The server will start on `http://localhost:3001`

## Deployment Flow

1. **Receive deployment request** with repository URL, branch, and stage
2. **Clone repository** to temporary workspace
3. **Run SST deployment** using `npx sst deploy --stage <stage>`
4. **Stream logs** and provide real-time status updates
5. **Clean up** workspace after deployment

## Error Handling

The service includes comprehensive error handling for:
- Repository cloning failures
- SST deployment errors
- Invalid configurations
- Missing dependencies

All errors are logged and returned via the API with appropriate HTTP status codes.
