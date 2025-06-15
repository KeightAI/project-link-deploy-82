
import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import simpleGit from 'simple-git';
import { SupabaseClient } from '@supabase/supabase-js';

interface Deployment {
  id: string;
  repo_url: string;
  branch: string;
  stage: string;
  user_id: string;
  status: string;
  logs: string | null;
  created_at: string;
  updated_at: string;
}

class DeploymentProcessor {
  private workspaceDir = process.env.WORKSPACE_DIR || '/tmp/deployments';

  constructor() {
    this.ensureWorkspaceDir();
  }

  private async ensureWorkspaceDir() {
    try {
      await fs.mkdir(this.workspaceDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create workspace directory:', error);
    }
  }

  async processDeployment(deployment: Deployment, supabase: SupabaseClient) {
    const deploymentId = deployment.id;
    
    try {
      // Step 1: Clone repository
      await this.updateDeploymentStatus(supabase, deploymentId, 'cloning');
      await this.cloneRepository(supabase, deploymentId, deployment);

      // Step 2: Run SST deployment
      await this.updateDeploymentStatus(supabase, deploymentId, 'deploying');
      await this.runSSTDeploy(supabase, deploymentId, deployment);

      // Step 3: Complete
      await this.updateDeploymentStatus(supabase, deploymentId, 'completed');
      await this.addLog(supabase, deploymentId, 'Deployment completed successfully!');

      // Clean up workspace
      await this.cleanup(deploymentId);

    } catch (error: any) {
      console.error(`Deployment ${deploymentId} failed:`, error);
      await this.updateDeploymentStatus(supabase, deploymentId, 'failed');
      await this.addLog(supabase, deploymentId, `Deployment failed: ${error.message}`);
      
      // Clean up workspace even on failure
      await this.cleanup(deploymentId);
    }
  }

  private async cloneRepository(supabase: SupabaseClient, deploymentId: string, deployment: Deployment) {
    const projectDir = path.join(this.workspaceDir, deploymentId);
    
    await this.addLog(supabase, deploymentId, `Cloning repository: ${deployment.repo_url}`);
    await this.addLog(supabase, deploymentId, `Branch: ${deployment.branch}`);

    const git = simpleGit();
    await git.clone(deployment.repo_url, projectDir, ['--branch', deployment.branch, '--single-branch']);
    
    await this.addLog(supabase, deploymentId, 'Repository cloned successfully');
  }

  private async runSSTDeploy(supabase: SupabaseClient, deploymentId: string, deployment: Deployment): Promise<void> {
    const projectDir = path.join(this.workspaceDir, deploymentId);
    
    await this.addLog(supabase, deploymentId, 'Starting SST deployment...');
    await this.addLog(supabase, deploymentId, `Stage: ${deployment.stage}`);

    return new Promise((resolve, reject) => {
      const sstProcess = spawn('npx', ['sst', 'deploy', '--stage', deployment.stage], {
        cwd: projectDir,
        stdio: 'pipe',
        env: { 
          ...process.env,
          // Add any additional environment variables for SST
        }
      });

      sstProcess.stdout?.on('data', async (data) => {
        const output = data.toString().trim();
        if (output) {
          await this.addLog(supabase, deploymentId, `[SST] ${output}`);
        }
      });

      sstProcess.stderr?.on('data', async (data) => {
        const output = data.toString().trim();
        if (output) {
          await this.addLog(supabase, deploymentId, `[SST ERROR] ${output}`);
        }
      });

      sstProcess.on('close', async (code) => {
        if (code === 0) {
          await this.addLog(supabase, deploymentId, 'SST deployment completed successfully');
          resolve();
        } else {
          const error = `SST deployment failed with exit code ${code}`;
          await this.addLog(supabase, deploymentId, error);
          reject(new Error(error));
        }
      });

      sstProcess.on('error', async (error) => {
        await this.addLog(supabase, deploymentId, `SST process error: ${error.message}`);
        reject(error);
      });
    });
  }

  private async updateDeploymentStatus(supabase: SupabaseClient, deploymentId: string, status: string) {
    await supabase
      .from('deployments')
      .update({ 
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', deploymentId);
  }

  private async addLog(supabase: SupabaseClient, deploymentId: string, message: string) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    
    console.log(`[${deploymentId}] ${message}`);

    // Get current logs
    const { data: deployment } = await supabase
      .from('deployments')
      .select('logs')
      .eq('id', deploymentId)
      .single();

    const currentLogs = deployment?.logs || '';
    const newLogs = currentLogs ? `${currentLogs}\n${logEntry}` : logEntry;

    // Update logs in database
    await supabase
      .from('deployments')
      .update({ 
        logs: newLogs,
        updated_at: new Date().toISOString()
      })
      .eq('id', deploymentId);
  }

  private async cleanup(deploymentId: string) {
    try {
      const projectDir = path.join(this.workspaceDir, deploymentId);
      await fs.rm(projectDir, { recursive: true, force: true });
      console.log(`🧹 Cleaned up workspace for deployment: ${deploymentId}`);
    } catch (error) {
      console.error(`Failed to cleanup workspace for ${deploymentId}:`, error);
    }
  }
}

export const deploymentProcessor = new DeploymentProcessor();
