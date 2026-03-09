import crypto from 'crypto';

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

interface TokenPayload {
  email: string;
  exp: number;
}

function b64urlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function b64urlDecode(str: string): string {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString('utf8');
}

function sign(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function createToken(email: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is not set');

  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = b64urlEncode(JSON.stringify({ email, exp }));
  const sig = sign(payload, secret);
  return `${payload}.${sig}`;
}

export function verifyToken(token: string): TokenPayload | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;

  const dotIndex = token.lastIndexOf('.');
  if (dotIndex === -1) return null;

  const payload = token.slice(0, dotIndex);
  const sig = token.slice(dotIndex + 1);

  const expectedSig = sign(payload, secret);

  // Timing-safe comparison
  const sigBuf = Buffer.from(sig, 'hex');
  const expectedBuf = Buffer.from(expectedSig, 'hex');
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  let data: TokenPayload;
  try {
    data = JSON.parse(b64urlDecode(payload)) as TokenPayload;
  } catch {
    return null;
  }

  if (!data.email || !data.exp) return null;
  if (data.exp < Math.floor(Date.now() / 1000)) return null;

  return data;
}
