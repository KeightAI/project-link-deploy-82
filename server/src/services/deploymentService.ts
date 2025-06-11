
import { simpleGit } from 'simple-git';
import fs from 'fs-extra';
import path from 'path';
import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';

export interface DeploymentRequest {
  repoUrl: string;
  branch: string;
  stage: string;
}

export interface DeploymentStatus {
  id: string;
  status: 'pending' | 'cloning' | 'configuring' | 'deploying' | 'completed' | 'failed';
  progress: number;
  logs: string[];
  error?: string;
}

export class DeploymentService {
  private deployments = new Map<string, DeploymentStatus>();
  private workspaceDir = process.env.WORKSPACE_DIR || '/tmp/deployments';

  constructor() {
    // Ensure workspace directory exists
    fs.ensureDirSync(this.workspaceDir);
  }

  async startDeployment(request: DeploymentRequest): Promise<string> {
    const deploymentId = uuidv4();
    
    const deployment: DeploymentStatus = {
      id: deploymentId,
      status: 'pending',
      progress: 0,
      logs: []
    };

    this.deployments.set(deploymentId, deployment);

    // Start deployment process asynchronously
    this.runDeployment(deploymentId, request).catch(error => {
      console.error(`Deployment ${deploymentId} failed:`, error);
      const deployment = this.deployments.get(deploymentId);
      if (deployment) {
        deployment.status = 'failed';
        deployment.error = error.message;
        deployment.logs.push(`ERROR: ${error.message}`);
      }
    });

    return deploymentId;
  }

  async getDeploymentStatus(deploymentId: string): Promise<DeploymentStatus | null> {
    return this.deployments.get(deploymentId) || null;
  }

  private async runDeployment(deploymentId: string, request: DeploymentRequest): Promise<void> {
    const deployment = this.deployments.get(deploymentId)!;
    const projectDir = path.join(this.workspaceDir, deploymentId);

    try {
      // Step 1: Clone repository
      deployment.status = 'cloning';
      deployment.progress = 10;
      deployment.logs.push(`Cloning repository: ${request.repoUrl}`);

      const git = simpleGit();
      await git.clone(request.repoUrl, projectDir, ['--branch', request.branch]);
      
      deployment.progress = 30;
      deployment.logs.push('Repository cloned successfully');

      // Step 2: Generate SST config
      deployment.status = 'configuring';
      deployment.progress = 50;
      deployment.logs.push('Generating SST configuration...');

      await this.generateSSTConfig(projectDir, request.stage);
      
      deployment.progress = 70;
      deployment.logs.push('SST configuration generated');

      // Step 3: Deploy with SST
      deployment.status = 'deploying';
      deployment.progress = 80;
      deployment.logs.push(`Deploying to stage: ${request.stage}`);

      await this.deploySSTProject(projectDir, request.stage, deployment);
      
      deployment.status = 'completed';
      deployment.progress = 100;
      deployment.logs.push('Deployment completed successfully!');

    } catch (error: any) {
      deployment.status = 'failed';
      deployment.error = error.message;
      deployment.logs.push(`ERROR: ${error.message}`);
      throw error;
    }
  }

  private async generateSSTConfig(projectDir: string, stage: string): Promise<void> {
    // For now, create a basic SST config
    // This will be manually generated for testing as requested
    const sstConfig = `
import { SSTConfig } from "sst";
import { NextjsSite } from "sst/constructs";

export default {
  config(_input) {
    return {
      name: "keight-ai-app",
      region: "us-east-1",
    };
  },
  stacks(app) {
    app.stack(function Site({ stack }) {
      const site = new NextjsSite(stack, "site", {
        path: "./",
        buildCommand: "npm run build",
      });

      stack.addOutputs({
        SiteUrl: site.url,
      });
    });
  },
} satisfies SSTConfig;
`;

    const configPath = path.join(projectDir, 'sst.config.ts');
    await fs.writeFile(configPath, sstConfig.trim());

    // Also create package.json scripts if they don't exist
    const packageJsonPath = path.join(projectDir, 'package.json');
    if (await fs.pathExists(packageJsonPath)) {
      const packageJson = await fs.readJson(packageJsonPath);
      if (!packageJson.scripts) {
        packageJson.scripts = {};
      }
      if (!packageJson.scripts.deploy) {
        packageJson.scripts.deploy = `npx sst deploy --stage ${stage}`;
      }
      await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });
    }
  }

  private async deploySSTProject(projectDir: string, stage: string, deployment: DeploymentStatus): Promise<void> {
    return new Promise((resolve, reject) => {
      const deployProcess = spawn('npx', ['sst', 'deploy', '--stage', stage], {
        cwd: projectDir,
        stdio: 'pipe',
        env: {
          ...process.env,
          AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
          AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
          AWS_REGION: process.env.AWS_REGION || 'us-east-1'
        }
      });

      deployProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        deployment.logs.push(`STDOUT: ${output}`);
        console.log(`Deployment ${deployment.id} stdout:`, output);
      });

      deployProcess.stderr?.on('data', (data) => {
        const output = data.toString();
        deployment.logs.push(`STDERR: ${output}`);
        console.error(`Deployment ${deployment.id} stderr:`, output);
      });

      deployProcess.on('close', (code) => {
        if (code === 0) {
          deployment.logs.push('SST deployment completed successfully');
          resolve();
        } else {
          reject(new Error(`SST deploy process exited with code ${code}`));
        }
      });

      deployProcess.on('error', (error) => {
        reject(new Error(`Failed to start SST deploy process: ${error.message}`));
      });
    });
  }
}
