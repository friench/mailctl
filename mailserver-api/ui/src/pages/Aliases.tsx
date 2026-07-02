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
        { key: 'created', header: 'Created', render: (r) => shortDate(r.createdAt) },
      ]}
      createFields={[
        {
          name: 'address',
          label: 'Alias address',
          required: true,
          placeholder: 'info@example.com',
        },
        {
          name: 'target',
          label: 'Target(s), comma-separated',
          required: true,
          placeholder: 'user@example.com',
        },
      ]}
    />
  );
}
