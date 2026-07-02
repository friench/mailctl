import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDbHandle } from '../helpers/db';

describe('UserService', () => {
  let h: TestDbHandle;
  beforeEach(() => (h = createTestDb()));
  afterEach(() => h.close());

  it('hashes password (does not store plaintext)', async () => {
    const user = await h.userService.create('admin@example.com', 'secret123');
    expect(user.email).toBe('admin@example.com');
    expect(user.passwordHash).not.toBe('secret123');
    expect(user.passwordHash.length).toBeGreaterThan(40);
    expect(user.passwordHash.startsWith('$argon2')).toBe(true);
  });

  it('lowercases email', async () => {
    const user = await h.userService.create('Admin@Example.COM', 'secret123');
    expect(user.email).toBe('admin@example.com');
  });

  it('rejects short password', async () => {
    await expect(h.userService.create('a@b.co', 'short')).rejects.toThrow(/at least/);
  });

  it('rejects duplicate email', async () => {
    await h.userService.create('a@b.co', 'secret123');
    await expect(h.userService.create('a@b.co', 'other123')).rejects.toThrow(/already exists/);
  });

  it('verifies correct password', async () => {
    await h.userService.create('a@b.co', 'secret123');
    const user = await h.userService.verifyPassword('a@b.co', 'secret123');
    expect(user).not.toBeNull();
    expect(user?.email).toBe('a@b.co');
  });

  it('returns null on wrong password', async () => {
    await h.userService.create('a@b.co', 'secret123');
    expect(await h.userService.verifyPassword('a@b.co', 'wrong456')).toBeNull();
  });

  it('returns null on unknown email', async () => {
    expect(await h.userService.verifyPassword('nope@b.co', 'whatever')).toBeNull();
  });

  it('changes password', async () => {
    const created = await h.userService.create('a@b.co', 'oldpass1');
    await h.userService.changePassword(created.id, 'newpass2');
    expect(await h.userService.verifyPassword('a@b.co', 'oldpass1')).toBeNull();
    expect(await h.userService.verifyPassword('a@b.co', 'newpass2')).not.toBeNull();
  });

  it('refuses to delete the last admin', async () => {
    const u = await h.userService.create('a@b.co', 'secret123');
    expect(() => h.userService.delete(u.id)).toThrow(/last admin/);
  });

  it('deletes when more than one user exists', async () => {
    const u1 = await h.userService.create('a@b.co', 'secret123');
    await h.userService.create('b@c.co', 'secret123');
    h.userService.delete(u1.id);
    expect(h.userRepo.findById(u1.id)).toBeUndefined();
  });
});
