import { Router, type Request, type Response } from 'express';
import type { UserService, OidcProvisionOptions } from '../../domain/users/service';
import type { UserRepository } from '../../domain/users/repository';
import type { OidcProvider } from '../../domain/auth/oidc-provider';
import { serializeUser } from '../../domain/users/serialize';
import { asyncHandler } from '../../lib/async-handler';
import { createLoginRateLimit } from '../middleware/rate-limit';
import { loginSchema } from '../validators/auth';
import { pkceChallenge, randomToken } from '../../lib/oidc';

export interface OidcRouteOptions {
  provider: OidcProvider;
  provision: OidcProvisionOptions;
  requireVerifiedEmail: boolean;
}

const LOGIN_PATH = '/admin/login';
const HOME_PATH = '/admin/';

export function authRouter(
  userService: UserService,
  userRepo: UserRepository,
  oidc: OidcRouteOptions,
) {
  const router = Router();

  /** Public: lets the pre-auth login page know which methods are available. */
  router.get('/admin/auth/config', (_req: Request, res: Response) => {
    res.json({ oidc: { enabled: oidc.provider.enabled, label: oidc.provider.label } });
  });

  router.post(
    '/admin/auth/login',
    createLoginRateLimit(),
    asyncHandler(async (req: Request, res: Response) => {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid email or password' });
        return;
      }

      const user = await userService.verifyPassword(parsed.data.email, parsed.data.password);
      if (!user) {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }

      req.session.userId = user.id;
      await req.session.save();
      userService.touchLastLogin(user.id);

      res.json(serializeUser(user));
    }),
  );

  /** Begin the OIDC login: stash state/nonce/PKCE and redirect to the IdP. */
  router.get(
    '/admin/auth/oidc/start',
    asyncHandler(async (req: Request, res: Response) => {
      if (!oidc.provider.enabled) {
        res.status(404).json({ error: 'SSO is not configured' });
        return;
      }
      const state = randomToken();
      const nonce = randomToken();
      const verifier = randomToken();
      req.session.oidc = { state, nonce, verifier };
      await req.session.save();

      const url = await oidc.provider.authorizationUrl({
        state,
        nonce,
        codeChallenge: pkceChallenge(verifier),
      });
      res.redirect(url);
    }),
  );

  /** IdP redirect target: validate state, exchange, provision, open a session. */
  router.get(
    '/admin/auth/oidc/callback',
    asyncHandler(async (req: Request, res: Response) => {
      const fail = async (reason: string) => {
        await req.session.save();
        res.redirect(`${LOGIN_PATH}?error=${reason}`);
      };
      const flow = req.session.oidc;
      req.session.oidc = undefined;

      if (req.query.error) return fail('sso_denied');
      const code = typeof req.query.code === 'string' ? req.query.code : '';
      const state = typeof req.query.state === 'string' ? req.query.state : '';
      if (!oidc.provider.enabled || !flow || !code || !state || state !== flow.state) {
        return fail('sso_state');
      }

      let identity;
      try {
        identity = await oidc.provider.exchange({ code, codeVerifier: flow.verifier });
      } catch {
        return fail('sso_exchange');
      }

      if (oidc.requireVerifiedEmail && !identity.emailVerified) {
        return fail('sso_unverified');
      }

      const user = await userService.findOrProvisionOidc(identity.email, oidc.provision);
      if (!user) return fail('sso_no_account');

      req.session.userId = user.id;
      await req.session.save();
      userService.touchLastLogin(user.id);
      res.redirect(HOME_PATH);
    }),
  );

  router.post(
    '/admin/auth/logout',
    asyncHandler(async (req: Request, res: Response) => {
      req.session.destroy();
      res.status(204).end();
    }),
  );

  router.get('/admin/auth/me', (req: Request, res: Response) => {
    if (!req.session?.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const user = userRepo.findById(req.session.userId);
    if (!user) {
      req.session.destroy();
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    res.json(serializeUser(user));
  });

  return router;
}
