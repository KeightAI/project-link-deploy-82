
import { createClient } from '@supabase/supabase-js';
import { DeploymentProcessor } from './deploymentProcessor';
import * as http from 'http';
import { config } from 'dotenv';

config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

class DeploymentWorker {
  private processor: DeploymentProcessor;
  private isRunning = false;
  private pollInterval = 10000; // 10 seconds

  constructor() {
    this.processor = new DeploymentProcessor(supabase);
  }

  async start() {
    console.log('🚀 Deployment worker starting...');
    this.isRunning = true;
    
    // Start health check server
    this.startHealthServer();
    
    // Start the main polling loop
    this.pollForDeployments();
  }

  private startHealthServer() {
    const server = http.createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          status: 'healthy', 
          timestamp: new Date().toISOString(),
          worker: 'running'
        }));
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(8080, () => {
      console.log('📊 Health server running on port 8080');
    });
  }

  private async pollForDeployments() {
    while (this.isRunning) {
      try {
        console.log('🔍 Checking for pending deployments...');
        
        // Get pending deployments
        const { data: deployments, error } = await supabase
          .from('deployments')
          .select('*')
          .eq('status', 'pending')
          .order('created_at', { ascending: true })
          .limit(1);

        if (error) {
          console.error('Error fetching deployments:', error);
        } else if (deployments && deployments.length > 0) {
          const deployment = deployments[0];
          console.log(`📦 Processing deployment: ${deployment.id}`);
          
          try {
            await this.processor.processDeployment(deployment);
          } catch (error) {
            console.error(`Failed to process deployment ${deployment.id}:`, error);
          }
        } else {
          console.log('No pending deployments found');
        }
      } catch (error) {
        console.error('Error in polling loop:', error);
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, this.pollInterval));
    }
  }

  stop() {
    console.log('🛑 Stopping deployment worker...');
    this.isRunning = false;
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Start the worker
const worker = new DeploymentWorker();
worker.start().catch(error => {
  console.error('Failed to start worker:', error);
  process.exit(1);
});
