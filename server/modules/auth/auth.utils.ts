import * as crypto from 'node:crypto';
import * as jwt from 'jsonwebtoken';

export interface IAuthTokenPayload {
  userId: string;
  username: string;
}

interface ISignOptions {
  secret: string;
  expiresInSec: number;
}

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEYLEN = 64;
const PBKDF2_DIGEST = 'sha512';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST)
    .toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  const [salt, storedHash] = passwordHash.split(':');
  if (!salt || !storedHash) return false;

  const calculatedHash = crypto
    .pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST)
    .toString('hex');

  return crypto.timingSafeEqual(Buffer.from(storedHash, 'hex'), Buffer.from(calculatedHash, 'hex'));
}

export function signAuthToken(payload: IAuthTokenPayload, options: ISignOptions): string {
  return jwt.sign(payload, options.secret, { expiresIn: options.expiresInSec });
}

export function verifyAuthToken(token: string, secret: string): IAuthTokenPayload {
  return jwt.verify(token, secret) as IAuthTokenPayload;
}
