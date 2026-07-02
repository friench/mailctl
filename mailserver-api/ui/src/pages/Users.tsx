import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ResourceTable, shortDate } from '../components/ResourceTable';
import { api } from '../api';
import type { UserDTO as UserRow } from '@contracts';

export function UsersPage() {
  return (
    <ResourceTable<UserRow>
      title="Admin users"
      endpoint="/admin/api/users"
      queryKey={['users']}
      columns={[
        { key: 'email', header: 'Email', render: (r) => r.email },
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
