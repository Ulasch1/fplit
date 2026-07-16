import { Router, Request, Response } from 'express';
import { checkDbConnection } from '../db';

const router = Router();

router.get('/health', async (_req: Request, res: Response) => {
  const dbAlive = await checkDbConnection();

  if (dbAlive) {
    res.status(200).json({
      status: 'ok',
      db: 'connected',
      timestamp: new Date().toISOString(),
    });
  } else {
    res.status(503).json({
      status: 'error',
      db: 'disconnected',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
