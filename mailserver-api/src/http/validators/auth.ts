import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(128),
});

export type LoginBody = z.infer<typeof loginSchema>;
