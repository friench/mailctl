import { Router, type Request, type Response } from 'express';
import type { UserService } from '../../domain/users/service';
import type { UserRepository } from '../../domain/users/repository';
import { serializeUser } from '../../domain/users/serialize';
import { asyncHandler } from '../../lib/async-handler';
import { createLoginRateLimit } from '../middleware/rate-limit';
import { loginSchema } from '../validators/auth';

export function authRouter(userService: UserService, userRepo: UserRepository) {
  const router = Router();

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
