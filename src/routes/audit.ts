import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

export const auditRouter = Router();

function toApiFormat(log: {
  id: string;
  createdAt: Date;
  event: string;
  email: string;
  path: string;
  ip: string;
  userAgent: string;
  deviceType: string;
  browser: string;
  os: string;
  city: string;
  region: string;
  country: string;
}) {
  return {
    $id: log.id,
    $createdAt: log.createdAt.toISOString(),
    event: log.event,
    email: log.email,
    path: log.path,
    ip: log.ip,
    userAgent: log.userAgent,
    deviceType: log.deviceType,
    browser: log.browser,
    os: log.os,
    city: log.city,
    region: log.region,
    country: log.country,
  };
}

// ── GET /api/admin/audit ──────────────────────────────────────────────────────
auditRouter.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rawLimit = parseInt((req.query.limit as string) ?? '50', 10);
    const limit = Math.min(Math.max(isNaN(rawLimit) ? 50 : rawLimit, 1), 200);

    const [logs, total] = await prisma.$transaction([
      prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit }),
      prisma.auditLog.count(),
    ]);

    res.json({ documents: logs.map(toApiFormat), total });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/admin/audit ─────────────────────────────────────────────────────
auditRouter.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = req.body as {
      event?: string;
      email?: string;
      path?: string;
      ip?: string;
      userAgent?: string;
      deviceType?: string;
      browser?: string;
      os?: string;
      city?: string;
      region?: string;
      country?: string;
    };

    if (!body.event || !body.email) {
      res.status(400).json({ error: 'event and email are required' });
      return;
    }

    const log = await prisma.auditLog.create({
      data: {
        id: uuidv4(),
        event: body.event,
        email: body.email,
        path: body.path ?? '',
        ip: body.ip ?? '',
        userAgent: body.userAgent ?? '',
        deviceType: body.deviceType ?? 'desktop',
        browser: body.browser ?? '',
        os: body.os ?? '',
        city: body.city ?? '',
        region: body.region ?? '',
        country: body.country ?? '',
      },
    });

    res.status(201).json(toApiFormat(log));
  } catch (err) {
    next(err);
  }
});
