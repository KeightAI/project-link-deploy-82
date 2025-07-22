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
  private signalHandlers: Map<string, () => void> = new Map();

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
    
    // Set up signal handlers with proper error handling
    await this.setupSignalHandlers(id);
    
    try {
      // Update status to processing
      await this.updateDeploymentStatus(id, 'cloning');
      
      // Step 1: Clone repository
      await this.cloneRepository(id, repo_url, branch || 'main');
      
      // Step 2: Run pre-deployment checks
      await this.preDeploymentChecks(id);
      
      // Step 3: Project setup complete
      
      // Step 4: Install dependencies with permission fixes
      await this.updateDeploymentStatus(id, 'installing');
      await this.installDependenciesWithPermissionFix(id);
      
      // Step 4: Install SST platform
      await this.updateDeploymentStatus(id, 'preparing');
      await this.installSSTPlat(id);
      
      // Step 5: Run SST deployment
      await this.updateDeploymentStatus(id, 'deploying');
      await this.runSSTDeploy(id, stage || 'production');
      
      // Step 6: Extract deployed URL and complete
      await this.extractAndUpdateDeployedUrl(id);
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
      // Cleanup signal handlers
      await this.cleanupSignalHandlers();
      
      // Cleanup workspace
      await this.cleanup(id);
    }
  }

  private async setupSignalHandlers(deploymentId: string): Promise<void> {
    try {
      // Clear any existing handlers first
      await this.cleanupSignalHandlers();
      
      // Define the signal handler function
      const signalHandler = async (signal: string) => {
        console.log(`Received ${signal}, marking deployment ${deploymentId} as failed`);
        try {
          await this.updateDeploymentStatus(deploymentId, 'failed');
          await this.addLog(deploymentId, `Deployment failed: Process killed by ${signal} ❌`);
          await this.cleanup(deploymentId);
        } catch (error) {
          console.error(`Error handling ${signal}:`, error);
        }
        process.exit(1);
      };
      
      // Only handle catchable signals (SIGKILL cannot be caught)
      const signalsToHandle = ['SIGTERM', 'SIGINT'];
      
      for (const signal of signalsToHandle) {
        try {
          const handler = () => signalHandler(signal);
          this.signalHandlers.set(signal, handler);
          process.on(signal, handler);
        } catch (error) {
          console.warn(`Failed to set up ${signal} handler:`, error);
          // Continue with other signals even if one fails
        }
      }
      
    } catch (error) {
      console.warn('Failed to set up signal handlers:', error);
      // Don't throw here - signal handling is a nice-to-have, not critical
    }
  }

  private async cleanupSignalHandlers(): Promise<void> {
    try {
      for (const [signal, handler] of this.signalHandlers.entries()) {
        try {
          process.removeListener(signal, handler);
        } catch (error) {
          console.warn(`Failed to remove ${signal} listener:`, error);
        }
      }
      this.signalHandlers.clear();
    } catch (error) {
      console.warn('Failed to cleanup signal handlers:', error);
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
      
      // Check for package.json and analyze build configuration
      if (files.includes('package.json')) {
        await this.addLog(deploymentId, '✅ package.json found');
        await this.analyzeBuildConfiguration(deploymentId, projectDir);
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

  private async analyzeBuildConfiguration(deploymentId: string, projectDir: string): Promise<void> {
    try {
      const packageJson = JSON.parse(await fs.readFile(path.join(projectDir, 'package.json'), 'utf-8'));
      await this.addLog(deploymentId, `📦 Project name: ${packageJson.name || 'Unknown'}`);
      
      // Check SST version
      if (packageJson.dependencies?.sst) {
        await this.addLog(deploymentId, `📦 SST version: ${packageJson.dependencies.sst}`);
      }
      
      // Analyze React Router setup
      const reactRouterDeps = {
        v6: packageJson.dependencies?.['react-router-dom'],
        v7Dev: packageJson.dependencies?.['@react-router/dev'] || packageJson.devDependencies?.['@react-router/dev'],
        v7Runtime: packageJson.dependencies?.['@react-router/node'] || packageJson.dependencies?.['@react-router/cloudflare']
      };
      
      if (reactRouterDeps.v7Dev || reactRouterDeps.v7Runtime) {
        await this.addLog(deploymentId, '📦 Detected React Router v7 setup');
        if (reactRouterDeps.v7Dev) {
          await this.addLog(deploymentId, `📦 @react-router/dev: ${reactRouterDeps.v7Dev}`);
        }
      } else if (reactRouterDeps.v6) {
        await this.addLog(deploymentId, `📦 Detected React Router v6: ${reactRouterDeps.v6}`);
      }
      
      // Check build scripts
      if (packageJson.scripts?.build) {
        await this.addLog(deploymentId, `🔧 Build script: ${packageJson.scripts.build}`);
        
        // Analyze build command for potential issues
        const buildScript = packageJson.scripts.build;
        if (buildScript.includes('@react-router/cli')) {
          await this.addLog(deploymentId, '⚠️ Build script uses @react-router/cli which may not exist');
          await this.addLog(deploymentId, '🔧 Will attempt build command correction during SST setup');
        } else if (buildScript.includes('react-router')) {
          await this.addLog(deploymentId, '✅ Build script uses standard React Router build approach');
        } else if (buildScript.includes('vite build')) {
          await this.addLog(deploymentId, '✅ Build script uses Vite (standard approach)');
        }
      } else {
        await this.addLog(deploymentId, '⚠️ No build script found in package.json');
      }
      
      // Check for vite config
      const viteConfigExists = await fs.access(path.join(projectDir, 'vite.config.ts'))
        .then(() => true)
        .catch(() => fs.access(path.join(projectDir, 'vite.config.js')))
        .then(() => true)
        .catch(() => false);
      
      if (viteConfigExists) {
        await this.addLog(deploymentId, '✅ Vite config found');
      } else {
        await this.addLog(deploymentId, '⚠️ No Vite config found');
      }
      
    } catch (error: any) {
      await this.addLog(deploymentId, `⚠️ Could not analyze build configuration: ${error.message}`);
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
      // Determine package manager and check for React Router v7
      const files = await fs.readdir(projectDir);
      const hasReactRouterV7 = await this.detectReactRouterV7(deploymentId, projectDir);
      
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
        
        // Add --legacy-peer-deps for React Router v7 projects to handle version conflicts
        if (hasReactRouterV7) {
          installCommand.push('--legacy-peer-deps');
          await this.addLog(deploymentId, '🔧 Adding --legacy-peer-deps flag for React Router v7 compatibility');
        }
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

  private async detectReactRouterV7(deploymentId: string, projectDir: string): Promise<boolean> {
    try {
      const packageJsonPath = path.join(projectDir, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      
      // Check for React Router v7 packages
      const hasReactRouterDev = packageJson.dependencies?.['@react-router/dev'] || packageJson.devDependencies?.['@react-router/dev'];
      const hasReactRouterNode = packageJson.dependencies?.['@react-router/node'];
      const hasReactRouterServe = packageJson.dependencies?.['@react-router/serve'];
      const hasReactRouter7 = packageJson.dependencies?.['react-router'] && packageJson.dependencies['react-router'].startsWith('^7');
      
      const isReactRouterV7 = !!(hasReactRouterDev || hasReactRouterNode || hasReactRouterServe || hasReactRouter7);
      
      if (isReactRouterV7) {
        await this.addLog(deploymentId, '📋 Detected React Router v7 project');
      }
      
      return isReactRouterV7;
    } catch (error: any) {
      await this.addLog(deploymentId, `⚠️ Could not detect React Router version: ${error.message}`);
      return false;
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
    
    // Project ready for SST install

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

  private async extractAndUpdateDeployedUrl(deploymentId: string): Promise<void> {
    try {
      // Get the current logs to extract the deployed URL
      const { data: deployment } = await this.supabase
        .from('deployments')
        .select('logs, repo_url')
        .eq('id', deploymentId)
        .single();

      if (!deployment?.logs) {
        await this.addLog(deploymentId, '⚠️ No logs found to extract deployed URL');
        return;
      }

      // Extract URL from logs using regex to match pattern like "MyWeb: https://..."
      const urlRegex = /\[SST\]\s+\w+:\s+(https?:\/\/[^\s]+)/g;
      const matches = [...deployment.logs.matchAll(urlRegex)];
      
      if (matches.length > 0) {
        const deployedUrl = matches[matches.length - 1][1]; // Get the last URL found
        await this.addLog(deploymentId, `🔗 Extracted deployed URL: ${deployedUrl}`);
        
        // Update the projects table with the deployed URL
        const { error: projectError } = await this.supabase
          .from('projects')
          .update({ 
            deployed_url: deployedUrl,
            is_deployed: true,
            updated_at: new Date().toISOString()
          })
          .eq('github_repo_url', deployment.repo_url);

        if (projectError) {
          await this.addLog(deploymentId, `❌ Failed to update project with deployed URL: ${projectError.message}`);
        } else {
          await this.addLog(deploymentId, '✅ Project updated with deployed URL');
        }
      } else {
        await this.addLog(deploymentId, '⚠️ No deployed URL found in logs');
      }
    } catch (error: any) {
      await this.addLog(deploymentId, `❌ Failed to extract deployed URL: ${error.message}`);
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

  private async checkNodeVersion(deploymentId: string): Promise<{ version: string, isCompatible: boolean }> {
    try {
      const result = await this.runCommand(deploymentId, 'node', ['--version'], '/tmp');
      const version = result.output.trim();
      const majorVersion = parseInt(version.replace('v', '').split('.')[0]);
      const isCompatible = majorVersion >= 20;
      
      await this.addLog(deploymentId, `📋 Node.js version: ${version} (Compatible with React Router v7: ${isCompatible})`);
      
      return { version, isCompatible };
    } catch (error: any) {
      await this.addLog(deploymentId, `⚠️ Could not determine Node.js version: ${error.message}`);
      return { version: 'unknown', isCompatible: false };
    }
  }

  private async fixBuildConfiguration(deploymentId: string, projectDir: string): Promise<void> {
    await this.addLog(deploymentId, '🔧 Checking and fixing build configuration...');
    
    try {
      const packageJsonPath = path.join(projectDir, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      
      let modified = false;
      
      // Check Node.js version compatibility
      const nodeVersionInfo = await this.checkNodeVersion(deploymentId);
      
      // Check what React Router version is actually installed
      const hasReactRouterDev = packageJson.dependencies?.['@react-router/dev'] || packageJson.devDependencies?.['@react-router/dev'];
      const hasReactRouterDom = packageJson.dependencies?.['react-router-dom'];
      const reactRouterVersion = packageJson.dependencies?.['react-router-dom'] || packageJson.devDependencies?.['react-router-dom'];
      
      await this.addLog(deploymentId, `📋 React Router detection: dev=${!!hasReactRouterDev}, dom=${!!hasReactRouterDom}, version=${reactRouterVersion}`);
      
      // Check if build script uses problematic @react-router/cli
      if (packageJson.scripts?.build?.includes('@react-router/cli')) {
        await this.addLog(deploymentId, '🔧 Fixing @react-router/cli build command...');
        
        if (hasReactRouterDev && nodeVersionInfo.isCompatible) {
          // Use @react-router/dev for v7 if Node.js is compatible
          packageJson.scripts.build = 'npx @react-router/dev build';
          await this.addLog(deploymentId, '✅ Updated build script to use @react-router/dev');
          modified = true;
        } else if (hasReactRouterDev && !nodeVersionInfo.isCompatible) {
          // Fallback to vite build if Node.js is not compatible with React Router v7
          packageJson.scripts.build = 'vite build';
          await this.addLog(deploymentId, '⚠️ Node.js version incompatible with React Router v7, using vite build fallback');
          modified = true;
        } else if (hasReactRouterDom) {
          // Fallback to vite build for v6
          packageJson.scripts.build = 'vite build';
          await this.addLog(deploymentId, '✅ Updated build script to use vite build');
          modified = true;
        } else {
          // No React Router detected, use vite build
          packageJson.scripts.build = 'vite build';
          await this.addLog(deploymentId, '✅ Updated build script to use vite build (no React Router detected)');
          modified = true;
        }
      }
      
      // Handle React Router v7 build command with Node.js compatibility check
      if (packageJson.scripts?.build?.includes('@react-router/dev') && !nodeVersionInfo.isCompatible) {
        await this.addLog(deploymentId, '⚠️ React Router v7 requires Node.js >=20, falling back to vite build');
        packageJson.scripts.build = 'vite build';
        modified = true;
      }
      
      // Ensure there's always a build script
      if (!packageJson.scripts?.build) {
        if (!packageJson.scripts) packageJson.scripts = {};
        packageJson.scripts.build = 'vite build';
        await this.addLog(deploymentId, '✅ Added missing build script: vite build');
        modified = true;
      }
      
      // Write back the modified package.json
      if (modified) {
        await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
        await this.addLog(deploymentId, '✅ package.json updated with corrected build configuration');
      } else {
        await this.addLog(deploymentId, '✅ Build configuration looks good, no changes needed');
      }
      
    } catch (error: any) {
      await this.addLog(deploymentId, `⚠️ Failed to fix build configuration: ${error.message}`);
      await this.addLog(deploymentId, '⚠️ Continuing with original configuration...');
    }
  }

  private async fixReactRouterV7Commands(deploymentId: string): Promise<void> {
    const projectDir = path.join(this.workspaceDir, deploymentId);
    
    try {
      const packageJsonPath = path.join(projectDir, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      
      let modified = false;
      
      // Remove @react-router/cli package as it doesn't exist
      if (packageJson.dependencies?.['@react-router/cli']) {
        delete packageJson.dependencies['@react-router/cli'];
        modified = true;
        await this.addLog(deploymentId, '🗑️ Removed non-existent @react-router/cli from dependencies');
      }
      
      if (packageJson.devDependencies?.['@react-router/cli']) {
        delete packageJson.devDependencies['@react-router/cli'];
        modified = true;
        await this.addLog(deploymentId, '🗑️ Removed non-existent @react-router/cli from devDependencies');
      }
      
      // Fix scripts that use React Router v7 CLI
      if (packageJson.scripts) {
        const scriptFixes = {
          'npx @react-router/cli build': 'npx @react-router/dev build',
          '@react-router/cli build': '@react-router/dev build',
          'react-router build': '@react-router/dev build',
          'npx @react-router/cli dev': 'npx @react-router/dev dev',
          '@react-router/cli dev': '@react-router/dev dev',
          'react-router dev': '@react-router/dev dev',
          'npx @react-router/cli typegen': 'npx @react-router/dev typegen',
          '@react-router/cli typegen': '@react-router/dev typegen',
          'react-router typegen': '@react-router/dev typegen',
          'react-router-serve': '@react-router/serve'
        };
        
        for (const [script, content] of Object.entries(packageJson.scripts)) {
          // Ensure content is a string
          if (typeof content !== 'string') continue;
          
          for (const [oldCmd, newCmd] of Object.entries(scriptFixes)) {
            if (content.includes(oldCmd)) {
              packageJson.scripts[script] = content.replace(oldCmd, newCmd);
              modified = true;
              await this.addLog(deploymentId, `🔧 Fixed script "${script}": ${oldCmd} → ${newCmd}`);
            }
          }
        }
      }
      
      if (modified) {
        await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
        await this.addLog(deploymentId, '✅ Updated package.json with React Router v7 fixes');
      }
    } catch (error: any) {
      await this.addLog(deploymentId, `⚠️ Could not fix React Router v7 commands: ${error.message}`);
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
