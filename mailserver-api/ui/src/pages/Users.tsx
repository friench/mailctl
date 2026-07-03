import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ResourceTable, shortDate } from '../components/ResourceTable';
import { api } from '../api';
import type { DomainDTO as Domain, UserDTO as UserRow, UserRole } from '@contracts';

const ROLES: UserRole[] = ['admin', 'read_only', 'domain_admin', 'domain_read_only', 'domain_user'];
const DOMAIN_ROLES = new Set<UserRole>(['domain_admin', 'domain_read_only', 'domain_user']);

export function UsersPage() {
  const domains = useQuery({
    queryKey: ['domains'],
    queryFn: () => api.get<Domain[]>('/admin/api/domains'),
  });

  return (
    <ResourceTable<UserRow>
      title="Admin users"
      endpoint="/admin/api/users"
      queryKey={['users']}
      columns={[
        { key: 'email', header: 'Email', render: (r) => r.email },
        { key: 'role', header: 'Role', render: (r) => <RoleSelect user={r} /> },
        {
          key: 'domains',
          header: 'Domains',
          render: (r) => <DomainAssign user={r} domains={domains.data ?? []} />,
        },
        { key: 'lastLogin', header: 'Last login', render: (r) => shortDate(r.lastLoginAt) },
        { key: 'created', header: 'Created', render: (r) => shortDate(r.createdAt) },
      ]}
      createFields={[
        { name: 'email', label: 'Email', required: true, type: 'email' },
        { name: 'password', label: 'Password (min 8 chars)', required: true, type: 'password' },
      ]}
      rowActions={(row) => <ChangePassword userId={row.id} />}
    />
  );
}

function DomainAssign({ user, domains }: { user: UserRow; domains: Domain[] }) {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (domainIds: string[]) => api.patch(`/admin/api/users/${user.id}`, { domainIds }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  if (!DOMAIN_ROLES.has(user.role)) return <span className="text-slate-400 text-xs">–</span>;

  return (
    <select
      multiple
      value={user.assignedDomainIds}
      disabled={save.isPending}
      onChange={(e) => save.mutate(Array.from(e.target.selectedOptions, (o) => o.value))}
      className="rounded border border-slate-300 px-1 py-0.5 text-xs disabled:opacity-50"
      size={Math.min(Math.max(domains.length, 2), 4)}
    >
      {domains.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </select>
  );
}

function RoleSelect({ user }: { user: UserRow }) {
  const queryClient = useQueryClient();
  const change = useMutation({
    mutationFn: (role: UserRole) => api.patch(`/admin/api/users/${user.id}`, { role }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
  return (
    <select
      value={user.role}
      disabled={change.isPending}
      onChange={(e) => change.mutate(e.target.value as UserRole)}
      className="rounded border border-slate-300 px-1 py-0.5 text-xs disabled:opacity-50"
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {r}
        </option>
      ))}
    </select>
  );
}

function ChangePassword({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const change = useMutation({
    mutationFn: (password: string) =>
      api.patch(`/admin/api/users/${userId}/password`, { password }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      setError(null);
      setDone(true);
    },
    onError: (err) => {
      setDone(false);
      setError(err instanceof Error ? err.message : 'Failed to change password');
    },
  });

  const onClick = () => {
    const password = window.prompt('New password (min 8 chars):');
    if (password === null) return;
    if (password.length < 8) {
      setDone(false);
      setError('Password must be at least 8 characters');
      return;
    }
    setError(null);
    change.mutate(password);
  };

  return (
    <span className="space-x-3">
      <button
        type="button"
        onClick={onClick}
        disabled={change.isPending}
        className="text-indigo-600 hover:underline text-xs disabled:opacity-50"
      >
        {change.isPending ? 'Saving…' : 'Change password'}
      </button>
      {done && <span className="text-xs text-green-700">✓ updated</span>}
      {error && <span className="text-xs text-red-700">{error}</span>}
    </span>
  );
}
