import type { ApiKeyDTO as ApiKey, CreatedApiKeyDTO as CreatedApiKey } from '@contracts';
import { ResourceTable, shortDate } from '../components/ResourceTable';
import { useT } from '../i18n';

export function ApiKeysPage() {
  const t = useT();
  return (
    <ResourceTable<ApiKey>
      title={t('apiKeys.title')}
      endpoint="/admin/api/api-keys"
      queryKey={['api-keys']}
      columns={[
        { key: 'name', header: t('apiKeys.colName'), render: (r) => r.name },
        {
          key: 'prefix',
          header: t('apiKeys.colPrefix'),
          render: (r) => <span className="font-mono">{r.prefix}…</span>,
        },
        {
          key: 'scopes',
          header: t('apiKeys.colScopes'),
          render: (r) => r.scopes.join(', ') || '–',
        },
        {
          key: 'lastUsed',
          header: t('apiKeys.colLastUsed'),
          render: (r) => shortDate(r.lastUsedAt),
        },
        {
          key: 'revoked',
          header: t('apiKeys.colRevoked'),
          render: (r) => (r.revokedAt ? '✓' : '–'),
        },
        { key: 'expires', header: t('apiKeys.colExpires'), render: (r) => shortDate(r.expiresAt) },
        { key: 'created', header: t('common.created'), render: (r) => shortDate(r.createdAt) },
      ]}
      createFields={[
        { name: 'name', label: t('apiKeys.fieldName'), required: true, placeholder: 'my-app' },
        { name: 'scopes', label: t('apiKeys.fieldScopes') },
        { name: 'expiresInDays', label: t('apiKeys.fieldExpiresInDays'), type: 'number' },
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
            <p className="text-sm text-amber-700 mb-2">{t('apiKeys.saveKeyNow')}</p>
            <div className="bg-slate-900 text-slate-100 rounded p-3 font-mono text-xs break-all">
              {created.plain}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {t('apiKeys.colPrefix')} <span className="font-mono">{created.prefix}</span> · ID{' '}
              {created.id}
            </p>
          </div>
        );
      }}
    />
  );
}
