import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ResourceTable, formatBoolean, shortDate } from '../components/ResourceTable';
import { api } from '../api';
import type { AliasDTO as Alias, MailboxDTO as Mailbox } from '@contracts';
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
        <Link to={`/admin/mailboxes/${row.id}`} className="text-indigo-600 hover:underline text-xs">
          {t('mailboxes.settings')} →
        </Link>
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
