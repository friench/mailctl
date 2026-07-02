import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { shortDate } from '../components/ResourceTable';
import type { StatsSnapshotDTO as StatsResponse } from '@contracts';

interface Stat {
  label: string;
  value: number;
}

function StatGrid({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {stats.map((s) => (
        <div key={s.label} className="bg-white rounded shadow p-4">
          <div className="text-xs uppercase text-slate-500">{s.label}</div>
          <div className="text-2xl font-semibold mt-1">{s.value}</div>
        </div>
      ))}
    </div>
  );
}

export function StatsPage() {
  const stats = useQuery({
    queryKey: ['stats'],
    queryFn: () => api.get<StatsResponse>('/admin/api/stats'),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-semibold text-slate-900">Stats</h1>
        <button
          type="button"
          onClick={() => void stats.refetch()}
          disabled={stats.isFetching}
          className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          {stats.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <p className="text-xs text-slate-500 mb-6">
        Raw Prometheus metrics are available at{' '}
        <a href="/metrics" className="font-mono text-indigo-600 hover:underline">
          /metrics
        </a>{' '}
        (plain text).
      </p>

      {stats.isLoading && <div className="text-slate-500">Loading…</div>}
      {stats.isError && (
        <div className="text-red-700">Failed to load: {(stats.error as Error).message}</div>
      )}

      {stats.data && (
        <div className="space-y-8">
          <section>
            <div className="flex items-baseline justify-between mb-2">
              <h2 className="text-lg font-semibold text-slate-900">Send queue</h2>
              <span className="text-xs text-slate-500">
                last 24h: done {stats.data.jobs.last24hDone} · failed{' '}
                {stats.data.jobs.last24hFailed}
              </span>
            </div>
            <StatGrid
              stats={[
                { label: 'Pending', value: stats.data.jobs.pending },
                { label: 'Processing', value: stats.data.jobs.processing },
                { label: 'Done', value: stats.data.jobs.done },
                { label: 'Dead', value: stats.data.jobs.dead },
              ]}
            />
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Webhooks</h2>
            <StatGrid
              stats={[
                { label: 'Pending', value: stats.data.webhooks.pending },
                { label: 'Done', value: stats.data.webhooks.done },
                { label: 'Dead', value: stats.data.webhooks.dead },
              ]}
            />
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Inventory</h2>
            <StatGrid
              stats={[
                { label: 'Domains', value: stats.data.counts.domains },
                { label: 'Mailboxes', value: stats.data.counts.mailboxes },
                { label: 'Aliases', value: stats.data.counts.aliases },
                { label: 'SMTP accounts', value: stats.data.counts.smtpAccounts },
                { label: 'API keys', value: stats.data.counts.apiKeys },
              ]}
            />
          </section>

          <p className="text-xs text-slate-500">Generated at {shortDate(stats.data.generatedAt)}</p>
        </div>
      )}
    </div>
  );
}
