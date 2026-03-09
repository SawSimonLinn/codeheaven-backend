import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/token.service';

export interface AuthRequest extends Request {
  adminEmail?: string;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.chs_admin_session as string | undefined;

  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Session expired or invalid' });
    return;
  }

  req.adminEmail = payload.email;
  next();
}
