import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import { authRouter } from './routes/auth';
import { receiptsRouter } from './routes/receipts';
import { auditRouter } from './routes/audit';
import { errorHandler } from './middleware/errorHandler';

export const app = express();

// ── Security & parsing ────────────────────────────────────────────────────────
app.use(helmet());

const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (e.g. curl, Postman)
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: origin "${origin}" not allowed`));
    },
    credentials: true,
  }),
);

app.use(morgan('dev'));
app.use(express.json());
app.use(cookieParser());

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({ status: 'ok', app: 'Code Heaven Studio API' });
});

app.use('/api/admin/auth', authRouter);
app.use('/api/receipts', receiptsRouter);
app.use('/api/admin/audit', auditRouter);

// ── Global error handler ──────────────────────────────────────────────────────
app.use(errorHandler);
