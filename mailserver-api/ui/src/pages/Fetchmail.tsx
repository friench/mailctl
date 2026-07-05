import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FetchmailAccountDTO, FetchmailProtocolDTO, MailboxDTO } from '@contracts';
import { api } from '../api';

const PROTOCOLS: FetchmailProtocolDTO[] = ['imap', 'pop3'];

export function FetchmailPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    pollServer: '',
    protocol: 'imap' as FetchmailProtocolDTO,
    port: '',
    username: '',
    password: '',
    destAddress: '',
    ssl: true,
    keep: true,
  });
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const mailboxes = useQuery({
    queryKey: ['mailboxes'],
    queryFn: () => api.get<MailboxDTO[]>('/admin/api/mailboxes'),
  });
  const accounts = useQuery({
    queryKey: ['fetchmail'],
    queryFn: () => api.get<FetchmailAccountDTO[]>('/admin/api/fetchmail'),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['fetchmail'] });

  const create = useMutation({
    mutationFn: () =>
      api.post<FetchmailAccountDTO>('/admin/api/fetchmail', {
        pollServer: form.pollServer.trim(),
        protocol: form.protocol,
        port: form.port ? Number(form.port) : null,
        username: form.username.trim(),
        password: form.password,
        destAddress: form.destAddress,
        ssl: form.ssl,
        keep: form.keep,
      }),
    onSuccess: () => {
      invalidate();
      setForm((f) => ({ ...f, pollServer: '', username: '', password: '', port: '' }));
      setStatus({ kind: 'ok', text: 'Account added' });
    },
    onError: (err) =>
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : 'Failed' }),
  });

  const toggle = useMutation({
    mutationFn: (v: { id: string; active: boolean }) =>
      api.patch(`/admin/api/fetchmail/${v.id}`, { active: v.active }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/api/fetchmail/${id}`),
    onSuccess: invalidate,
  });

  const input = 'rounded border border-slate-300 px-2 py-1 text-sm';
  const rows = accounts.data ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Inbound fetching (fetchmail)</h1>
      <p className="text-xs text-slate-500">
        Periodically pull mail from external IMAP/POP3 accounts into a local mailbox. Requires{' '}
        <span className="font-mono">ENABLE_FETCHMAIL=1</span> on the mailserver; the poll interval
        is set by <span className="font-mono">FETCHMAIL_POLL</span>. Passwords are stored encrypted.
      </p>

      <section className="rounded border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Add account</h2>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <label className="text-xs text-slate-600">
            Remote server
            <input
              className={`${input} mt-1 block w-full`}
              placeholder="imap.provider.com"
              value={form.pollServer}
              onChange={(e) => setForm({ ...form, pollServer: e.target.value })}
            />
          </label>
          <label className="text-xs text-slate-600">
            Protocol
            <select
              className={`${input} mt-1 block w-full`}
              value={form.protocol}
              onChange={(e) =>
                setForm({ ...form, protocol: e.target.value as FetchmailProtocolDTO })
              }
            >
              {PROTOCOLS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Port (optional)
            <input
              className={`${input} mt-1 block w-full`}
              placeholder="993 / 995"
              value={form.port}
              onChange={(e) => setForm({ ...form, port: e.target.value })}
            />
          </label>
          <label className="text-xs text-slate-600">
            Remote username
            <input
              className={`${input} mt-1 block w-full`}
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
          </label>
          <label className="text-xs text-slate-600">
            Remote password
            <input
              type="password"
              className={`${input} mt-1 block w-full`}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
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
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-1 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={form.ssl}
              onChange={(e) => setForm({ ...form, ssl: e.target.checked })}
            />
            SSL/TLS
          </label>
          <label className="flex items-center gap-1 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={form.keep}
              onChange={(e) => setForm({ ...form, keep: e.target.checked })}
            />
            Keep mail on server
          </label>
          <button
            type="button"
            onClick={() => create.mutate()}
            disabled={
              create.isPending ||
              !form.pollServer.trim() ||
              !form.username.trim() ||
              !form.password ||
              !form.destAddress
            }
            className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {create.isPending ? 'Adding…' : 'Add'}
          </button>
          {status && (
            <span className={`text-xs ${status.kind === 'ok' ? 'text-green-700' : 'text-red-700'}`}>
              {status.text}
            </span>
          )}
        </div>
      </section>

      <section className="rounded border border-slate-200 bg-white p-4">
        {accounts.isLoading && <p className="text-sm text-slate-500">Loading…</p>}
        {!accounts.isLoading && rows.length === 0 && (
          <p className="text-sm text-slate-500">No fetch accounts yet.</p>
        )}
        {rows.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-1 pr-2">Remote</th>
                <th className="py-1 pr-2">Proto</th>
                <th className="py-1 pr-2">Destination</th>
                <th className="py-1 pr-2">Options</th>
                <th className="py-1 pr-2">Active</th>
                <th className="py-1 pr-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-b border-slate-100">
                  <td className="py-1 pr-2 font-mono text-xs">
                    {a.username}@{a.pollServer}
                    {a.port ? `:${a.port}` : ''}
                  </td>
                  <td className="py-1 pr-2 text-xs">{a.protocol}</td>
                  <td className="py-1 pr-2 font-mono text-xs">{a.destAddress}</td>
                  <td className="py-1 pr-2 text-xs text-slate-500">
                    {[a.ssl ? 'ssl' : '', a.keep ? 'keep' : 'nokeep'].filter(Boolean).join(', ')}
                  </td>
                  <td className="py-1 pr-2">
                    <button
                      type="button"
                      onClick={() => toggle.mutate({ id: a.id, active: !a.active })}
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                        a.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {a.active ? 'active' : 'paused'}
                    </button>
                  </td>
                  <td className="py-1 pr-2 text-right">
                    <button
                      type="button"
                      onClick={() => remove.mutate(a.id)}
                      className="text-red-600 hover:underline text-xs"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
