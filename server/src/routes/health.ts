
import express from 'express';

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Keight AI Backend'
  });
});

export { router as healthRoutes };
