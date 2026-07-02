import type { ApiKeyDTO as ApiKey, CreatedApiKeyDTO as CreatedApiKey } from '@contracts';
import { ResourceTable, shortDate } from '../components/ResourceTable';

export function ApiKeysPage() {
  return (
    <ResourceTable<ApiKey>
      title="API keys"
      endpoint="/admin/api/api-keys"
      queryKey={['api-keys']}
      columns={[
        { key: 'name', header: 'Name', render: (r) => r.name },
        {
          key: 'prefix',
          header: 'Prefix',
          render: (r) => <span className="font-mono">{r.prefix}…</span>,
        },
        { key: 'scopes', header: 'Scopes', render: (r) => r.scopes.join(', ') || '–' },
        { key: 'lastUsed', header: 'Last used', render: (r) => shortDate(r.lastUsedAt) },
        { key: 'revoked', header: 'Revoked', render: (r) => (r.revokedAt ? '✓' : '–') },
        { key: 'expires', header: 'Expires', render: (r) => shortDate(r.expiresAt) },
        { key: 'created', header: 'Created', render: (r) => shortDate(r.createdAt) },
      ]}
      createFields={[
        { name: 'name', label: 'Name', required: true, placeholder: 'my-app' },
        { name: 'scopes', label: 'Scopes (comma-separated, e.g. "send" or "admin")' },
        { name: 'expiresInDays', label: 'Expires in days (optional)', type: 'number' },
      ]}
      transformCreate={(values) => {
        const body: Record<string, unknown> = { name: values.name };
        const scopes = String(values.scopes ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (scopes.length > 0) body.scopes = scopes;
        if (values.expiresInDays) {
          body.expiresAt = new Date(
            Date.now() + Number(values.expiresInDays) * 86_400_000,
          ).toISOString();
        }
        return body;
      }}
      renderCreateResult={(result) => {
        const created = result as CreatedApiKey;
        return (
          <div>
            <p className="text-sm text-amber-700 mb-2">
              Save this key now — it will not be shown again.
            </p>
            <div className="bg-slate-900 text-slate-100 rounded p-3 font-mono text-xs break-all">
              {created.plain}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Prefix <span className="font-mono">{created.prefix}</span> · ID {created.id}
            </p>
          </div>
        );
      }}
    />
  );
}
