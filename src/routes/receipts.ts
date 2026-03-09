import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { generateReceiptPDF } from '../services/pdf.service';
import { sendReceiptEmail } from '../services/email.service';
import { v4 as uuidv4 } from 'uuid';

export const receiptsRouter = Router();

// All receipt routes require authentication
receiptsRouter.use(requireAuth);

// ── Helpers ───────────────────────────────────────────────────────────────────

function toApiFormat(r: {
  id: string;
  createdAt: Date;
  receiptNumber: string;
  clientName: string;
  clientEmail: string;
  companyName: string | null;
  issueDate: string;
  dueDate: string | null;
  items: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  notes: string;
  status: string;
}) {
  return {
    $id: r.id,
    $createdAt: r.createdAt.toISOString(),
    receiptNumber: r.receiptNumber,
    clientName: r.clientName,
    clientEmail: r.clientEmail,
    companyName: r.companyName ?? null,
    issueDate: r.issueDate,
    dueDate: r.dueDate ?? null,
    items: r.items,
    subtotal: r.subtotal,
    tax: r.tax,
    discount: r.discount,
    total: r.total,
    notes: r.notes,
    status: r.status,
  };
}

async function generateReceiptNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const counterName = `receipts-${year}`;

  const counter = await prisma.$transaction(async (tx) => {
    return tx.counter.upsert({
      where: { name: counterName },
      update: { count: { increment: 1 } },
      create: { id: uuidv4(), name: counterName, count: 1 },
    });
  });

  const padded = String(counter.count).padStart(4, '0');
  return `RCPT-${year}-${padded}`;
}

// ── GET /api/receipts ─────────────────────────────────────────────────────────
receiptsRouter.get('/', async (_req: AuthRequest, res: Response): Promise<void> => {
  const [receipts, total] = await prisma.$transaction([
    prisma.receipt.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.receipt.count(),
  ]);

  res.json({ documents: receipts.map(toApiFormat), total });
});

// ── POST /api/receipts ────────────────────────────────────────────────────────
receiptsRouter.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const body = req.body as {
    clientName?: string;
    clientEmail?: string;
    companyName?: string | null;
    issueDate?: string;
    dueDate?: string | null;
    items?: string;
    subtotal?: number;
    tax?: number;
    discount?: number;
    total?: number;
    notes?: string;
    status?: string;
  };

  if (!body.clientName || !body.clientEmail || !body.issueDate || body.subtotal === undefined || body.total === undefined) {
    res.status(400).json({ error: 'Missing required fields: clientName, clientEmail, issueDate, subtotal, total' });
    return;
  }

  const receiptNumber = await generateReceiptNumber();

  const receipt = await prisma.receipt.create({
    data: {
      id: uuidv4(),
      receiptNumber,
      clientName: body.clientName,
      clientEmail: body.clientEmail,
      companyName: body.companyName ?? null,
      issueDate: body.issueDate,
      dueDate: body.dueDate ?? null,
      items: body.items ?? '[]',
      subtotal: body.subtotal,
      tax: body.tax ?? 0,
      discount: body.discount ?? 0,
      total: body.total,
      notes: body.notes ?? '',
      status: body.status ?? 'draft',
    },
  });

  res.status(201).json(toApiFormat(receipt));
});

// ── GET /api/receipts/:id ─────────────────────────────────────────────────────
receiptsRouter.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const receipt = await prisma.receipt.findUnique({ where: { id: req.params.id } });

  if (!receipt) {
    res.status(404).json({ error: 'Receipt not found' });
    return;
  }

  res.json(toApiFormat(receipt));
});

// ── PUT /api/receipts/:id ─────────────────────────────────────────────────────
receiptsRouter.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const existing = await prisma.receipt.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ error: 'Receipt not found' });
    return;
  }

  const body = req.body as Partial<{
    clientName: string;
    clientEmail: string;
    companyName: string | null;
    issueDate: string;
    dueDate: string | null;
    items: string;
    subtotal: number;
    tax: number;
    discount: number;
    total: number;
    notes: string;
    status: string;
  }>;

  const updated = await prisma.receipt.update({
    where: { id: req.params.id },
    data: {
      ...(body.clientName !== undefined && { clientName: body.clientName }),
      ...(body.clientEmail !== undefined && { clientEmail: body.clientEmail }),
      ...(body.companyName !== undefined && { companyName: body.companyName }),
      ...(body.issueDate !== undefined && { issueDate: body.issueDate }),
      ...(body.dueDate !== undefined && { dueDate: body.dueDate }),
      ...(body.items !== undefined && { items: body.items }),
      ...(body.subtotal !== undefined && { subtotal: body.subtotal }),
      ...(body.tax !== undefined && { tax: body.tax }),
      ...(body.discount !== undefined && { discount: body.discount }),
      ...(body.total !== undefined && { total: body.total }),
      ...(body.notes !== undefined && { notes: body.notes }),
      ...(body.status !== undefined && { status: body.status }),
    },
  });

  res.json(toApiFormat(updated));
});

// ── DELETE /api/receipts/:id ──────────────────────────────────────────────────
receiptsRouter.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const existing = await prisma.receipt.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ error: 'Receipt not found' });
    return;
  }

  await prisma.receipt.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

// ── POST /api/receipts/:id/send-email ─────────────────────────────────────────
receiptsRouter.post('/:id/send-email', async (req: AuthRequest, res: Response): Promise<void> => {
  const receipt = await prisma.receipt.findUnique({ where: { id: req.params.id } });
  if (!receipt) {
    res.status(404).json({ error: 'Receipt not found' });
    return;
  }

  await sendReceiptEmail(receipt);

  const updated = await prisma.receipt.update({
    where: { id: req.params.id },
    data: { status: 'sent' },
  });

  res.json({ success: true, receipt: toApiFormat(updated) });
});

// ── GET /api/receipts/:id/pdf ─────────────────────────────────────────────────
receiptsRouter.get('/:id/pdf', async (req: AuthRequest, res: Response): Promise<void> => {
  const receipt = await prisma.receipt.findUnique({ where: { id: req.params.id } });
  if (!receipt) {
    res.status(404).json({ error: 'Receipt not found' });
    return;
  }

  const pdf = await generateReceiptPDF(receipt);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${receipt.receiptNumber}.pdf"`,
  );
  res.setHeader('Content-Length', pdf.length);
  res.send(pdf);
});
