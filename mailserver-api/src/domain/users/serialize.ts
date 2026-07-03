import type { UserDTO } from '../../contracts';
import type { UserRow } from '../../db/schema';

export function serializeUser(user: UserRow, assignedDomainIds: string[] = []): UserDTO {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    assignedDomainIds,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}
