import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { shortDate } from '../components/ResourceTable';
import type { StatsSnapshotDTO as StatsResponse } from '@contracts';
import { useT } from '../i18n';

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
  const t = useT();
  const stats = useQuery({
    queryKey: ['stats'],
    queryFn: () => api.get<StatsResponse>('/admin/api/stats'),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-semibold text-slate-900">{t('stats.title')}</h1>
        <button
          type="button"
          onClick={() => void stats.refetch()}
          disabled={stats.isFetching}
          className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          {stats.isFetching ? t('stats.refreshing') : t('common.refresh')}
        </button>
      </div>

      <p className="text-xs text-slate-500 mb-6">
        {t('stats.metricsNote')}{' '}
        <a href="/metrics" className="font-mono text-indigo-600 hover:underline">
          /metrics
        </a>{' '}
        {t('stats.metricsPlainText')}
      </p>

      {stats.isLoading && <div className="text-slate-500">{t('common.loading')}</div>}
      {stats.isError && (
        <div className="text-red-700">
          {t('stats.failedToLoad')} {(stats.error as Error).message}
        </div>
      )}

      {stats.data && (
        <div className="space-y-8">
          <section>
            <div className="flex items-baseline justify-between mb-2">
              <h2 className="text-lg font-semibold text-slate-900">{t('stats.sendQueue')}</h2>
              <span className="text-xs text-slate-500">
                {t('stats.last24hNote', {
                  done: stats.data.jobs.last24hDone,
                  failed: stats.data.jobs.last24hFailed,
                })}
              </span>
            </div>
            <StatGrid
              stats={[
                { label: t('stats.pending'), value: stats.data.jobs.pending },
                { label: t('stats.processing'), value: stats.data.jobs.processing },
                { label: t('stats.done'), value: stats.data.jobs.done },
                { label: t('stats.dead'), value: stats.data.jobs.dead },
              ]}
            />
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">{t('stats.webhooks')}</h2>
            <StatGrid
              stats={[
                { label: t('stats.pending'), value: stats.data.webhooks.pending },
                { label: t('stats.done'), value: stats.data.webhooks.done },
                { label: t('stats.dead'), value: stats.data.webhooks.dead },
              ]}
            />
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">{t('stats.inventory')}</h2>
            <StatGrid
              stats={[
                { label: t('stats.domains'), value: stats.data.counts.domains },
                { label: t('stats.mailboxes'), value: stats.data.counts.mailboxes },
                { label: t('stats.aliases'), value: stats.data.counts.aliases },
                { label: t('stats.smtpAccounts'), value: stats.data.counts.smtpAccounts },
                { label: t('stats.apiKeys'), value: stats.data.counts.apiKeys },
              ]}
            />
          </section>

          <p className="text-xs text-slate-500">
            {t('stats.generatedAt', { date: shortDate(stats.data.generatedAt) })}
          </p>
        </div>
      )}
    </div>
  );
}
