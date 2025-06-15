
# Keight Deployment Worker

This is a background worker that processes deployment requests from the deployments table.

## How it works

1. Polls the `deployments` table every 5 seconds for pending deployments
2. Picks up the oldest pending deployment
3. Clones the repository
4. Runs SST deployment
5. Updates the deployment status and logs

## Deployment to Render

1. Create a new Worker service in Render
2. Connect your GitHub repository
3. Set the root directory to `worker`
4. Add the required environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_REGION`

## Environment Variables

- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key for admin access
- `WORKSPACE_DIR`: Directory for cloning repositories (default: /tmp/deployments)
- AWS credentials for SST deployments

## Local Development

```bash
cd worker
npm install
cp .env.example .env
# Fill in your environment variables
npm run dev
```

## Production

The worker will automatically build and start when deployed to Render.
