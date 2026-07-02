import type { Request, Response, NextFunction } from 'express';
import { getIronSession, type IronSession } from 'iron-session';
import type { UserRow } from '../../db/schema';

export interface SessionData {
  userId?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session: IronSession<SessionData>;
      authUser?: UserRow;
    }
  }
}

export interface SessionOptions {
  password: string;
  cookieName?: string;
  secure: boolean;
}

export function createSessionMiddleware(opts: SessionOptions) {
  const sessionOpts = {
    password: opts.password,
    cookieName: opts.cookieName ?? 'mail-api-session',
    cookieOptions: {
      httpOnly: true,
      secure: opts.secure,
      sameSite: 'lax' as const,
      path: '/',
    },
  };

  return async function attachSession(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      req.session = await getIronSession<SessionData>(req, res, sessionOpts);
      next();
    } catch (err) {
      next(err);
    }
  };
}
