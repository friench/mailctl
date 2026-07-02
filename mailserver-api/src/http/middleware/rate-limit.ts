import rateLimit, { type Options } from 'express-rate-limit';
import type { RequestHandler } from 'express';

const baseOptions: Partial<Options> = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
};

/** /send: 60 req/min — generous, since transactional senders can burst. */
export function createSendRateLimit(): RequestHandler {
  return rateLimit({
    ...baseOptions,
    windowMs: 60_000,
    limit: 60,
    message: { error: 'Too many requests, try again later' },
  });
}

/** /admin/auth/login: 5 req/min per IP — brute-force defense. */
export function createLoginRateLimit(): RequestHandler {
  return rateLimit({
    ...baseOptions,
    windowMs: 60_000,
    limit: 5,
    message: { error: 'Too many login attempts, try again later' },
  });
}
