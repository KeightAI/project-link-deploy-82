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
      
      // Step 3: Install dependencies with permission fixes
      await this.updateDeploymentStatus(id, 'installing');
      await this.installDependenciesWithPermissionFix(id);
      
      // Step 4: Install SST platform
      await this.updateDeploymentStatus(id, 'preparing');
      await this.installSSTPlat(id);
      
      // Step 5: Run SST deployment
      await this.updateDeploymentStatus(id, 'deploying');
      await this.runSSTDeploy(id, stage || 'production');
      
      // Step 6: Complete
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
      
      // Check workspace permissions early
      await this.checkWorkspacePermissions(deploymentId, projectDir);
      
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
          if (packageJson.scripts?.build) {
            await this.addLog(deploymentId, `🔧 Build script: ${packageJson.scripts.build}`);
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

  private async checkWorkspacePermissions(deploymentId: string, projectDir: string): Promise<void> {
    await this.addLog(deploymentId, '🔐 Checking workspace permissions...');
    
    try {
      // Check if we can write to the project directory
      const testFile = path.join(projectDir, '.permission-test');
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);
      await this.addLog(deploymentId, '✅ Project directory is writable');
      
      // Check if we can create subdirectories
      const testDir = path.join(projectDir, '.test-dir');
      await fs.mkdir(testDir);
      await fs.rmdir(testDir);
      await this.addLog(deploymentId, '✅ Can create subdirectories');
      
      // Check directory ownership
      const stats = await fs.stat(projectDir);
      const uid = process.getuid?.() || 0;
      const gid = process.getgid?.() || 0;
      await this.addLog(deploymentId, `🔍 Directory owner: ${stats.uid}, worker process: ${uid}`);
      await this.addLog(deploymentId, `🔍 Directory group: ${stats.gid}, worker process: ${gid}`);
      
      if (stats.uid !== uid) {
        await this.addLog(deploymentId, '⚠️ Directory not owned by worker process - may cause permission issues');
      }
      
      // Check if we can execute commands in this directory
      const result = await this.runCommand(deploymentId, 'ls', ['-la'], projectDir);
      if (result.success) {
        await this.addLog(deploymentId, '✅ Can execute commands in project directory');
      } else {
        await this.addLog(deploymentId, '❌ Cannot execute commands in project directory');
        throw new Error('Insufficient permissions to execute commands');
      }
      
    } catch (error: any) {
      await this.addLog(deploymentId, `❌ Permission check failed: ${error.message}`);
      throw new Error(`Workspace permission check failed: ${error.message}`);
    }
  }

  private async installDependenciesWithPermissionFix(deploymentId: string): Promise<void> {
    const projectDir = path.join(this.workspaceDir, deploymentId);
    
    await this.addLog(deploymentId, '📦 Installing dependencies with permission fixes...');
    
    // Check permissions before installation
    await this.preInstallPermissionCheck(deploymentId, projectDir);

    try {
      // Determine package manager
      const files = await fs.readdir(projectDir);
      let packageManager = 'npm';
      let installCommand = ['install', '--ignore-scripts'];

      if (files.includes('bun.lockb')) {
        packageManager = 'bun';
        installCommand = ['install', '--ignore-scripts'];
        await this.addLog(deploymentId, '🍞 Using Bun package manager');
      } else if (files.includes('yarn.lock')) {
        packageManager = 'yarn';
        installCommand = ['install', '--ignore-scripts'];
        await this.addLog(deploymentId, '🧶 Using Yarn package manager');
      } else {
        await this.addLog(deploymentId, '📦 Using npm package manager');
      }

      await this.addLog(deploymentId, `🔧 Running: ${packageManager} ${installCommand.join(' ')}`);

      // Step 1: Install dependencies without scripts
      await this.runInstallCommand(deploymentId, packageManager, installCommand, projectDir);
      
      // Step 2: Fix permissions on node_modules/.bin
      await this.fixBinaryPermissions(deploymentId, projectDir);
      
      // Step 3: Run postinstall scripts manually if they exist
      await this.runPostInstallScripts(deploymentId, projectDir, packageManager);
      
      await this.addLog(deploymentId, '✅ Dependencies installed and configured successfully!');

    } catch (error: any) {
      await this.addLog(deploymentId, `❌ Dependency installation failed: ${error.message}`);
      throw error;
    }
  }

  private async runInstallCommand(deploymentId: string, packageManager: string, installCommand: string[], projectDir: string): Promise<void> {
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

      installProcess.stderr?.on('data', (data) => {
        const output = data.toString();
        if (output.trim() && !this.isHarmlessWarning(output)) {
          output.split('\n').forEach((line: string) => {
            if (line.trim()) {
              this.addLog(deploymentId, `[${packageManager.toUpperCase()} WARN] ${line.trim()}`);
            }
          });
        }
      });

      installProcess.on('close', async (code) => {
        await this.addLog(deploymentId, `[${packageManager.toUpperCase()}] Process exited with code: ${code}`);
        
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Dependency installation failed with exit code ${code}`));
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
  }

  private async preInstallPermissionCheck(deploymentId: string, projectDir: string): Promise<void> {
    await this.addLog(deploymentId, '🔐 Pre-install permission check...');
    
    try {
      // Check if node_modules directory exists and if we can access it
      const nodeModulesDir = path.join(projectDir, 'node_modules');
      const nodeModulesExists = await fs.access(nodeModulesDir).then(() => true).catch(() => false);
      
      if (nodeModulesExists) {
        await this.addLog(deploymentId, '📁 node_modules directory already exists');
        
        // Try to create a test file in node_modules
        const testFile = path.join(nodeModulesDir, '.permission-test');
        try {
          await fs.writeFile(testFile, 'test');
          await fs.unlink(testFile);
          await this.addLog(deploymentId, '✅ Can write to existing node_modules');
        } catch (error) {
          await this.addLog(deploymentId, '❌ Cannot write to existing node_modules - will try to fix');
          await this.runCommand(deploymentId, 'chmod', ['-R', '755', nodeModulesDir], projectDir);
        }
      } else {
        await this.addLog(deploymentId, '📁 node_modules directory does not exist yet');
      }
      
      // Check if we can create .bin directory ahead of time
      const futureBindDir = path.join(projectDir, 'node_modules', '.bin');
      try {
        await fs.mkdir(path.dirname(futureBindDir), { recursive: true });
        await this.addLog(deploymentId, '✅ Can create node_modules structure');
      } catch (error: any) {
        await this.addLog(deploymentId, `❌ Cannot create node_modules structure: ${error.message}`);
        throw new Error(`Pre-install permission check failed: ${error.message}`);
      }
      
    } catch (error: any) {
      await this.addLog(deploymentId, `❌ Pre-install permission check failed: ${error.message}`);
      throw error;
    }
  }

  private async fixBinaryPermissions(deploymentId: string, projectDir: string): Promise<void> {
    const binDir = path.join(projectDir, 'node_modules', '.bin');
    
    await this.addLog(deploymentId, '🔧 Fixing binary permissions...');
    
    try {
      const binDirExists = await fs.access(binDir).then(() => true).catch(() => false);
      
      if (!binDirExists) {
        await this.addLog(deploymentId, '⚠️ No node_modules/.bin directory found');
        return;
      }

      // Check if we can access the directory first
      try {
        await fs.readdir(binDir);
        await this.addLog(deploymentId, '✅ Can access .bin directory');
      } catch (error: any) {
        await this.addLog(deploymentId, `❌ Cannot access .bin directory: ${error.message}`);
        await this.runCommand(deploymentId, 'chmod', ['755', binDir], projectDir);
      }

      // Method 1: Use chmod to make the entire .bin directory executable
      const chmodResult = await this.runCommand(deploymentId, 'chmod', ['-R', '755', binDir], projectDir);
      if (!chmodResult.success) {
        await this.addLog(deploymentId, `⚠️ chmod command failed: ${chmodResult.output}`);
      }
      
      // Method 2: Fix individual files
      const binFiles = await fs.readdir(binDir);
      await this.addLog(deploymentId, `📋 Found ${binFiles.length} files in .bin directory`);
      
      let fixedCount = 0;
      for (const file of binFiles) {
        try {
          const filePath = path.join(binDir, file);
          const stats = await fs.stat(filePath);
          
          if (stats.isFile()) {
            await fs.chmod(filePath, 0o755);
            fixedCount++;
          }
        } catch (error: any) {
          await this.addLog(deploymentId, `⚠️ Failed to fix ${file}: ${error.message}`);
        }
      }
      
      await this.addLog(deploymentId, `✅ Fixed permissions for ${fixedCount}/${binFiles.length} files`);
      
      // Verify key executables
      await this.verifyExecutable(deploymentId, projectDir, 'vite');
      await this.verifyExecutable(deploymentId, projectDir, 'react-router');
      
    } catch (error: any) {
      await this.addLog(deploymentId, `❌ Permission fixing failed: ${error.message}`);
    }
  }

  private async verifyExecutable(deploymentId: string, projectDir: string, executableName: string): Promise<void> {
    const executablePath = path.join(projectDir, 'node_modules', '.bin', executableName);
    
    try {
      const exists = await fs.access(executablePath).then(() => true).catch(() => false);
      if (!exists) {
        await this.addLog(deploymentId, `⚠️ ${executableName} executable not found`);
        return;
      }
      
      const stats = await fs.stat(executablePath);
      const isExecutable = !!(stats.mode & parseInt('111', 8));
      
      if (isExecutable) {
        await this.addLog(deploymentId, `✅ ${executableName} is executable`);
      } else {
        await this.addLog(deploymentId, `❌ ${executableName} is not executable`);
        await fs.chmod(executablePath, 0o755);
        await this.addLog(deploymentId, `🔧 Fixed ${executableName} permissions`);
      }
      
    } catch (error: any) {
      await this.addLog(deploymentId, `⚠️ ${executableName} verification failed: ${error.message}`);
    }
  }

  private async runPostInstallScripts(deploymentId: string, projectDir: string, packageManager: string): Promise<void> {
    try {
      const packageJsonPath = path.join(projectDir, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      
      if (packageJson.scripts?.postinstall) {
        await this.addLog(deploymentId, '🔧 Running postinstall script...');
        
        const result = await this.runCommand(deploymentId, packageManager, ['run', 'postinstall'], projectDir);
        
        if (result.success) {
          await this.addLog(deploymentId, '✅ Postinstall script completed successfully');
        } else {
          await this.addLog(deploymentId, '⚠️ Postinstall script failed, but continuing...');
        }
      }
    } catch (error: any) {
      await this.addLog(deploymentId, `⚠️ Postinstall script check failed: ${error.message}`);
    }
  }

  private isHarmlessWarning(output: string): boolean {
    const harmlessPatterns = [
      /^npm WARN/,
      /^npm warn/,
      /deprecated/i,
      /ERESOLVE/,
      /overriding peer dependency/i
    ];
    
    return harmlessPatterns.some(pattern => pattern.test(output));
  }

  private async runCommand(deploymentId: string, command: string, args: string[], cwd: string): Promise<{success: boolean, output: string}> {
    return new Promise((resolve) => {
      const process = spawn(command, args, {
        cwd,
        stdio: 'pipe',
        shell: true
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
      const deploymentEnv = { 
        ...process.env,
        NODE_ENV: 'production',
        PATH: `${projectDir}/node_modules/.bin:${process.env.PATH}:/usr/src/app/node_modules/.bin:/home/worker/.bun/bin`,
        SST_DEBUG: '1',
        BUN_INSTALL: '/home/worker/.bun',
        BUN_CONFIG_NO_CLEAR_TERMINAL: 'true',
        BUN_CONFIG_SILENT: 'false',
        BUN_CONFIG_NO_PROGRESS: 'false',
        NODE_OPTIONS: '--dns-result-order=ipv4first',
        NODE_MAX_OLD_SPACE_SIZE: '2048',
        PULUMI_DEBUG_GRPC: '1',
        PULUMI_SKIP_UPDATE_CHECK: 'true'
      };

      const sstProcess = spawn('npx', ['sst', 'deploy', '--stage', stage, '--verbose'], {
        cwd: projectDir,
        stdio: 'pipe',
        env: deploymentEnv
      });

      sstProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        if (output.trim()) {
          output.split('\n').forEach((line: string) => {
            if (line.trim()) {
              this.addLog(deploymentId, `[SST] ${line.trim()}`);
            }
          });
        }
      });

      sstProcess.stderr?.on('data', (data) => {
        const output = data.toString();
        if (output.trim()) {
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
          
          await this.captureSSTLogs(deploymentId);
          await this.capturePulumiEventLogs(deploymentId);
          
          reject(new Error(error));
        }
      });

      sstProcess.on('error', async (error) => {
        await this.addLog(deploymentId, `❌ SST process error: ${error.message}`);
        reject(error);
      });

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
      
      const sstDirExists = await fs.access(path.join(projectDir, '.sst')).then(() => true).catch(() => false);
      if (!sstDirExists) {
        await this.addLog(deploymentId, '⚠️ No .sst directory found');
        return;
      }
      
      const logDirExists = await fs.access(sstLogDir).then(() => true).catch(() => false);
      if (!logDirExists) {
        await this.addLog(deploymentId, '⚠️ No .sst/log directory found');
        return;
      }
      
      const logFiles = await fs.readdir(sstLogDir);
      await this.addLog(deploymentId, `📋 Found log files: ${logFiles.join(', ')}`);
      
      const sstLogFile = path.join(sstLogDir, 'sst.log');
      const sstLogExists = await fs.access(sstLogFile).then(() => true).catch(() => false);
      
      if (sstLogExists) {
        const sstLogContent = await fs.readFile(sstLogFile, 'utf-8');
        await this.addLog(deploymentId, '📋 === SST LOG CONTENT START ===');
        
        const logLines = sstLogContent.split('\n');
        const recentLines = logLines.slice(-100);
        
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
      
      const pulumiDirExists = await fs.access(pulumiDir).then(() => true).catch(() => false);
      if (!pulumiDirExists) {
        await this.addLog(deploymentId, '⚠️ No .sst/pulumi directory found');
        return;
      }
      
      const pulumiDirs = await fs.readdir(pulumiDir);
      const updateDirs = pulumiDirs.filter(dir => dir.length > 10);
      
      if (updateDirs.length === 0) {
        await this.addLog(deploymentId, '⚠️ No Pulumi update directories found');
        return;
      }
      
      const latestUpdateDir = updateDirs[updateDirs.length - 1];
      const eventLogPath = path.join(pulumiDir, latestUpdateDir, 'eventlog.json');
      
      await this.addLog(deploymentId, `📋 Checking for eventlog: ${eventLogPath}`);
      
      const eventLogExists = await fs.access(eventLogPath).then(() => true).catch(() => false);
      
      if (eventLogExists) {
        const eventLogContent = await fs.readFile(eventLogPath, 'utf-8');
        await this.addLog(deploymentId, '📋 === PULUMI EVENT LOG START ===');
        
        const events = eventLogContent.split('\n').filter(line => line.trim());
        const importantEvents = events.filter(line => {
          try {
            const event = JSON.parse(line);
            return event.diagEvent || event.resOpFailedEvent || event.engineEvent;
          } catch {
            return false;
          }
        });
        
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
      const { data: deployment } = await this.supabase
        .from('deployments')
        .select('logs')
        .eq('id', deploymentId)
        .single();

      const currentLogs = deployment?.logs || '';
      const newLogs = currentLogs ? `${currentLogs}\n${logEntry}` : logEntry;

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
