
import express from 'express';
import { DeploymentService } from '../services/deploymentService';

const router = express.Router();
const deploymentService = new DeploymentService();

router.post('/start', async (req, res) => {
  try {
    const { repoUrl, branch = 'main', stage = 'production' } = req.body;

    if (!repoUrl) {
      return res.status(400).json({ error: 'Repository URL is required' });
    }

    const deploymentId = await deploymentService.startDeployment({
      repoUrl,
      branch,
      stage
    });

    res.json({ 
      deploymentId,
      status: 'started',
      message: 'Deployment process initiated'
    });
  } catch (error: any) {
    console.error('Deployment start error:', error);
    res.status(500).json({ 
      error: 'Failed to start deployment',
      message: error.message 
    });
  }
});

router.get('/status/:deploymentId', async (req, res) => {
  try {
    const { deploymentId } = req.params;
    const status = await deploymentService.getDeploymentStatus(deploymentId);
    
    res.json(status);
  } catch (error: any) {
    console.error('Status check error:', error);
    res.status(500).json({ 
      error: 'Failed to get deployment status',
      message: error.message 
    });
  }
});

export { router as deploymentRoutes };
