import type { UserDTO } from '../../contracts';
import type { UserRow } from '../../db/schema';

export function serializeUser(user: UserRow): UserDTO {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}
