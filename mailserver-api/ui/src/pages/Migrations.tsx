import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ImapSslModeDTO,
  MailboxDTO,
  MigrationJobDTO,
  MigrationJobDetailDTO,
} from '@contracts';
import { api } from '../api';

const SSL_MODES: ImapSslModeDTO[] = ['imaps', 'starttls', 'none'];

const STATUS_STYLE: Record<MigrationJobDTO['status'], string> = {
  pending: 'bg-slate-100 text-slate-700',
  processing: 'bg-blue-100 text-blue-800',
  done: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-800',
};

export function MigrationsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    sourceHost: '',
    sourcePort: '',
    sourceUser: '',
    sourcePassword: '',
    sourceSsl: 'imaps' as ImapSslModeDTO,
    destAddress: '',
  });
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const mailboxes = useQuery({
    queryKey: ['mailboxes'],
    queryFn: () => api.get<MailboxDTO[]>('/admin/api/mailboxes'),
  });
  const jobs = useQuery({
    queryKey: ['migrations'],
    queryFn: () => api.get<MigrationJobDTO[]>('/admin/api/migrations'),
    refetchInterval: 5_000,
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['migrations'] });

  const create = useMutation({
    mutationFn: () =>
      api.post<MigrationJobDTO>('/admin/api/migrations', {
        sourceHost: form.sourceHost.trim(),
        sourcePort: form.sourcePort ? Number(form.sourcePort) : undefined,
        sourceUser: form.sourceUser.trim(),
        sourcePassword: form.sourcePassword,
        sourceSsl: form.sourceSsl,
        destAddress: form.destAddress,
      }),
    onSuccess: () => {
      invalidate();
      setForm((f) => ({
        ...f,
        sourceHost: '',
        sourceUser: '',
        sourcePassword: '',
        sourcePort: '',
      }));
      setStatus({ kind: 'ok', text: 'Migration queued' });
    },
    onError: (err) =>
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : 'Failed' }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/api/migrations/${id}`),
    onSuccess: invalidate,
    onError: (err) =>
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : 'Failed' }),
  });

  const input = 'rounded border border-slate-300 px-2 py-1 text-sm';
  const rows = jobs.data ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">IMAP migration</h1>
      <p className="text-xs text-slate-500">
        One-shot import of an external mailbox into a local address via Dovecot dsync. Re-running a
        job is safe (idempotent). The source password is stored encrypted and wiped once the job
        finishes.
      </p>

      <section className="rounded border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">New migration</h2>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <label className="text-xs text-slate-600">
            Source IMAP host
            <input
              className={`${input} mt-1 block w-full`}
              placeholder="imap.old-provider.com"
              value={form.sourceHost}
              onChange={(e) => setForm({ ...form, sourceHost: e.target.value })}
            />
          </label>
          <label className="text-xs text-slate-600">
            SSL
            <select
              className={`${input} mt-1 block w-full`}
              value={form.sourceSsl}
              onChange={(e) => setForm({ ...form, sourceSsl: e.target.value as ImapSslModeDTO })}
            >
              {SSL_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Port (optional)
            <input
              className={`${input} mt-1 block w-full`}
              placeholder="993 / 143"
              value={form.sourcePort}
              onChange={(e) => setForm({ ...form, sourcePort: e.target.value })}
            />
          </label>
          <label className="text-xs text-slate-600">
            Source username
            <input
              className={`${input} mt-1 block w-full`}
              placeholder="user@old-provider.com"
              value={form.sourceUser}
              onChange={(e) => setForm({ ...form, sourceUser: e.target.value })}
            />
          </label>
          <label className="text-xs text-slate-600">
            Source password
            <input
              type="password"
              className={`${input} mt-1 block w-full`}
              value={form.sourcePassword}
              onChange={(e) => setForm({ ...form, sourcePassword: e.target.value })}
            />
          </label>
          <label className="text-xs text-slate-600">
            Destination mailbox
            <select
              className={`${input} mt-1 block w-full`}
              value={form.destAddress}
              onChange={(e) => setForm({ ...form, destAddress: e.target.value })}
            >
              <option value="">Select…</option>
              {(mailboxes.data ?? []).map((m) => (
                <option key={m.id} value={m.address}>
                  {m.address}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => create.mutate()}
            disabled={
              create.isPending ||
              !form.sourceHost.trim() ||
              !form.sourceUser.trim() ||
              !form.sourcePassword ||
              !form.destAddress
            }
            className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {create.isPending ? 'Queuing…' : 'Start migration'}
          </button>
          {status && (
            <span className={`text-xs ${status.kind === 'ok' ? 'text-green-700' : 'text-red-700'}`}>
              {status.text}
            </span>
          )}
        </div>
      </section>

      <section className="rounded border border-slate-200 bg-white p-4">
        {jobs.isLoading && <p className="text-sm text-slate-500">Loading…</p>}
        {!jobs.isLoading && rows.length === 0 && (
          <p className="text-sm text-slate-500">No migrations yet.</p>
        )}
        {rows.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-1 pr-2">Source</th>
                <th className="py-1 pr-2">Destination</th>
                <th className="py-1 pr-2">Status</th>
                <th className="py-1 pr-2">Created</th>
                <th className="py-1 pr-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((j) => (
                <tr key={j.id} className="border-b border-slate-100">
                  <td className="py-1 pr-2 font-mono text-xs">
                    {j.sourceUser}@{j.sourceHost}
                  </td>
                  <td className="py-1 pr-2 font-mono text-xs">{j.destAddress}</td>
                  <td className="py-1 pr-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLE[j.status]}`}
                    >
                      {j.status}
                    </span>
                  </td>
                  <td className="py-1 pr-2 text-xs text-slate-500">
                    {new Date(j.createdAt).toLocaleString()}
                  </td>
                  <td className="space-x-2 py-1 pr-2 text-right text-xs">
                    <button
                      type="button"
                      onClick={() => setOpenId(openId === j.id ? null : j.id)}
                      className="text-indigo-600 hover:underline"
                    >
                      {openId === j.id ? 'Hide log' : 'Log'}
                    </button>
                    {j.status !== 'processing' && (
                      <button
                        type="button"
                        onClick={() => remove.mutate(j.id)}
                        className="text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {openId && <MigrationLog id={openId} />}
      </section>
    </div>
  );
}

function MigrationLog({ id }: { id: string }) {
  const detail = useQuery({
    queryKey: ['migration', id],
    queryFn: () => api.get<MigrationJobDetailDTO>(`/admin/api/migrations/${id}`),
    refetchInterval: 5_000,
  });
  return (
    <pre className="mt-3 max-h-72 overflow-auto rounded border border-slate-200 bg-slate-900 p-3 text-xs text-slate-100">
      {detail.data?.log || (detail.isLoading ? 'Loading…' : 'No log output.')}
    </pre>
  );
}
