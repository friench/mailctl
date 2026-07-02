import { z } from 'zod';

const passwordSchema = z.string().min(8).max(128);

export const createUserSchema = z.object({
  email: z.email(),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  password: passwordSchema,
});

export type CreateUserBody = z.infer<typeof createUserSchema>;
export type ChangePasswordBody = z.infer<typeof changePasswordSchema>;
