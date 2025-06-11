
import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import simpleGit from 'simple-git';

interface DeploymentConfig {
  repoUrl: string;
  branch: string;
  stage: string;
}

interface DeploymentStatus {
  id: string;
  status: 'pending' | 'cloning' | 'deploying' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  error?: string;
  logs: string[];
  config: DeploymentConfig;
}

class DeploymentService {
  private deployments = new Map<string, DeploymentStatus>();
  private workspaceDir = process.env.WORKSPACE_DIR || '/tmp/deployments';

  constructor() {
    // Ensure workspace directory exists
    this.ensureWorkspaceDir();
  }

  private async ensureWorkspaceDir() {
    try {
      await fs.mkdir(this.workspaceDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create workspace directory:', error);
    }
  }

  async startDeployment(config: DeploymentConfig): Promise<string> {
    const deploymentId = uuidv4();
    const deployment: DeploymentStatus = {
      id: deploymentId,
      status: 'pending',
      startTime: new Date(),
      logs: [],
      config
    };

    this.deployments.set(deploymentId, deployment);

    // Start deployment in background
    this.executeDeployment(deploymentId).catch(error => {
      console.error(`Deployment ${deploymentId} failed:`, error);
      this.updateDeploymentStatus(deploymentId, 'failed', error.message);
    });

    return deploymentId;
  }

  private async executeDeployment(deploymentId: string) {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) throw new Error('Deployment not found');

    try {
      // Step 1: Clone repository
      this.updateDeploymentStatus(deploymentId, 'cloning');
      await this.cloneRepository(deploymentId, deployment.config);

      // Step 2: Run SST deployment
      this.updateDeploymentStatus(deploymentId, 'deploying');
      await this.runSSTDeploy(deploymentId, deployment.config);

      // Step 3: Complete
      this.updateDeploymentStatus(deploymentId, 'completed');
    } catch (error: any) {
      this.updateDeploymentStatus(deploymentId, 'failed', error.message);
      throw error;
    }
  }

  private async cloneRepository(deploymentId: string, config: DeploymentConfig) {
    const projectDir = path.join(this.workspaceDir, deploymentId);
    
    this.addLog(deploymentId, `Cloning repository: ${config.repoUrl}`);
    this.addLog(deploymentId, `Branch: ${config.branch}`);

    const git = simpleGit();
    await git.clone(config.repoUrl, projectDir, ['--branch', config.branch, '--single-branch']);
    
    this.addLog(deploymentId, 'Repository cloned successfully');
  }

  private async runSSTDeploy(deploymentId: string, config: DeploymentConfig): Promise<void> {
    const projectDir = path.join(this.workspaceDir, deploymentId);
    
    this.addLog(deploymentId, 'Starting SST deployment...');
    this.addLog(deploymentId, `Stage: ${config.stage}`);

    return new Promise((resolve, reject) => {
      const sstProcess = spawn('npx', ['sst', 'deploy', '--stage', config.stage], {
        cwd: projectDir,
        stdio: 'pipe',
        env: { ...process.env }
      });

      sstProcess.stdout?.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          this.addLog(deploymentId, `[SST] ${output}`);
        }
      });

      sstProcess.stderr?.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          this.addLog(deploymentId, `[SST ERROR] ${output}`);
        }
      });

      sstProcess.on('close', (code) => {
        if (code === 0) {
          this.addLog(deploymentId, 'SST deployment completed successfully');
          resolve();
        } else {
          const error = `SST deployment failed with exit code ${code}`;
          this.addLog(deploymentId, error);
          reject(new Error(error));
        }
      });

      sstProcess.on('error', (error) => {
        this.addLog(deploymentId, `SST process error: ${error.message}`);
        reject(error);
      });
    });
  }

  private updateDeploymentStatus(deploymentId: string, status: DeploymentStatus['status'], error?: string) {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) return;

    deployment.status = status;
    if (error) deployment.error = error;
    if (status === 'completed' || status === 'failed') {
      deployment.endTime = new Date();
    }

    this.deployments.set(deploymentId, deployment);
  }

  private addLog(deploymentId: string, message: string) {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) return;

    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    deployment.logs.push(logEntry);
    console.log(`[${deploymentId}] ${message}`);
  }

  getDeploymentStatus(deploymentId: string): DeploymentStatus | undefined {
    return this.deployments.get(deploymentId);
  }

  getDeploymentLogs(deploymentId: string): string[] | undefined {
    const deployment = this.deployments.get(deploymentId);
    return deployment?.logs;
  }
}

export const deploymentService = new DeploymentService();
