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
      
      // Step 3: Install dependencies
      await this.updateDeploymentStatus(id, 'installing');
      await this.installDependencies(id);
      
      // Step 4: Fix executable permissions immediately after install
      await this.fixExecutablePermissions(id);
      
      // Step 5: Install SST platform
      await this.updateDeploymentStatus(id, 'preparing');
      await this.installSSTPlat(id);
      
      // Step 6: Run SST deployment
      await this.updateDeploymentStatus(id, 'deploying');
      await this.runSSTDeploy(id, stage || 'production');
      
      // Step 7: Complete
      await this.updateDeploymentStatus(id, 'completed');
      await this.addLog(id, 'Deployment completed successfully! ✅');
      
    } catch (error: any) {
      console.error(`Deployment ${id} failed:`, error);
      await this.updateDeploymentStatus(id, 'failed');
      await this.addLog(id, `Deployment failed: ${error.message} ❌`);
      
      // Try to capture SST logs and Pulumi event logs on failure
      await this.captureSSTLogs(id);
      await this.capturePulumiEventLogs(id);
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

  private async installDependencies(deploymentId: string): Promise<void> {
    const projectDir = path.join(this.workspaceDir, deploymentId);
    
    await this.addLog(deploymentId, '📦 Installing dependencies...');

    try {
      // Check which package manager to use
      const files = await fs.readdir(projectDir);
      let packageManager = 'npm';
      let installCommand = ['install'];

      if (files.includes('bun.lockb')) {
        packageManager = 'bun';
        installCommand = ['install'];
        await this.addLog(deploymentId, '🍞 Using Bun package manager');
      } else if (files.includes('yarn.lock')) {
        packageManager = 'yarn';
        installCommand = ['install', '--frozen-lockfile'];
        await this.addLog(deploymentId, '🧶 Using Yarn package manager');
      } else if (files.includes('package-lock.json')) {
        packageManager = 'npm';
        installCommand = ['ci'];
        await this.addLog(deploymentId, '📦 Using npm package manager');
      } else {
        await this.addLog(deploymentId, '📦 Using npm package manager (default)');
      }

      await this.addLog(deploymentId, `🔧 Running: ${packageManager} ${installCommand.join(' ')}`);

      return new Promise((resolve, reject) => {
        const installEnv = {
          ...process.env,
          NODE_ENV: 'production',
          PATH: `${process.env.PATH}:/usr/src/app/node_modules/.bin:/home/worker/.bun/bin`,
          BUN_INSTALL: '/home/worker/.bun',
          BUN_CONFIG_NO_CLEAR_TERMINAL: 'true'
        };

        const installProcess = spawn(packageManager, installCommand, {
          cwd: projectDir,
          stdio: 'pipe',
          env: installEnv
        });

        // Capture stdout
        installProcess.stdout?.on('data', (data) => {
          const output = data.toString();
          if (output.trim()) {
            output.split('\n').forEach((line: string) => {
              if (line.trim()) {
                this.addLog(deploymentId, `[${packageManager.toUpperCase()}] ${line.trim()}`);
              }
            });
          }
        });

        // Capture stderr (but filter out common warnings)
        installProcess.stderr?.on('data', (data) => {
          const output = data.toString();
          if (output.trim()) {
            // Filter out common harmless warnings
            const harmlessPatterns = [
              /^npm WARN/,
              /^npm warn/,
              /deprecated/i,
              /ERESOLVE/,
              /overriding peer dependency/i
            ];
            
            const isHarmless = harmlessPatterns.some(pattern => pattern.test(output));
            
            if (!isHarmless) {
              output.split('\n').forEach((line: string) => {
                if (line.trim()) {
                  this.addLog(deploymentId, `[${packageManager.toUpperCase()} WARN] ${line.trim()}`);
                }
              });
            }
          }
        });

        installProcess.on('close', async (code) => {
          await this.addLog(deploymentId, `[${packageManager.toUpperCase()}] Process exited with code: ${code}`);
          
          if (code === 0) {
            await this.addLog(deploymentId, '✅ Dependencies installed successfully!');
            resolve();
          } else {
            const error = `Dependency installation failed with exit code ${code}`;
            await this.addLog(deploymentId, `❌ ${error}`);
            reject(new Error(error));
          }
        });

        installProcess.on('error', async (error) => {
          await this.addLog(deploymentId, `❌ Install process error: ${error.message}`);
          reject(error);
        });

        // Timeout for dependency installation (10 minutes)
        setTimeout(() => {
          installProcess.kill('SIGKILL');
          reject(new Error('Dependency installation timeout after 10 minutes'));
        }, 10 * 60 * 1000);
      });

    } catch (error: any) {
      await this.addLog(deploymentId, `❌ Dependency installation failed: ${error.message}`);
      throw error;
    }
  }

  private async fixExecutablePermissions(deploymentId: string): Promise<void> {
    const projectDir = path.join(this.workspaceDir, deploymentId);
    const binDir = path.join(projectDir, 'node_modules', '.bin');
    
    await this.addLog(deploymentId, '🔧 Fixing executable permissions...');
    
    try {
      // Check if node_modules/.bin directory exists
      const binDirExists = await fs.access(binDir).then(() => true).catch(() => false);
      
      if (!binDirExists) {
        await this.addLog(deploymentId, '⚠️ No node_modules/.bin directory found');
        return;
      }

      // Method 1: Use chmod command to fix all files in .bin directory
      await this.addLog(deploymentId, '🔧 Setting executable permissions on all .bin files...');
      
      const chmodResult = await this.runCommand(deploymentId, 'chmod', ['+x', `${binDir}/*`], projectDir);
      
      if (chmodResult.success) {
        await this.addLog(deploymentId, '✅ chmod +x command completed successfully');
      } else {
        await this.addLog(deploymentId, '⚠️ chmod command failed, trying individual file approach...');
      }

      // Method 2: Fix individual files using Node.js fs.chmod
      const binFiles = await fs.readdir(binDir);
      await this.addLog(deploymentId, `📋 Found ${binFiles.length} files in .bin directory`);
      
      let fixedCount = 0;
      
      for (const file of binFiles) {
        try {
          const filePath = path.join(binDir, file);
          const stats = await fs.stat(filePath);
          
          // Only process regular files, not symlinks
          if (stats.isFile()) {
            await fs.chmod(filePath, 0o755);
            fixedCount++;
            
            // Special logging for react-router
            if (file === 'react-router') {
              await this.addLog(deploymentId, `✅ Fixed permissions for react-router executable`);
            }
          }
        } catch (error: any) {
          await this.addLog(deploymentId, `⚠️ Failed to fix ${file}: ${error.message}`);
        }
      }
      
      await this.addLog(deploymentId, `✅ Fixed permissions for ${fixedCount}/${binFiles.length} files`);
      
      // Method 3: Verify react-router specifically
      await this.verifyReactRouterPermissions(deploymentId, projectDir);
      
    } catch (error: any) {
      await this.addLog(deploymentId, `❌ Permission fixing failed: ${error.message}`);
      // Don't throw here - try to continue deployment
    }
  }

  private async verifyReactRouterPermissions(deploymentId: string, projectDir: string): Promise<void> {
    const reactRouterPath = path.join(projectDir, 'node_modules', '.bin', 'react-router');
    
    try {
      await this.addLog(deploymentId, '🔍 Verifying react-router permissions...');
      
      // Check if file exists
      const exists = await fs.access(reactRouterPath).then(() => true).catch(() => false);
      if (!exists) {
        await this.addLog(deploymentId, '❌ react-router executable not found');
        return;
      }
      
      // Check file stats
      const stats = await fs.stat(reactRouterPath);
      const mode = stats.mode;
      const isExecutable = !!(mode & parseInt('111', 8));
      
      await this.addLog(deploymentId, `📊 react-router mode: ${mode.toString(8)} (executable: ${isExecutable})`);
      
      if (!isExecutable) {
        await this.addLog(deploymentId, '🔧 react-router not executable, attempting to fix...');
        
        // Try multiple methods to make it executable
        await fs.chmod(reactRouterPath, 0o755);
        
        // Also try using system chmod
        const systemChmod = await this.runCommand(deploymentId, 'chmod', ['755', reactRouterPath], projectDir);
        
        // Verify the fix
        const newStats = await fs.stat(reactRouterPath);
        const newIsExecutable = !!(newStats.mode & parseInt('111', 8));
        
        if (newIsExecutable) {
          await this.addLog(deploymentId, '✅ react-router is now executable');
        } else {
          await this.addLog(deploymentId, '❌ Failed to make react-router executable');
        }
      } else {
        await this.addLog(deploymentId, '✅ react-router is already executable');
      }
      
      // Test execution
      const testResult = await this.runCommand(deploymentId, reactRouterPath, ['--version'], projectDir);
      if (testResult.success || testResult.output.includes('react-router')) {
        await this.addLog(deploymentId, '✅ react-router execution test passed');
      } else {
        await this.addLog(deploymentId, '❌ react-router execution test failed');
        await this.addLog(deploymentId, `Test output: ${testResult.output.substring(0, 200)}`);
      }
      
    } catch (error: any) {
      await this.addLog(deploymentId, `❌ react-router verification failed: ${error.message}`);
    }
  }

  private async runCommand(deploymentId: string, command: string, args: string[], cwd: string): Promise<{success: boolean, output: string}> {
    return new Promise((resolve) => {
      const process = spawn(command, args, {
        cwd,
        stdio: 'pipe',
        shell: true // Use shell to handle globbing
      });

      let output = '';
      let errorOutput = '';

      process.stdout?.on('data', (data) => {
        output += data.toString();
      });

      process.stderr?.on('data', (data) => {
        errorOutput += data.toString();
      });

      process.on('close', (code) => {
        const success = code === 0;
        const fullOutput = output + errorOutput;
        resolve({ success, output: fullOutput });
      });

      process.on('error', (error) => {
        resolve({ success: false, output: error.message });
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        process.kill('SIGTERM');
        resolve({ success: false, output: 'Command timeout' });
      }, 30000);
    });
  }

  private async installSSTPlat(deploymentId: string): Promise<void> {
    const projectDir = path.join(this.workspaceDir, deploymentId);
    
    await this.addLog(deploymentId, '🔧 Installing SST platform...');

    return new Promise((resolve, reject) => {
      const installEnv = {
        ...process.env,
        NODE_ENV: 'production',
        PATH: `${projectDir}/node_modules/.bin:${process.env.PATH}:/usr/src/app/node_modules/.bin:/home/worker/.bun/bin`,
        BUN_INSTALL: '/home/worker/.bun',
        BUN_CONFIG_NO_CLEAR_TERMINAL: 'true',
        SST_DEBUG: '1'
      };

      const installProcess = spawn('npx', ['sst', 'install'], {
        cwd: projectDir,
        stdio: 'pipe',
        env: installEnv
      });

      // Capture stdout
      installProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        if (output.trim()) {
          output.split('\n').forEach((line: string) => {
            if (line.trim()) {
              this.addLog(deploymentId, `[SST INSTALL] ${line.trim()}`);
            }
          });
        }
      });

      // Capture stderr
      installProcess.stderr?.on('data', (data) => {
        const output = data.toString();
        if (output.trim()) {
          output.split('\n').forEach((line: string) => {
            if (line.trim()) {
              this.addLog(deploymentId, `[SST INSTALL WARN] ${line.trim()}`);
            }
          });
        }
      });

      installProcess.on('close', async (code) => {
        await this.addLog(deploymentId, `[SST INSTALL] Process exited with code: ${code}`);
        
        if (code === 0) {
          await this.addLog(deploymentId, '✅ SST platform installed successfully!');
          resolve();
        } else {
          const error = `SST platform installation failed with exit code ${code}`;
          await this.addLog(deploymentId, `❌ ${error}`);
          reject(new Error(error));
        }
      });

      installProcess.on('error', async (error) => {
        await this.addLog(deploymentId, `❌ SST platform install process error: ${error.message}`);
        reject(error);
      });

      // Timeout for platform installation (5 minutes)
      setTimeout(() => {
        installProcess.kill('SIGKILL');
        reject(new Error('SST platform installation timeout after 5 minutes'));
      }, 5 * 60 * 1000);
    });
  }

  private async runSSTDeploy(deploymentId: string, stage: string): Promise<void> {
    const projectDir = path.join(this.workspaceDir, deploymentId);
    
    await this.addLog(deploymentId, '🚀 Starting SST deployment...');
    await this.addLog(deploymentId, `🎯 Stage: ${stage}`);
    await this.addLog(deploymentId, `📂 Working directory: ${projectDir}`);

    return new Promise((resolve, reject) => {
      // Enhanced environment variables for better compatibility
      const deploymentEnv = { 
        ...process.env,
        NODE_ENV: 'production',
        PATH: `${projectDir}/node_modules/.bin:${process.env.PATH}:/usr/src/app/node_modules/.bin:/home/worker/.bun/bin`,
        SST_DEBUG: '1',
        BUN_INSTALL: '/home/worker/.bun',
        BUN_CONFIG_NO_CLEAR_TERMINAL: 'true',
        BUN_CONFIG_SILENT: 'false',
        BUN_CONFIG_NO_PROGRESS: 'false',
        // Add DNS configuration for better network reliability
        NODE_OPTIONS: '--dns-result-order=ipv4first',
        // Increase Node.js memory limit
        NODE_MAX_OLD_SPACE_SIZE: '2048',
        // Add Pulumi specific environment variables for better logging
        PULUMI_DEBUG_GRPC: '1',
        PULUMI_SKIP_UPDATE_CHECK: 'true'
      };

      // Use npx to handle permissions automatically
      const sstProcess = spawn('npx', ['sst', 'deploy', '--stage', stage, '--verbose'], {
        cwd: projectDir,
        stdio: 'pipe',
        env: deploymentEnv
      });

      // Capture ALL stdout without filtering
      sstProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        if (output.trim()) {
          // Split by lines and log each line separately for better readability
          output.split('\n').forEach((line: string) => {
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
            output.split('\n').forEach((line: string) => {
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
          
          // Try to capture additional logs from SST and Pulumi
          await this.captureSSTLogs(deploymentId);
          await this.capturePulumiEventLogs(deploymentId);
          
          reject(new Error(error));
        }
      });

      sstProcess.on('error', async (error) => {
        await this.addLog(deploymentId, `❌ SST process error: ${error.message}`);
        reject(error);
      });

      // Reasonable timeout of 40 minutes for deployments
      setTimeout(() => {
        sstProcess.kill('SIGKILL');
        reject(new Error('Deployment timeout after 40 minutes'));
      }, 40 * 60 * 1000);
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

  private async capturePulumiEventLogs(deploymentId: string): Promise<void> {
    const projectDir = path.join(this.workspaceDir, deploymentId);
    const pulumiDir = path.join(projectDir, '.sst', 'pulumi');
    
    try {
      await this.addLog(deploymentId, '📋 Attempting to capture Pulumi event logs...');
      
      // Check if .sst/pulumi directory exists
      const pulumiDirExists = await fs.access(pulumiDir).then(() => true).catch(() => false);
      if (!pulumiDirExists) {
        await this.addLog(deploymentId, '⚠️ No .sst/pulumi directory found');
        return;
      }
      
      // Find the latest deployment directory (they're named with update IDs)
      const pulumiDirs = await fs.readdir(pulumiDir);
      const updateDirs = pulumiDirs.filter(dir => dir.length > 10); // Filter out non-update directories
      
      if (updateDirs.length === 0) {
        await this.addLog(deploymentId, '⚠️ No Pulumi update directories found');
        return;
      }
      
      // Get the most recent update directory
      const latestUpdateDir = updateDirs[updateDirs.length - 1];
      const eventLogPath = path.join(pulumiDir, latestUpdateDir, 'eventlog.json');
      
      await this.addLog(deploymentId, `📋 Checking for eventlog: ${eventLogPath}`);
      
      const eventLogExists = await fs.access(eventLogPath).then(() => true).catch(() => false);
      
      if (eventLogExists) {
        const eventLogContent = await fs.readFile(eventLogPath, 'utf-8');
        await this.addLog(deploymentId, '📋 === PULUMI EVENT LOG START ===');
        
        // Parse and filter the event log to show only errors and important events
        const events = eventLogContent.split('\n').filter(line => line.trim());
        const importantEvents = events.filter(line => {
          try {
            const event = JSON.parse(line);
            return event.diagEvent || event.resOpFailedEvent || event.engineEvent;
          } catch {
            return false;
          }
        });
        
        // Show last 50 important events
        const recentEvents = importantEvents.slice(-50);
        
        for (const eventLine of recentEvents) {
          try {
            const event = JSON.parse(eventLine);
            if (event.diagEvent) {
              const severity = event.diagEvent.severity || 'info';
              const message = event.diagEvent.message || 'No message';
              await this.addLog(deploymentId, `[PULUMI ${severity.toUpperCase()}] ${message}`);
            } else if (event.resOpFailedEvent) {
              const result = event.resOpFailedEvent.result;
              await this.addLog(deploymentId, `[PULUMI ERROR] Resource operation failed: ${result?.message || 'Unknown error'}`);
            } else if (event.engineEvent) {
              await this.addLog(deploymentId, `[PULUMI ENGINE] ${JSON.stringify(event.engineEvent)}`);
            }
          } catch (parseError) {
            // Skip malformed JSON lines
          }
        }
        
        await this.addLog(deploymentId, '📋 === PULUMI EVENT LOG END ===');
      } else {
        await this.addLog(deploymentId, '⚠️ eventlog.json file not found');
      }
      
    } catch (error: any) {
      await this.addLog(deploymentId, `⚠️ Failed to capture Pulumi event logs: ${error.message}`);
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
