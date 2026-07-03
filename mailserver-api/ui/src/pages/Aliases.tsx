import type { AliasDTO as Alias } from '@contracts';
import { ResourceTable, shortDate } from '../components/ResourceTable';

export function AliasesPage() {
  return (
    <ResourceTable<Alias>
      title="Aliases"
      endpoint="/admin/api/aliases"
      queryKey={['aliases']}
      columns={[
        {
          key: 'address',
          header: 'Alias',
          render: (r) => <span className="font-mono">{r.address}</span>,
        },
        {
          key: 'target',
          header: 'Target',
          render: (r) => <span className="font-mono">{r.target}</span>,
        },
        { key: 'source', header: 'Source', render: (r) => r.source },
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
          label: 'Alias address (use @domain for a catch-all)',
          required: true,
          placeholder: 'info@example.com or @example.com',
        },
        {
          name: 'target',
          label: 'Target(s) — email, @domain, or devnull to discard',
          required: true,
          placeholder: 'user@example.com, @other.com, devnull',
        },
        { name: 'notes', label: 'Notes (optional)' },
      ]}
      transformCreate={(values) => {
        const body: Record<string, unknown> = {
          address: values.address,
          target: values.target,
        };
        if (values.notes) body.notes = values.notes;
        return body;
      }}
    />
  );
}
