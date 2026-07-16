import jwt from 'jsonwebtoken';

/**
 * Returns the JWT secret from the environment.
 * Throws if it is missing or empty.
 */
function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set');
  }
  return secret;
}

/**
 * Signs a payload containing the user id, returning a JWT valid for 7 days.
 */
export function signToken(payload: { sub: string }): string {
  const secret = getSecret();
  return jwt.sign(payload, secret, { expiresIn: '7d' });
}

/**
 * Verifies a token and returns the decoded payload (expects { sub: string }).
 * Throws if the token is invalid or expired.
 */
export function verifyToken(token: string): { sub: string } {
  const secret = getSecret();
  const decoded = jwt.verify(token, secret);
  if (typeof decoded !== 'object' || decoded === null || typeof (decoded as any).sub !== 'string') {
    throw new Error('Invalid token payload');
  }
  return { sub: (decoded as { sub: string }).sub };
}
