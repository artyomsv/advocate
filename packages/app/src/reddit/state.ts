import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface StatePayload {
  legendId: string;
  nonce: string;
}

export function encodeState(payload: StatePayload, secret: string): string {
  const body = `${payload.legendId}:${payload.nonce}`;
  const sig = createHmac('sha256', secret).update(body).digest('base64url').slice(0, 22);
  return `${body}:${sig}`;
}

export function decodeState(raw: string, secret: string): StatePayload | null {
  const parts = raw.split(':');
  if (parts.length !== 3) return null;
  const [legendId, nonce, sig] = parts;
  if (!legendId || !nonce || !sig) return null;
  const body = `${legendId}:${nonce}`;
  const expected = createHmac('sha256', secret).update(body).digest('base64url').slice(0, 22);
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return { legendId, nonce };
}

export function newNonce(): string {
  return randomBytes(16).toString('base64url');
}
