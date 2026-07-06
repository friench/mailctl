import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ResourceTable, formatBoolean, shortDate } from '../components/ResourceTable';
import { api } from '../api';
import type { AliasDTO as Alias, AppSettingsDTO, MailboxDTO as Mailbox } from '@contracts';
import { useT } from '../i18n';

/** Targets of a mailbox's forwarding alias, excluding the mailbox's own address (the "keep a copy" marker). */
function forwardTargets(alias: Alias | undefined, address: string): string[] {
  if (!alias) return [];
  return alias.target
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t && t.toLowerCase() !== address.toLowerCase());
}

export function MailboxesPage() {
  const t = useT();
  const aliases = useQuery({
    queryKey: ['aliases'],
    queryFn: () => api.get<Alias[]>('/admin/api/aliases'),
  });
  const forwardByAddress = useMemo(() => {
    const map = new Map<string, Alias>();
    for (const a of aliases.data ?? []) map.set(a.address.toLowerCase(), a);
    return map;
  }, [aliases.data]);

  return (
    <ResourceTable<Mailbox>
      title={t('mailboxes.title')}
      endpoint="/admin/api/mailboxes"
      queryKey={['mailboxes']}
      columns={[
        {
          key: 'address',
          header: t('mailboxes.colAddress'),
          render: (r) => <span className="font-mono">{r.address}</span>,
        },
        { key: 'quota', header: t('mailboxes.colQuota'), render: (r) => r.quotaMb ?? '–' },
        { key: 'active', header: t('mailboxes.colActive'), render: (r) => formatBoolean(r.active) },
        {
          key: 'delivery',
          header: t('mailboxes.colDelivery'),
          render: (r) => (
            <span className="text-xs">
              <span className={r.sendBlocked ? 'text-red-600' : 'text-emerald-600'}>
                {t('mailboxes.sendPrefix')}{' '}
                {r.sendBlocked ? t('mailboxes.statusBlocked') : t('mailboxes.statusOk')}
              </span>
              {' · '}
              <span className={r.receiveBlocked ? 'text-red-600' : 'text-emerald-600'}>
                {t('mailboxes.recvPrefix')}{' '}
                {r.receiveBlocked ? t('mailboxes.statusBlocked') : t('mailboxes.statusOk')}
              </span>
            </span>
          ),
        },
        {
          key: 'forwarding',
          header: t('mailboxes.colForwarding'),
          render: (r) => {
            const targets = forwardTargets(
              forwardByAddress.get(r.address.toLowerCase()),
              r.address,
            );
            return targets.length ? (
              <span className="font-mono text-xs text-slate-600">→ {targets.join(', ')}</span>
            ) : (
              '–'
            );
          },
        },
        {
          key: 'source',
          header: t('mailboxes.colSource'),
          render: (r) => <SourceBadge source={r.source} externallyManaged={r.externallyManaged} />,
        },
        {
          key: 'synced',
          header: t('mailboxes.colLastSync'),
          render: (r) => shortDate(r.lastSyncedAt),
        },
        {
          key: 'notes',
          header: t('mailboxes.colNotes'),
          render: (r) => <span className="text-slate-500 text-xs">{r.notes ?? '–'}</span>,
        },
        {
          key: 'created',
          header: t('mailboxes.colCreated'),
          render: (r) => shortDate(r.createdAt),
        },
      ]}
      createFields={[
        {
          name: 'address',
          label: t('mailboxes.fieldAddress'),
          required: true,
          type: 'email',
          placeholder: 'user@example.com',
        },
        { name: 'password', label: t('mailboxes.fieldPassword'), required: true, type: 'password' },
        { name: 'quotaMb', label: t('mailboxes.fieldQuota'), type: 'number' },
        { name: 'notes', label: t('mailboxes.fieldNotes') },
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
      rowActions={(row) => (
        <MailboxActions mailbox={row} forward={forwardByAddress.get(row.address.toLowerCase())} />
      )}
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
  const t = useT();
  const className =
    source === 'dms' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700';
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${className}`}>
        {source}
      </span>
      {externallyManaged && (
        <span className="text-xs text-slate-400" title={t('mailboxes.extTitle')}>
          ext
        </span>
      )}
    </span>
  );
}

function MailboxActions({ mailbox, forward }: { mailbox: Mailbox; forward?: Alias }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<AppSettingsDTO>('/admin/api/settings'),
    staleTime: 5 * 60_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['mailboxes'] });
    void queryClient.invalidateQueries({ queryKey: ['aliases'] });
  };

  const setForward = useMutation({
    mutationFn: (op: { kind: 'set'; target: string } | { kind: 'clear' }) => {
      if (op.kind === 'clear') {
        return forward
          ? api.delete(`/admin/api/aliases/${forward.id}`)
          : Promise.resolve(undefined);
      }
      return forward
        ? api.patch(`/admin/api/aliases/${forward.id}`, { target: op.target })
        : api.post('/admin/api/aliases', { address: mailbox.address, target: op.target });
    },
    onSuccess: () => {
      invalidate();
      setStatus({ kind: 'ok', text: t('mailboxes.statusForwardUpdated') });
    },
    onError: (err) => {
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : t('common.failed') });
    },
  });

  const onForward = () => {
    const current = forwardTargets(forward, mailbox.address).join(', ');
    const input = window.prompt(
      t('mailboxes.promptForward', { address: mailbox.address }),
      current,
    );
    if (input === null) return;
    const trimmed = input.trim();
    if (trimmed === '') {
      setForward.mutate({ kind: 'clear' });
      return;
    }
    const keepCopy = window.confirm(t('mailboxes.promptKeepCopy'));
    const target = keepCopy ? `${mailbox.address}, ${trimmed}` : trimmed;
    setForward.mutate({ kind: 'set', target });
  };

  const changePassword = useMutation({
    mutationFn: (password: string) =>
      api.patch(`/admin/api/mailboxes/${mailbox.id}/password`, { password }),
    onSuccess: () => {
      invalidate();
      setStatus({ kind: 'ok', text: t('mailboxes.statusPasswordChanged') });
    },
    onError: (err) => {
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : t('common.failed') });
    },
  });

  const edit = useMutation({
    mutationFn: (body: {
      quotaMb?: number | null;
      active?: boolean;
      sendBlocked?: boolean;
      receiveBlocked?: boolean;
    }) => api.patch(`/admin/api/mailboxes/${mailbox.id}`, body),
    onSuccess: () => {
      invalidate();
      setStatus({ kind: 'ok', text: t('mailboxes.statusMailboxUpdated') });
    },
    onError: (err) => {
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : t('common.failed') });
    },
  });

  const onChangePassword = () => {
    const password = window.prompt(t('mailboxes.promptNewPassword', { address: mailbox.address }));
    if (!password) return;
    changePassword.mutate(password);
  };

  const onEdit = () => {
    const quotaInput = window.prompt(
      t('mailboxes.promptQuota', { address: mailbox.address }),
      mailbox.quotaMb != null ? String(mailbox.quotaMb) : '',
    );
    if (quotaInput === null) return;
    const trimmed = quotaInput.trim();
    const quotaMb = trimmed === '' ? null : Number(trimmed);
    if (quotaMb !== null && (!Number.isFinite(quotaMb) || quotaMb < 0)) {
      setStatus({ kind: 'error', text: t('mailboxes.quotaError') });
      return;
    }
    const currentActiveWord = mailbox.active
      ? t('mailboxes.activeWord')
      : t('mailboxes.inactiveWord');
    const active = window.confirm(t('mailboxes.promptActive', { current: currentActiveWord }));
    edit.mutate({ quotaMb, active });
  };

  const busy = changePassword.isPending || edit.isPending || setForward.isPending;

  return (
    <span className="space-x-3">
      <button
        type="button"
        onClick={onChangePassword}
        disabled={busy}
        className="text-indigo-600 hover:underline text-xs disabled:opacity-50"
      >
        {t('mailboxes.changePassword')}
      </button>
      <button
        type="button"
        onClick={onForward}
        disabled={busy}
        className="text-indigo-600 hover:underline text-xs disabled:opacity-50"
      >
        {forwardTargets(forward, mailbox.address).length
          ? t('mailboxes.editForwarding')
          : t('mailboxes.forward')}
      </button>
      <button
        type="button"
        onClick={onEdit}
        disabled={busy}
        className="text-indigo-600 hover:underline text-xs disabled:opacity-50"
      >
        {t('common.edit')}
      </button>
      <button
        type="button"
        onClick={() => edit.mutate({ sendBlocked: !mailbox.sendBlocked })}
        disabled={busy}
        className="text-indigo-600 hover:underline text-xs disabled:opacity-50"
      >
        {mailbox.sendBlocked ? t('mailboxes.allowSend') : t('mailboxes.blockSend')}
      </button>
      <button
        type="button"
        onClick={() => edit.mutate({ receiveBlocked: !mailbox.receiveBlocked })}
        disabled={busy}
        className="text-indigo-600 hover:underline text-xs disabled:opacity-50"
      >
        {mailbox.receiveBlocked ? t('mailboxes.allowReceive') : t('mailboxes.blockReceive')}
      </button>
      <Link
        to={`/admin/mailboxes/${mailbox.id}/sieve`}
        className="text-indigo-600 hover:underline text-xs"
      >
        {t('mailboxes.filters')}
      </Link>
      {settings.data?.autoconfigEnabled && (
        <a
          href={`/mail/mobileconfig?email=${encodeURIComponent(mailbox.address)}`}
          className="text-indigo-600 hover:underline text-xs"
        >
          {t('mailboxes.appleProfile')}
        </a>
      )}
      {status && (
        <span className={`text-xs ${status.kind === 'ok' ? 'text-slate-600' : 'text-red-700'}`}>
          {status.text}
        </span>
      )}
    </span>
  );
}
