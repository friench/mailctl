import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ResourceTable, formatBoolean, shortDate } from '../components/ResourceTable';
import { api } from '../api';
import type { DomainDTO as Domain } from '@contracts';

function SourceBadge({ source }: { source: Domain['source'] }) {
  const cls = source === 'dms' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700';
  return <span className={`text-xs px-2 py-0.5 rounded ${cls}`}>{source}</span>;
}

function ToggleActive({ domain }: { domain: Domain }) {
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
      {toggle.isPending ? '…' : domain.active ? 'Disable' : 'Enable'}
    </button>
  );
}

export function DomainsPage() {
  return (
    <ResourceTable<Domain>
      title="Domains"
      endpoint="/admin/api/domains"
      queryKey={['domains']}
      columns={[
        {
          key: 'name',
          header: 'Name',
          render: (r) => (
            <Link
              to={`/admin/domains/${r.id}`}
              className="font-mono text-indigo-600 hover:underline"
            >
              {r.name}
            </Link>
          ),
        },
        { key: 'dkim', header: 'DKIM selector', render: (r) => r.dkimSelector ?? '–' },
        {
          key: 'dkim_status',
          header: 'DKIM key',
          render: (r) => (r.dkimPublicKey ? '✓ generated' : '–'),
        },
        { key: 'active', header: 'Active', render: (r) => formatBoolean(r.active) },
        { key: 'source', header: 'Source', render: (r) => <SourceBadge source={r.source} /> },
        {
          key: 'notes',
          header: 'Notes',
          render: (r) => <span className="text-slate-500 text-xs">{r.notes ?? '–'}</span>,
        },
        { key: 'created', header: 'Created', render: (r) => shortDate(r.createdAt) },
      ]}
      rowActions={(r) => (
        <>
          <ToggleActive domain={r} />
          <Link to={`/admin/domains/${r.id}`} className="text-indigo-600 hover:underline text-xs">
            Details
          </Link>
        </>
      )}
      createFields={[
        { name: 'name', label: 'Domain name', required: true, placeholder: 'example.com' },
        { name: 'dkimSelector', label: 'DKIM selector', placeholder: 'mail' },
        { name: 'notes', label: 'Notes (optional)' },
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
