
# Keight Deployment Worker (Fly.io)

A background worker service that processes SST deployments by monitoring the Supabase `deployments` table.

## Features

- 🔄 Polls Supabase for pending deployments
- 📦 Clones GitHub repositories
- 🚀 Runs SST deployments with configurable stages
- 📊 Real-time status updates and logging
- 🩺 Health check endpoint
- 🐳 Docker containerized for Fly.io

## Quick Setup

### 1. Install Fly CLI

```bash
curl -L https://fly.io/install.sh | sh
```

### 2. Login to Fly.io

```bash
fly auth login
```

### 3. Create Fly App

```bash
fly apps create keight-deployment-worker
```

### 4. Set Environment Variables

```bash
fly secrets set SUPABASE_URL="https://your-project.supabase.co"
fly secrets set SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
fly secrets set AWS_ACCESS_KEY_ID="your-aws-access-key"
fly secrets set AWS_SECRET_ACCESS_KEY="your-aws-secret-key"
fly secrets set AWS_REGION="us-east-1"
```

### 5. Build and Deploy

```bash
# Build the TypeScript code
npm run build

# Deploy to Fly.io
fly deploy
```

## Environment Variables

### Required
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for database access
- `AWS_ACCESS_KEY_ID` - AWS credentials for SST deployments
- `AWS_SECRET_ACCESS_KEY` - AWS secret key
- `AWS_REGION` - AWS region (default: us-east-1)

### Optional
- `GITHUB_TOKEN` - For accessing private repositories
- `NODE_ENV` - Environment (production/development)

## Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create environment file:**
   ```bash
   cp .env.example .env
   # Edit .env with your actual values
   ```

3. **Build and run:**
   ```bash
   npm run build
   npm start
   ```

4. **Development mode:**
   ```bash
   npm run dev
   ```

## How It Works

1. **Polling:** Worker polls the `deployments` table every 10 seconds
2. **Processing:** When a pending deployment is found:
   - Updates status to "cloning"
   - Clones the repository to `/tmp/deployments/{deployment-id}`
   - Updates status to "deploying"
   - Runs `npx sst deploy --stage {stage}`
   - Updates status to "completed" or "failed"
   - Cleans up the workspace

3. **Logging:** All deployment steps are logged to the database in real-time

## Monitoring

- **Health Check:** `GET /health` returns worker status
- **Logs:** View deployment logs via `fly logs`
- **Metrics:** Monitor via Fly.io dashboard

## Fly.io Commands

```bash
# Deploy
fly deploy

# Check status
fly status

# View logs
fly logs

# Scale up/down
fly scale count 2

# SSH into container
fly ssh console

# Update secrets
fly secrets set KEY=value
```

## Troubleshooting

### Common Issues

1. **Out of memory:** Increase memory allocation in `fly.toml`
2. **Deployment timeout:** Increase timeout in deployment processor
3. **Git clone fails:** Check repository access and GitHub token
4. **SST deployment fails:** Verify AWS credentials and permissions

### Debug Commands

```bash
# Check worker status
curl https://your-app.fly.dev/health

# View real-time logs
fly logs -f

# Check environment variables
fly ssh console -C "printenv"
```

## Security Notes

- All secrets are managed via Fly.io secrets (encrypted)
- Worker runs as non-root user in container
- Workspace directories are cleaned after each deployment
- Health check endpoint only returns basic status

## Performance

- **Memory:** ~512MB base + deployment workspace
- **CPU:** Single core sufficient for most workloads
- **Scaling:** Can run multiple instances for higher throughput
- **Timeout:** 30-minute deployment timeout prevents hanging

