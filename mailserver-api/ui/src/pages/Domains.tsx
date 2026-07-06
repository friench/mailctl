import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ResourceTable, formatBoolean, shortDate } from '../components/ResourceTable';
import { api } from '../api';
import type { DomainDTO as Domain } from '@contracts';
import { useT } from '../i18n';

function SourceBadge({ source }: { source: Domain['source'] }) {
  const cls = source === 'dms' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700';
  return <span className={`text-xs px-2 py-0.5 rounded ${cls}`}>{source}</span>;
}

function ToggleActive({ domain }: { domain: Domain }) {
  const t = useT();
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: () => api.patch(`/admin/api/domains/${domain.id}`, { active: !domain.active }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['domains'] });
    },
  });

  return (
    <button
      type="button"
      onClick={() => toggle.mutate()}
      disabled={toggle.isPending}
      className="text-indigo-600 hover:underline text-xs disabled:opacity-50"
    >
      {toggle.isPending ? '…' : domain.active ? t('domains.disable') : t('domains.enable')}
    </button>
  );
}

export function DomainsPage() {
  const t = useT();
  return (
    <ResourceTable<Domain>
      title={t('domains.title')}
      endpoint="/admin/api/domains"
      queryKey={['domains']}
      columns={[
        {
          key: 'name',
          header: t('domains.colName'),
          render: (r) => (
            <Link
              to={`/admin/domains/${r.id}`}
              className="font-mono text-indigo-600 hover:underline"
            >
              {r.name}
            </Link>
          ),
        },
        { key: 'dkim', header: t('domains.dkimSelector'), render: (r) => r.dkimSelector ?? '–' },
        {
          key: 'dkim_status',
          header: t('domains.colDkimKey'),
          render: (r) => (r.dkimPublicKey ? t('domains.dkimGenerated') : '–'),
        },
        { key: 'active', header: t('domains.colActive'), render: (r) => formatBoolean(r.active) },
        {
          key: 'source',
          header: t('domains.colSource'),
          render: (r) => <SourceBadge source={r.source} />,
        },
        {
          key: 'notes',
          header: t('domains.colNotes'),
          render: (r) => <span className="text-slate-500 text-xs">{r.notes ?? '–'}</span>,
        },
        { key: 'created', header: t('domains.colCreated'), render: (r) => shortDate(r.createdAt) },
      ]}
      rowActions={(r) => (
        <>
          <ToggleActive domain={r} />
          <Link to={`/admin/domains/${r.id}`} className="text-indigo-600 hover:underline text-xs">
            {t('domains.details')}
          </Link>
        </>
      )}
      createFields={[
        {
          name: 'name',
          label: t('domains.fieldDomainName'),
          required: true,
          placeholder: 'example.com',
        },
        { name: 'dkimSelector', label: t('domains.dkimSelector'), placeholder: 'mail' },
        { name: 'notes', label: t('domains.fieldNotes') },
      ]}
      transformCreate={(values) => {
        const body: Record<string, unknown> = { name: values.name };
        if (values.dkimSelector) body.dkimSelector = values.dkimSelector;
        if (values.notes) body.notes = values.notes;
        return body;
      }}
    />
  );
}
