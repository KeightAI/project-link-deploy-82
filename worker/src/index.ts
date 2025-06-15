
import { createClient } from '@supabase/supabase-js';
import { deploymentProcessor } from './deploymentProcessor';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

class DeploymentWorker {
  private isRunning = false;
  private pollInterval = 5000; // Poll every 5 seconds

  async start() {
    console.log('🚀 Deployment worker starting...');
    this.isRunning = true;
    
    // Handle graceful shutdown
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());

    await this.pollForDeployments();
  }

  stop() {
    console.log('🛑 Deployment worker stopping...');
    this.isRunning = false;
  }

  private async pollForDeployments() {
    while (this.isRunning) {
      try {
        await this.processNextDeployment();
        await this.sleep(this.pollInterval);
      } catch (error) {
        console.error('Error in deployment polling:', error);
        await this.sleep(this.pollInterval);
      }
    }
  }

  private async processNextDeployment() {
    // Get the oldest pending deployment
    const { data: deployment, error } = await supabase
      .from('deployments')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (error) {
      if (error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error fetching deployments:', error);
      }
      return;
    }

    if (!deployment) {
      return;
    }

    console.log(`📦 Processing deployment: ${deployment.id}`);

    // Update status to 'processing'
    await supabase
      .from('deployments')
      .update({ 
        status: 'processing',
        updated_at: new Date().toISOString()
      })
      .eq('id', deployment.id);

    // Process the deployment
    await deploymentProcessor.processDeployment(deployment, supabase);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Start the worker
const worker = new DeploymentWorker();
worker.start().catch((error) => {
  console.error('Failed to start deployment worker:', error);
  process.exit(1);
});
