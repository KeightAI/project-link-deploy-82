
import { SupabaseClient } from '@supabase/supabase-js';
import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import simpleGit from 'simple-git';

interface Deployment {
  id: string;
  repo_url: string;
  branch: string | null;
  stage: string | null;
  status: string;
  user_id: string | null;
  created_at: string;
}

export class DeploymentProcessor {
  private supabase: SupabaseClient;
  private workspaceDir = '/tmp/deployments';

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
    this.ensureWorkspaceDir();
  }

  private async ensureWorkspaceDir() {
    try {
      await fs.mkdir(this.workspaceDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create workspace directory:', error);
    }
  }

  async processDeployment(deployment: Deployment): Promise<void> {
    const { id, repo_url, branch, stage } = deployment;
    
    try {
      // Update status to processing
      await this.updateDeploymentStatus(id, 'cloning');
      
      // Step 1: Clone repository
      await this.cloneRepository(id, repo_url, branch || 'main');
      
      // Step 2: Run SST deployment
      await this.updateDeploymentStatus(id, 'deploying');
      await this.runSSTDeploy(id, stage || 'production');
      
      // Step 3: Complete
      await this.updateDeploymentStatus(id, 'completed');
      await this.addLog(id, 'Deployment completed successfully! ✅');
      
    } catch (error: any) {
      console.error(`Deployment ${id} failed:`, error);
      await this.updateDeploymentStatus(id, 'failed');
      await this.addLog(id, `Deployment failed: ${error.message} ❌`);
    } finally {
      // Cleanup
      await this.cleanup(id);
    }
  }

  private async cloneRepository(deploymentId: string, repoUrl: string, branch: string): Promise<void> {
    const projectDir = path.join(this.workspaceDir, deploymentId);
    
    await this.addLog(deploymentId, `Cloning repository: ${repoUrl}`);
    await this.addLog(deploymentId, `Branch: ${branch}`);

    try {
      const git = simpleGit();
      await git.clone(repoUrl, projectDir, ['--branch', branch, '--single-branch', '--depth', '1']);
      await this.addLog(deploymentId, 'Repository cloned successfully ✅');
    } catch (error: any) {
      await this.addLog(deploymentId, `Clone failed: ${error.message} ❌`);
      throw error;
    }
  }

  private async runSSTDeploy(deploymentId: string, stage: string): Promise<void> {
    const projectDir = path.join(this.workspaceDir, deploymentId);
    
    await this.addLog(deploymentId, 'Starting SST deployment...');
    await this.addLog(deploymentId, `Stage: ${stage}`);

    return new Promise((resolve, reject) => {
      const sstProcess = spawn('npx', ['sst', 'deploy', '--stage', stage], {
        cwd: projectDir,
        stdio: 'pipe',
        env: { 
          ...process.env,
          NODE_ENV: 'production'
        }
      });

      sstProcess.stdout?.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          this.addLog(deploymentId, `[SST] ${output}`);
        }
      });

      sstProcess.stderr?.on('data', (data) => {
        const output = data.toString().trim();
        if (output && !output.includes('npm WARN')) {
          this.addLog(deploymentId, `[SST ERROR] ${output}`);
        }
      });

      sstProcess.on('close', (code) => {
        if (code === 0) {
          this.addLog(deploymentId, 'SST deployment completed successfully ✅');
          resolve();
        } else {
          const error = `SST deployment failed with exit code ${code} ❌`;
          this.addLog(deploymentId, error);
          reject(new Error(error));
        }
      });

      sstProcess.on('error', (error) => {
        this.addLog(deploymentId, `SST process error: ${error.message} ❌`);
        reject(error);
      });

      // Set timeout to prevent hanging
      setTimeout(() => {
        sstProcess.kill('SIGKILL');
        reject(new Error('Deployment timeout after 30 minutes'));
      }, 30 * 60 * 1000); // 30 minutes
    });
  }

  private async updateDeploymentStatus(deploymentId: string, status: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('deployments')
        .update({ 
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', deploymentId);

      if (error) {
        console.error('Failed to update deployment status:', error);
      }
    } catch (error) {
      console.error('Error updating deployment status:', error);
    }
  }

  private async addLog(deploymentId: string, message: string): Promise<void> {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    
    console.log(`[${deploymentId}] ${message}`);

    try {
      // Get current logs
      const { data: deployment } = await this.supabase
        .from('deployments')
        .select('logs')
        .eq('id', deploymentId)
        .single();

      const currentLogs = deployment?.logs || '';
      const newLogs = currentLogs ? `${currentLogs}\n${logEntry}` : logEntry;

      // Update logs
      const { error } = await this.supabase
        .from('deployments')
        .update({ 
          logs: newLogs,
          updated_at: new Date().toISOString()
        })
        .eq('id', deploymentId);

      if (error) {
        console.error('Failed to update deployment logs:', error);
      }
    } catch (error) {
      console.error('Error adding log:', error);
    }
  }

  private async cleanup(deploymentId: string): Promise<void> {
    const projectDir = path.join(this.workspaceDir, deploymentId);
    
    try {
      await fs.rm(projectDir, { recursive: true, force: true });
      console.log(`Cleaned up workspace for deployment ${deploymentId}`);
    } catch (error) {
      console.error(`Failed to cleanup workspace for ${deploymentId}:`, error);
    }
  }
}
