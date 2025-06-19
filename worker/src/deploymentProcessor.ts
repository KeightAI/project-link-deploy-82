import { SupabaseClient } from '@supabase/supabase-js';
import { spawn } from 'child_process';
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
      
      // Step 2: Run pre-deployment checks
      await this.preDeploymentChecks(id);
      
      // Step 3: Run SST deployment
      await this.updateDeploymentStatus(id, 'deploying');
      await this.runSSTDeploy(id, stage || 'production');
      
      // Step 4: Complete
      await this.updateDeploymentStatus(id, 'completed');
      await this.addLog(id, 'Deployment completed successfully! ✅');
      
    } catch (error: any) {
      console.error(`Deployment ${id} failed:`, error);
      await this.updateDeploymentStatus(id, 'failed');
      await this.addLog(id, `Deployment failed: ${error.message} ❌`);
      
      // Try to capture SST logs on failure
      await this.captureSSTLogs(id);
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

  private async preDeploymentChecks(deploymentId: string): Promise<void> {
    const projectDir = path.join(this.workspaceDir, deploymentId);
    
    await this.addLog(deploymentId, '🔍 Running pre-deployment checks...');
    
    try {
      // Check working directory contents
      const files = await fs.readdir(projectDir);
      await this.addLog(deploymentId, `📁 Project files: ${files.join(', ')}`);
      
      // Check for SST config
      const sstConfigExists = files.some(file => 
        file === 'sst.config.ts' || file === 'sst.config.js' || file === 'sst.config.json'
      );
      
      if (sstConfigExists) {
        await this.addLog(deploymentId, '✅ SST config file found');
      } else {
        await this.addLog(deploymentId, '⚠️ No SST config file found - this might cause deployment issues');
      }
      
      // Check for package.json
      if (files.includes('package.json')) {
        await this.addLog(deploymentId, '✅ package.json found');
        try {
          const packageJson = JSON.parse(await fs.readFile(path.join(projectDir, 'package.json'), 'utf-8'));
          await this.addLog(deploymentId, `📦 Project name: ${packageJson.name || 'Unknown'}`);
          if (packageJson.dependencies?.sst) {
            await this.addLog(deploymentId, `📦 SST version: ${packageJson.dependencies.sst}`);
          }
        } catch (error) {
          await this.addLog(deploymentId, '⚠️ Could not read package.json');
        }
      } else {
        await this.addLog(deploymentId, '⚠️ No package.json found');
      }
      
      // Log environment info
      await this.addLog(deploymentId, `🖥️ Working directory: ${projectDir}`);
      await this.addLog(deploymentId, `🖥️ Node version: ${process.version}`);
      await this.addLog(deploymentId, `🖥️ Platform: ${process.platform}`);
      
    } catch (error: any) {
      await this.addLog(deploymentId, `⚠️ Pre-deployment check failed: ${error.message}`);
    }
  }

  private async runSSTDeploy(deploymentId: string, stage: string): Promise<void> {
    const projectDir = path.join(this.workspaceDir, deploymentId);
    
    await this.addLog(deploymentId, '🚀 Starting SST deployment...');
    await this.addLog(deploymentId, `🎯 Stage: ${stage}`);
    await this.addLog(deploymentId, `📂 Working directory: ${projectDir}`);

    return new Promise((resolve, reject) => {
      // Use the locally installed SST with verbose logging
      const sstProcess = spawn('sst', ['deploy', '--stage', stage, '--print-logs', '--verbose'], {
        cwd: projectDir,
        stdio: 'pipe',
        env: { 
          ...process.env,
          NODE_ENV: 'production',
          PATH: `${process.env.PATH}:/usr/src/app/node_modules/.bin`,
          SST_DEBUG: '1' // Enable SST debug mode
        }
      });

      // Capture ALL stdout without filtering
      sstProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        if (output.trim()) {
          // Split by lines and log each line separately for better readability
          output.split('\n').forEach(line => {
            if (line.trim()) {
              this.addLog(deploymentId, `[SST] ${line.trim()}`);
            }
          });
        }
      });

      // Capture ALL stderr without aggressive filtering
      sstProcess.stderr?.on('data', (data) => {
        const output = data.toString();
        if (output.trim()) {
          // Only filter out known harmless messages, but be much less aggressive
          const harmlessPatterns = [
            /^npm WARN/,
            /^npm warn/,
            /ExperimentalWarning.*--experimental-loader/
          ];
          
          const isHarmless = harmlessPatterns.some(pattern => pattern.test(output));
          
          if (!isHarmless) {
            output.split('\n').forEach(line => {
              if (line.trim()) {
                this.addLog(deploymentId, `[SST STDERR] ${line.trim()}`);
              }
            });
          }
        }
      });

      sstProcess.on('close', async (code) => {
        await this.addLog(deploymentId, `[SST] Process exited with code: ${code}`);
        
        if (code === 0) {
          await this.addLog(deploymentId, '✅ SST deployment completed successfully!');
          resolve();
        } else {
          const error = `SST deployment failed with exit code ${code}`;
          await this.addLog(deploymentId, `❌ ${error}`);
          
          // Try to capture additional logs from SST log files
          await this.captureSSTLogs(deploymentId);
          
          reject(new Error(error));
        }
      });

      sstProcess.on('error', async (error) => {
        await this.addLog(deploymentId, `❌ SST process error: ${error.message}`);
        reject(error);
      });

      // Set timeout to prevent hanging (increased to 45 minutes for complex deployments)
      setTimeout(() => {
        sstProcess.kill('SIGKILL');
        reject(new Error('Deployment timeout after 45 minutes'));
      }, 45 * 60 * 1000);
    });
  }

  private async captureSSTLogs(deploymentId: string): Promise<void> {
    const projectDir = path.join(this.workspaceDir, deploymentId);
    const sstLogDir = path.join(projectDir, '.sst', 'log');
    
    try {
      await this.addLog(deploymentId, '📋 Attempting to capture SST logs...');
      
      // Check if .sst directory exists
      const sstDirExists = await fs.access(path.join(projectDir, '.sst')).then(() => true).catch(() => false);
      if (!sstDirExists) {
        await this.addLog(deploymentId, '⚠️ No .sst directory found');
        return;
      }
      
      // Check if log directory exists
      const logDirExists = await fs.access(sstLogDir).then(() => true).catch(() => false);
      if (!logDirExists) {
        await this.addLog(deploymentId, '⚠️ No .sst/log directory found');
        return;
      }
      
      // List all log files
      const logFiles = await fs.readdir(sstLogDir);
      await this.addLog(deploymentId, `📋 Found log files: ${logFiles.join(', ')}`);
      
      // Read the main SST log file
      const sstLogFile = path.join(sstLogDir, 'sst.log');
      const sstLogExists = await fs.access(sstLogFile).then(() => true).catch(() => false);
      
      if (sstLogExists) {
        const sstLogContent = await fs.readFile(sstLogFile, 'utf-8');
        await this.addLog(deploymentId, '📋 === SST LOG CONTENT START ===');
        
        // Split log content into chunks to avoid overwhelming the logs
        const logLines = sstLogContent.split('\n');
        const recentLines = logLines.slice(-100); // Get last 100 lines
        
        for (const line of recentLines) {
          if (line.trim()) {
            await this.addLog(deploymentId, `[SST LOG] ${line.trim()}`);
          }
        }
        
        await this.addLog(deploymentId, '📋 === SST LOG CONTENT END ===');
      } else {
        await this.addLog(deploymentId, '⚠️ sst.log file not found');
      }
      
    } catch (error: any) {
      await this.addLog(deploymentId, `⚠️ Failed to capture SST logs: ${error.message}`);
    }
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
