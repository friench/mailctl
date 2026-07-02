import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ResourceTable, formatBoolean, shortDate } from '../components/ResourceTable';
import { api } from '../api';
import type {
  WebhookDTO as Webhook,
  CreatedWebhookDTO as CreatedWebhook,
  WebhookDeliveryDTO as Delivery,
} from '@contracts';

const ALL_EVENTS = ['send.completed', 'send.failed', 'mailbox.created', 'mailbox.deleted'];

export function WebhooksPage() {
  return (
    <div>
      <ResourceTable<Webhook>
        title="Webhooks"
        endpoint="/admin/api/webhooks"
        queryKey={['webhooks']}
        columns={[
          { key: 'name', header: 'Name', render: (r) => r.name },
          {
            key: 'url',
            header: 'URL',
            render: (r) => <span className="font-mono text-xs">{r.url}</span>,
          },
          { key: 'events', header: 'Events', render: (r) => r.events.join(', ') },
          { key: 'active', header: 'Active', render: (r) => formatBoolean(r.active) },
          { key: 'created', header: 'Created', render: (r) => shortDate(r.createdAt) },
        ]}
        createFields={[
          { name: 'name', label: 'Name', required: true, placeholder: 'my-app' },
          {
            name: 'url',
            label: 'URL',
            required: true,
            placeholder: 'https://example.com/hook',
          },
          {
            name: 'events',
            label: `Events (comma-separated; choose from: ${ALL_EVENTS.join(', ')})`,
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
              <p className="text-sm text-amber-700 mb-2">
                Save this signing secret now — it will not be shown again.
              </p>
              <div className="bg-slate-900 text-slate-100 rounded p-3 font-mono text-xs break-all">
                {created.secret}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Use it to verify HMAC-SHA256 signatures on incoming webhooks (header:{' '}
                <span className="font-mono">X-Webhook-Signature</span>).
              </p>
            </div>
          );
        }}
        rowActions={(row) => <WebhookRowActions webhook={row} />}
      />
    </div>
  );
}

function WebhookRowActions({ webhook }: { webhook: Webhook }) {
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
        {test.isPending ? 'Pinging…' : 'Test'}
      </button>
      <button
        type="button"
        onClick={() => toggle.mutate()}
        disabled={toggle.isPending}
        className="text-indigo-600 hover:underline text-xs disabled:opacity-50"
      >
        {toggle.isPending ? 'Saving…' : webhook.active ? 'Disable' : 'Enable'}
      </button>
      <button
        type="button"
        onClick={() => {
          const url = window.prompt('Webhook URL', webhook.url);
          if (url && url.trim() && url.trim() !== webhook.url) {
            editUrl.mutate(url.trim());
          }
        }}
        disabled={editUrl.isPending}
        className="text-indigo-600 hover:underline text-xs disabled:opacity-50"
      >
        {editUrl.isPending ? 'Saving…' : 'Edit URL'}
      </button>
      {showResult && test.data && (
        <span className="text-xs text-slate-600">
          → {test.data.status}
          {test.data.lastResponseStatus ? ` (${test.data.lastResponseStatus})` : ''}
        </span>
      )}
      {(toggle.isSuccess || editUrl.isSuccess) && !anyError && (
        <span className="text-xs text-green-700">Saved</span>
      )}
      {anyError && (
        <span className="text-xs text-red-700">
          {anyError instanceof Error ? anyError.message : 'Update failed'}
        </span>
      )}
    </span>
  );
}

export function WebhookDeliveriesPage({ webhookId }: { webhookId: string }) {
  const list = useQuery({
    queryKey: ['webhook-deliveries', webhookId],
    queryFn: () => api.get<Delivery[]>(`/admin/api/webhooks/${webhookId}/deliveries`),
    refetchInterval: 5_000,
  });

  return (
    <div>
      {list.isLoading && <div className="p-4 text-slate-500">Loading…</div>}
      {list.data && (
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Event</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
              <th className="text-left px-4 py-2 font-medium">Response</th>
              <th className="text-left px-4 py-2 font-medium">Created</th>
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
