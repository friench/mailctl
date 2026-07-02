import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ResourceTable, formatBoolean, shortDate } from '../components/ResourceTable';
import { api } from '../api';
import type { SmtpAccountDTO as SmtpAccount } from '@contracts';

export function SmtpAccountsPage() {
  return (
    <ResourceTable<SmtpAccount>
      title="SMTP accounts"
      endpoint="/admin/api/smtp-accounts"
      queryKey={['smtp-accounts']}
      columns={[
        { key: 'name', header: 'Name', render: (r) => r.name },
        { key: 'host', header: 'Host', render: (r) => `${r.host}:${r.port}` },
        { key: 'from', header: 'From', render: (r) => r.fromAddress },
        { key: 'priority', header: 'Priority', render: (r) => r.priority },
        { key: 'secure', header: 'TLS', render: (r) => formatBoolean(r.secure) },
        { key: 'active', header: 'Active', render: (r) => formatBoolean(r.active) },
        { key: 'created', header: 'Created', render: (r) => shortDate(r.createdAt) },
      ]}
      createFields={[
        { name: 'name', label: 'Name', required: true, placeholder: 'primary' },
        { name: 'host', label: 'Host', required: true, placeholder: 'mailserver' },
        { name: 'port', label: 'Port', required: true, type: 'number', defaultValue: 587 },
        { name: 'secure', label: 'TLS (secure)', type: 'checkbox' },
        { name: 'fromAddress', label: 'From address', required: true, type: 'email' },
        { name: 'fromName', label: 'From name (optional)' },
        { name: 'userEnvVar', label: 'User env var (UPPER_SNAKE)' },
        { name: 'passwordEnvVar', label: 'Password env var (UPPER_SNAKE)' },
        {
          name: 'priority',
          label: 'Priority (1 = highest)',
          required: true,
          type: 'number',
          defaultValue: 1,
        },
      ]}
      transformCreate={(values) => {
        const body: Record<string, unknown> = {
          name: values.name,
          host: values.host,
          port: Number(values.port),
          secure: Boolean(values.secure),
          fromAddress: values.fromAddress,
          priority: Number(values.priority),
        };
        if (values.fromName) body.fromName = values.fromName;
        if (values.userEnvVar) body.userEnvVar = values.userEnvVar;
        if (values.passwordEnvVar) body.passwordEnvVar = values.passwordEnvVar;
        return body;
      }}
      rowActions={(row) => <SmtpAccountActions account={row} />}
    />
  );
}

function SmtpAccountActions({ account }: { account: SmtpAccount }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch<SmtpAccount>(`/admin/api/smtp-accounts/${account.id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['smtp-accounts'] });
      setMessage({ text: 'Saved', error: false });
    },
    onError: (err) => {
      setMessage({ text: err instanceof Error ? err.message : 'Failed', error: true });
    },
  });

  const onEdit = () => {
    const priorityInput = window.prompt('Priority (1 = highest)', String(account.priority));
    if (priorityInput === null) return;
    const priority = Number(priorityInput);
    if (!Number.isFinite(priority)) {
      setMessage({ text: 'Priority must be a number', error: true });
      return;
    }

    const fromNameInput = window.prompt('From name (blank to clear)', account.fromName ?? '');
    if (fromNameInput === null) return;
    const fromName = fromNameInput.trim();

    const body: Record<string, unknown> = {};
    if (priority !== account.priority) body.priority = priority;
    if (fromName !== (account.fromName ?? '')) body.fromName = fromName;

    if (Object.keys(body).length === 0) {
      setMessage({ text: 'No changes', error: false });
      return;
    }
    patch.mutate(body);
  };

  return (
    <span className="space-x-3">
      <button
        type="button"
        onClick={() => patch.mutate({ active: !account.active })}
        disabled={patch.isPending}
        className="text-indigo-600 hover:underline text-xs disabled:opacity-50"
      >
        {account.active ? 'Disable' : 'Enable'}
      </button>
      <button
        type="button"
        onClick={onEdit}
        disabled={patch.isPending}
        className="text-indigo-600 hover:underline text-xs disabled:opacity-50"
      >
        Edit
      </button>
      {message && (
        <span className={`text-xs ${message.error ? 'text-red-700' : 'text-slate-600'}`}>
          {message.text}
        </span>
      )}
    </span>
  );
}
