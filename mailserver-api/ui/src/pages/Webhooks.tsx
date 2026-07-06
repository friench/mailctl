import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ResourceTable, formatBoolean, shortDate } from '../components/ResourceTable';
import { api } from '../api';
import type {
  WebhookDTO as Webhook,
  CreatedWebhookDTO as CreatedWebhook,
  WebhookDeliveryDTO as Delivery,
} from '@contracts';
import { useT } from '../i18n';

const ALL_EVENTS = [
  'send.completed',
  'send.failed',
  'send.bounced',
  'mailbox.created',
  'mailbox.deleted',
  'sync.divergence_detected',
];

export function WebhooksPage() {
  const t = useT();
  return (
    <div>
      <ResourceTable<Webhook>
        title={t('webhooks.title')}
        endpoint="/admin/api/webhooks"
        queryKey={['webhooks']}
        columns={[
          { key: 'name', header: t('webhooks.colName'), render: (r) => r.name },
          {
            key: 'url',
            header: t('webhooks.colUrl'),
            render: (r) => <span className="font-mono text-xs">{r.url}</span>,
          },
          { key: 'events', header: t('webhooks.colEvents'), render: (r) => r.events.join(', ') },
          {
            key: 'active',
            header: t('webhooks.colActive'),
            render: (r) => formatBoolean(r.active),
          },
          { key: 'created', header: t('common.created'), render: (r) => shortDate(r.createdAt) },
        ]}
        createFields={[
          { name: 'name', label: t('webhooks.fieldName'), required: true, placeholder: 'my-app' },
          {
            name: 'url',
            label: t('webhooks.fieldUrl'),
            required: true,
            placeholder: 'https://example.com/hook',
          },
          {
            name: 'events',
            label: t('webhooks.fieldEvents', { events: ALL_EVENTS.join(', ') }),
            required: true,
            placeholder: 'send.completed,send.failed',
          },
        ]}
        transformCreate={(values) => ({
          name: values.name,
          url: values.url,
          events: String(values.events ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        })}
        renderCreateResult={(result) => {
          const created = result as CreatedWebhook;
          return (
            <div>
              <p className="text-sm text-amber-700 mb-2">{t('webhooks.saveSecretNow')}</p>
              <div className="bg-slate-900 text-slate-100 rounded p-3 font-mono text-xs break-all">
                {created.secret}
              </div>
              <p className="text-xs text-slate-500 mt-2">{t('webhooks.secretUsage')}</p>
            </div>
          );
        }}
        rowActions={(row) => <WebhookRowActions webhook={row} />}
      />
    </div>
  );
}

function WebhookRowActions({ webhook }: { webhook: Webhook }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [showResult, setShowResult] = useState(false);

  const invalidateList = () => queryClient.invalidateQueries({ queryKey: ['webhooks'] });

  const test = useMutation({
    mutationFn: () => api.post<Delivery>(`/admin/api/webhooks/${webhook.id}/test`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['webhook-deliveries', webhook.id] });
      setShowResult(true);
    },
  });

  const toggle = useMutation({
    mutationFn: () =>
      api.patch<Webhook>(`/admin/api/webhooks/${webhook.id}`, { active: !webhook.active }),
    onSuccess: () => {
      void invalidateList();
    },
  });

  const editUrl = useMutation({
    mutationFn: (url: string) => api.patch<Webhook>(`/admin/api/webhooks/${webhook.id}`, { url }),
    onSuccess: () => {
      void invalidateList();
    },
  });

  const anyError = toggle.error ?? editUrl.error;

  return (
    <span className="space-x-3">
      <button
        type="button"
        onClick={() => test.mutate()}
        disabled={test.isPending}
        className="text-indigo-600 hover:underline text-xs disabled:opacity-50"
      >
        {test.isPending ? t('webhooks.pinging') : t('webhooks.test')}
      </button>
      <button
        type="button"
        onClick={() => toggle.mutate()}
        disabled={toggle.isPending}
        className="text-indigo-600 hover:underline text-xs disabled:opacity-50"
      >
        {toggle.isPending
          ? t('common.saving')
          : webhook.active
            ? t('webhooks.disable')
            : t('webhooks.enable')}
      </button>
      <button
        type="button"
        onClick={() => {
          const url = window.prompt(t('webhooks.promptWebhookUrl'), webhook.url);
          if (url && url.trim() && url.trim() !== webhook.url) {
            editUrl.mutate(url.trim());
          }
        }}
        disabled={editUrl.isPending}
        className="text-indigo-600 hover:underline text-xs disabled:opacity-50"
      >
        {editUrl.isPending ? t('common.saving') : t('webhooks.editUrl')}
      </button>
      {showResult && test.data && (
        <span className="text-xs text-slate-600">
          → {test.data.status}
          {test.data.lastResponseStatus ? ` (${test.data.lastResponseStatus})` : ''}
        </span>
      )}
      {(toggle.isSuccess || editUrl.isSuccess) && !anyError && (
        <span className="text-xs text-green-700">{t('webhooks.saved')}</span>
      )}
      {anyError && (
        <span className="text-xs text-red-700">
          {anyError instanceof Error ? anyError.message : t('webhooks.updateFailed')}
        </span>
      )}
    </span>
  );
}

export function WebhookDeliveriesPage({ webhookId }: { webhookId: string }) {
  const t = useT();
  const list = useQuery({
    queryKey: ['webhook-deliveries', webhookId],
    queryFn: () => api.get<Delivery[]>(`/admin/api/webhooks/${webhookId}/deliveries`),
    refetchInterval: 5_000,
  });

  return (
    <div>
      {list.isLoading && <div className="p-4 text-slate-500">{t('common.loading')}</div>}
      {list.data && (
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="text-left px-4 py-2 font-medium">{t('webhooks.deliveryColEvent')}</th>
              <th className="text-left px-4 py-2 font-medium">{t('webhooks.deliveryColStatus')}</th>
              <th className="text-left px-4 py-2 font-medium">
                {t('webhooks.deliveryColResponse')}
              </th>
              <th className="text-left px-4 py-2 font-medium">{t('common.created')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data.map((d) => (
              <tr key={d.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-mono text-xs">{d.event}</td>
                <td className="px-4 py-2">{d.status}</td>
                <td className="px-4 py-2 text-xs">
                  {d.lastResponseStatus ?? '–'}
                  {d.lastError && <div className="text-red-700">{d.lastError}</div>}
                </td>
                <td className="px-4 py-2 text-xs text-slate-600">
                  {new Date(d.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
