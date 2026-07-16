import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/jwt';

// Augment Express Request so that req.userId is available downstream
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * Express middleware that requires a valid Bearer token.
 * On success sets req.userId and calls next().
 * On failure responds with 401.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  const token = authHeader.slice(7); // strip "Bearer "

  try {
    const payload = verifyToken(token);
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }
}
