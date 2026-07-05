import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MailboxDTO, QuarantineBoxDTO } from '@contracts';
import { api } from '../api';
import { QuarantineMessages } from '../components/QuarantineMessages';

export function QuarantinePage() {
  const queryClient = useQueryClient();
  const [mailboxId, setMailboxId] = useState('');
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const mailboxes = useQuery({
    queryKey: ['mailboxes'],
    queryFn: () => api.get<MailboxDTO[]>('/admin/api/mailboxes'),
  });

  const queryKey = ['quarantine', mailboxId];
  const boxes = useQuery({
    queryKey,
    queryFn: () =>
      api.get<QuarantineBoxDTO[]>(
        mailboxId
          ? `/admin/api/quarantine?mailboxId=${encodeURIComponent(mailboxId)}`
          : '/admin/api/quarantine',
      ),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey });

  const single = useMutation({
    mutationFn: ({
      mid,
      uid,
      action,
    }: {
      mid: string;
      uid: number;
      action: 'release' | 'delete';
    }) =>
      action === 'release'
        ? api.post(`/admin/api/quarantine/${mid}/${uid}/release`)
        : api.delete(`/admin/api/quarantine/${mid}/${uid}`),
    onSuccess: (_d, v) => {
      invalidate();
      setStatus({ kind: 'ok', text: v.action === 'release' ? 'Released' : 'Deleted' });
    },
    onError: (err) =>
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : 'Failed' }),
  });

  const bulk = useMutation({
    mutationFn: ({
      mid,
      uids,
      action,
    }: {
      mid: string;
      uids: number[];
      action: 'release' | 'delete';
    }) => api.post<{ handled: number }>(`/admin/api/quarantine/${mid}/actions`, { uids, action }),
    onSuccess: (res, v) => {
      invalidate();
      setStatus({
        kind: 'ok',
        text: `${v.action === 'release' ? 'Released' : 'Deleted'} ${res.handled}`,
      });
    },
    onError: (err) =>
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : 'Failed' }),
  });

  const data = boxes.data ?? [];
  const busy = single.isPending || bulk.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Spam quarantine</h1>
        <div className="flex items-center gap-3 text-sm">
          <label className="text-xs text-slate-600">
            Mailbox
            <select
              value={mailboxId}
              onChange={(e) => setMailboxId(e.target.value)}
              className="ml-2 rounded border border-slate-300 px-2 py-1 text-sm"
            >
              <option value="">All (with spam)</option>
              {(mailboxes.data ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.address}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => boxes.refetch()}
            className="text-indigo-600 hover:underline text-xs"
          >
            Refresh
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Spam filed into each mailbox&apos;s Junk folder. Release moves a message back to the inbox;
        delete expunges it permanently.
      </p>
      {status && (
        <p className={`text-xs ${status.kind === 'ok' ? 'text-green-700' : 'text-red-700'}`}>
          {status.text}
        </p>
      )}

      {boxes.isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {!boxes.isLoading && data.length === 0 && (
        <p className="text-sm text-slate-500">No quarantined spam.</p>
      )}

      {data.map((box) => (
        <section key={box.mailboxId} className="rounded border border-slate-200 bg-white p-4">
          <h2 className="mb-2 font-mono text-sm font-semibold text-slate-900">
            {box.address}
            <span className="ml-2 font-sans text-xs font-normal text-slate-500">
              {box.messages.length} message{box.messages.length === 1 ? '' : 's'}
            </span>
          </h2>
          <QuarantineMessages
            messages={box.messages}
            viewHref={(uid) => `/admin/api/quarantine/${box.mailboxId}/${uid}`}
            busy={busy}
            onRelease={(uid) => single.mutate({ mid: box.mailboxId, uid, action: 'release' })}
            onDelete={(uid) => single.mutate({ mid: box.mailboxId, uid, action: 'delete' })}
            onBulk={(uids, action) => bulk.mutate({ mid: box.mailboxId, uids, action })}
          />
        </section>
      ))}
    </div>
  );
}
