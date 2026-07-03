import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ResourceTable, formatBoolean, shortDate } from '../components/ResourceTable';
import { api } from '../api';
import type { MailboxDTO as Mailbox } from '@contracts';

export function MailboxesPage() {
  return (
    <ResourceTable<Mailbox>
      title="Mailboxes"
      endpoint="/admin/api/mailboxes"
      queryKey={['mailboxes']}
      columns={[
        {
          key: 'address',
          header: 'Address',
          render: (r) => <span className="font-mono">{r.address}</span>,
        },
        { key: 'quota', header: 'Quota (MB)', render: (r) => r.quotaMb ?? '–' },
        { key: 'active', header: 'Active', render: (r) => formatBoolean(r.active) },
        {
          key: 'source',
          header: 'Source',
          render: (r) => <SourceBadge source={r.source} externallyManaged={r.externallyManaged} />,
        },
        { key: 'synced', header: 'Last sync', render: (r) => shortDate(r.lastSyncedAt) },
        {
          key: 'notes',
          header: 'Notes',
          render: (r) => <span className="text-slate-500 text-xs">{r.notes ?? '–'}</span>,
        },
        { key: 'created', header: 'Created', render: (r) => shortDate(r.createdAt) },
      ]}
      createFields={[
        {
          name: 'address',
          label: 'Email address',
          required: true,
          type: 'email',
          placeholder: 'user@example.com',
        },
        { name: 'password', label: 'Password (min 8 chars)', required: true, type: 'password' },
        { name: 'quotaMb', label: 'Quota MB (optional)', type: 'number' },
        { name: 'notes', label: 'Notes (optional)' },
      ]}
      transformCreate={(values) => {
        const body: Record<string, unknown> = {
          address: values.address,
          password: values.password,
        };
        if (values.quotaMb && Number(values.quotaMb) > 0) body.quotaMb = Number(values.quotaMb);
        if (values.notes) body.notes = values.notes;
        return body;
      }}
      rowActions={(row) => <MailboxActions mailbox={row} />}
    />
  );
}

function SourceBadge({
  source,
  externallyManaged,
}: {
  source: 'panel' | 'dms';
  externallyManaged: boolean;
}) {
  const className =
    source === 'dms' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700';
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${className}`}>
        {source}
      </span>
      {externallyManaged && (
        <span className="text-xs text-slate-400" title="Managed outside the panel">
          ext
        </span>
      )}
    </span>
  );
}

function MailboxActions({ mailbox }: { mailbox: Mailbox }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['mailboxes'] });

  const changePassword = useMutation({
    mutationFn: (password: string) =>
      api.patch(`/admin/api/mailboxes/${mailbox.id}/password`, { password }),
    onSuccess: () => {
      invalidate();
      setStatus({ kind: 'ok', text: 'Password changed' });
    },
    onError: (err) => {
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : 'Failed' });
    },
  });

  const edit = useMutation({
    mutationFn: (body: { quotaMb?: number | null; active?: boolean }) =>
      api.patch(`/admin/api/mailboxes/${mailbox.id}`, body),
    onSuccess: () => {
      invalidate();
      setStatus({ kind: 'ok', text: 'Mailbox updated' });
    },
    onError: (err) => {
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : 'Failed' });
    },
  });

  const onChangePassword = () => {
    const password = window.prompt(`New password for ${mailbox.address} (min 8 chars):`);
    if (!password) return;
    changePassword.mutate(password);
  };

  const onEdit = () => {
    const quotaInput = window.prompt(
      `Quota MB for ${mailbox.address} (empty to clear):`,
      mailbox.quotaMb != null ? String(mailbox.quotaMb) : '',
    );
    if (quotaInput === null) return;
    const trimmed = quotaInput.trim();
    const quotaMb = trimmed === '' ? null : Number(trimmed);
    if (quotaMb !== null && (!Number.isFinite(quotaMb) || quotaMb < 0)) {
      setStatus({ kind: 'error', text: 'Quota must be a non-negative number' });
      return;
    }
    const active = window.confirm(
      `Active? OK = active, Cancel = inactive (currently ${mailbox.active ? 'active' : 'inactive'}).`,
    );
    edit.mutate({ quotaMb, active });
  };

  const busy = changePassword.isPending || edit.isPending;

  return (
    <span className="space-x-3">
      <button
        type="button"
        onClick={onChangePassword}
        disabled={busy}
        className="text-indigo-600 hover:underline text-xs disabled:opacity-50"
      >
        Change password
      </button>
      <button
        type="button"
        onClick={onEdit}
        disabled={busy}
        className="text-indigo-600 hover:underline text-xs disabled:opacity-50"
      >
        Edit
      </button>
      {status && (
        <span className={`text-xs ${status.kind === 'ok' ? 'text-slate-600' : 'text-red-700'}`}>
          {status.text}
        </span>
      )}
    </span>
  );
}
