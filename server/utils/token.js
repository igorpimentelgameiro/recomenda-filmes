import { createHmac, timingSafeEqual } from 'node:crypto';

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(value, secret) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function createToken(payload, secret, ttlSeconds = 60 * 60 * 24 * 7) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify({
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  }));
  const unsigned = `${header}.${body}`;
  return `${unsigned}.${sign(unsigned, secret)}`;
}

export function verifyToken(token, secret) {
  const [header, body, signature] = String(token).split('.');
  if (!header || !body || !signature) return null;

  const unsigned = `${header}.${body}`;
  const expected = sign(unsigned, secret);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);

  if (
    expectedBuffer.length !== signatureBuffer.length
    || !timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    return null;
  }

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

  return payload;
}
