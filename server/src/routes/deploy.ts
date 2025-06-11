
import express from 'express';
import { deploymentService } from '../services/deploymentService';

const router = express.Router();

// Start deployment
router.post('/start', async (req, res) => {
  try {
    const { repoUrl, branch = 'main', stage = 'production' } = req.body;

    if (!repoUrl) {
      return res.status(400).json({ error: 'Repository URL is required' });
    }

    console.log(`Starting deployment for: ${repoUrl}, branch: ${branch}, stage: ${stage}`);

    const deploymentId = await deploymentService.startDeployment({
      repoUrl,
      branch,
      stage
    });

    res.json({ 
      deploymentId,
      status: 'started',
      message: 'Deployment initiated successfully'
    });
  } catch (error: any) {
    console.error('Deployment start error:', error);
    res.status(500).json({ 
      error: 'Failed to start deployment',
      message: error.message 
    });
  }
});

// Get deployment status
router.get('/status/:deploymentId', (req, res) => {
  try {
    const { deploymentId } = req.params;
    const status = deploymentService.getDeploymentStatus(deploymentId);

    if (!status) {
      return res.status(404).json({ error: 'Deployment not found' });
    }

    res.json(status);
  } catch (error: any) {
    console.error('Status check error:', error);
    res.status(500).json({ 
      error: 'Failed to get deployment status',
      message: error.message 
    });
  }
});

// Get deployment logs
router.get('/logs/:deploymentId', (req, res) => {
  try {
    const { deploymentId } = req.params;
    const logs = deploymentService.getDeploymentLogs(deploymentId);

    if (!logs) {
      return res.status(404).json({ error: 'Deployment logs not found' });
    }

    res.json({ logs });
  } catch (error: any) {
    console.error('Logs fetch error:', error);
    res.status(500).json({ 
      error: 'Failed to get deployment logs',
      message: error.message 
    });
  }
});

export default router;
