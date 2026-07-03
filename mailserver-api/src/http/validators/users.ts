import { z } from 'zod';
import { USER_ROLES } from '../../db/schema';

const passwordSchema = z.string().min(8).max(128);

export const createUserSchema = z.object({
  email: z.email(),
  password: passwordSchema,
  role: z.enum(USER_ROLES).optional(),
});

export const updateUserSchema = z.object({
  role: z.enum(USER_ROLES).optional(),
  domainIds: z.array(z.uuid()).max(1000).optional(),
});

export const changePasswordSchema = z.object({
  password: passwordSchema,
});

export type CreateUserBody = z.infer<typeof createUserSchema>;
export type UpdateUserBody = z.infer<typeof updateUserSchema>;
export type ChangePasswordBody = z.infer<typeof changePasswordSchema>;
