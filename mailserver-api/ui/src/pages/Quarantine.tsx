import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MailboxDTO, QuarantineBoxDTO } from '@contracts';
import { api } from '../api';
import { QuarantineMessages } from '../components/QuarantineMessages';
import { useT } from '../i18n';

export function QuarantinePage() {
  const t = useT();
  const queryClient = useQueryClient();
  // The mailbox filter lives in the URL so deep links (e.g. from a mailbox's
  // settings page, ?mailboxId=…) preselect it and the view is shareable.
  const [searchParams, setSearchParams] = useSearchParams();
  const mailboxId = searchParams.get('mailboxId') ?? '';
  const setMailboxId = (id: string) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set('mailboxId', id);
        else next.delete('mailboxId');
        return next;
      },
      { replace: true },
    );
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
      setStatus({
        kind: 'ok',
        text: v.action === 'release' ? t('quarantine.released') : t('quarantine.deleted'),
      });
    },
    onError: (err) =>
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : t('common.failed') }),
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
        text: `${v.action === 'release' ? t('quarantine.released') : t('quarantine.deleted')} ${res.handled}`,
      });
    },
    onError: (err) =>
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : t('common.failed') }),
  });

  const data = boxes.data ?? [];
  const busy = single.isPending || bulk.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">{t('quarantine.title')}</h1>
        <div className="flex items-center gap-3 text-sm">
          <label className="text-xs text-slate-600">
            {t('quarantine.mailbox')}
            <select
              value={mailboxId}
              onChange={(e) => setMailboxId(e.target.value)}
              className="ml-2 rounded border border-slate-300 px-2 py-1 text-sm"
            >
              <option value="">{t('quarantine.allWithSpam')}</option>
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
            {t('common.refresh')}
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-500">{t('quarantine.description')}</p>
      {status && (
        <p className={`text-xs ${status.kind === 'ok' ? 'text-green-700' : 'text-red-700'}`}>
          {status.text}
        </p>
      )}

      {boxes.isLoading && <p className="text-sm text-slate-500">{t('common.loading')}</p>}
      {!boxes.isLoading && data.length === 0 && (
        <p className="text-sm text-slate-500">{t('quarantine.noSpam')}</p>
      )}

      {data.map((box) => (
        <section key={box.mailboxId} className="rounded border border-slate-200 bg-white p-4">
          <h2 className="mb-2 font-mono text-sm font-semibold text-slate-900">
            {box.address}
            <span className="ml-2 font-sans text-xs font-normal text-slate-500">
              {box.messages.length}{' '}
              {box.messages.length === 1
                ? t('quarantine.messageSingular')
                : t('quarantine.messagePlural')}
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
