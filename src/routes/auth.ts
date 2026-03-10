import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { createToken, verifyToken } from '../services/token.service';
import { requireAuth, AuthRequest } from '../middleware/auth';

export const authRouter = Router();

const COOKIE_NAME = 'chs_admin_session';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

function setSessionCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });
}

// POST /api/admin/auth/login
authRouter.post('/login', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const admin = await prisma.adminUser.findUnique({ where: { email } });

    if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = createToken(admin.email);
    setSessionCookie(res, token);

    // Fire-and-forget audit log
    void logAudit(req, { event: 'login', email: admin.email });

    res.json({ user: { email: admin.email, name: admin.name } });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/auth/logout
authRouter.post('/logout', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  void logAudit(req, { event: 'logout', email: req.adminEmail ?? '' });

  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ success: true });
});

// GET /api/admin/auth/session
authRouter.get('/session', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = req.cookies?.[COOKIE_NAME] as string | undefined;

    if (!token) {
      res.status(401).json({ error: 'No session' });
      return;
    }

    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Session expired or invalid' });
      return;
    }

    const admin = await prisma.adminUser.findUnique({ where: { email: payload.email } });
    if (!admin) {
      res.status(401).json({ error: 'Admin not found' });
      return;
    }

    res.json({ user: { email: admin.email, name: admin.name } });
  } catch (err) {
    next(err);
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function logAudit(
  req: Request,
  extra: { event: string; email: string },
): Promise<void> {
  try {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress ??
      '';

    await prisma.auditLog.create({
      data: {
        event: extra.event,
        email: extra.email,
        path: req.path,
        ip,
        userAgent: req.headers['user-agent'] ?? '',
        deviceType: (req.body as Record<string, string>).deviceType ?? 'desktop',
        browser: (req.body as Record<string, string>).browser ?? '',
        os: (req.body as Record<string, string>).os ?? '',
        city: (req.body as Record<string, string>).city ?? '',
        region: (req.body as Record<string, string>).region ?? '',
        country: (req.body as Record<string, string>).country ?? '',
      },
    });
  } catch (err) {
    console.error('[audit] failed to write login/logout audit log:', err);
  }
}
