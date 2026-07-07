import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { createOriginGuard } from '../../src/http/middleware/origin-guard';

function run(
  guard: ReturnType<typeof createOriginGuard>,
  req: Partial<Request> & { method: string; headers: Record<string, string> },
) {
  const next = vi.fn();
  const json = vi.fn();
  const status = vi.fn(() => ({ json }) as unknown as Response);
  const res = { status } as unknown as Response;
  guard(req as Request, res, next);
  return { next, status, json };
}

const guard = createOriginGuard();

describe('createOriginGuard', () => {
  it('passes safe methods regardless of origin', () => {
    const { next, status } = run(guard, {
      method: 'GET',
      headers: { origin: 'https://evil.com', host: 'panel.example.com' },
    });
    expect(next).toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });

  it('passes API-key requests even with a foreign origin (not CSRF-able)', () => {
    const { next } = run(guard, {
      method: 'POST',
      headers: { origin: 'https://evil.com', host: 'panel.example.com', 'x-api-key': 'k' },
    });
    expect(next).toHaveBeenCalled();
  });

  it('passes when no origin header is present (non-browser client)', () => {
    const { next } = run(guard, { method: 'DELETE', headers: { host: 'panel.example.com' } });
    expect(next).toHaveBeenCalled();
  });

  it('passes a same-origin mutation', () => {
    const { next } = run(guard, {
      method: 'POST',
      headers: { origin: 'https://panel.example.com', host: 'panel.example.com' },
    });
    expect(next).toHaveBeenCalled();
  });

  it('rejects a cross-origin mutation', () => {
    const { next, status, json } = run(guard, {
      method: 'POST',
      headers: { origin: 'https://evil.com', host: 'panel.example.com' },
    });
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: 'Cross-origin request rejected' });
  });

  it('rejects an unparseable origin', () => {
    const { next, status } = run(guard, {
      method: 'PATCH',
      headers: { origin: 'not a url', host: 'panel.example.com' },
    });
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
  });

  it('allows a configured trusted origin', () => {
    const g = createOriginGuard({ trustedOrigins: ['https://dash.example.com'] });
    const { next } = run(g, {
      method: 'POST',
      headers: { origin: 'https://dash.example.com', host: 'panel.example.com' },
    });
    expect(next).toHaveBeenCalled();
  });
});
