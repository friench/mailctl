import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import type { HealthDTO as HealthResponse, StatsSnapshotDTO as StatsResponse } from '@contracts';
import { useT } from '../i18n';

export function Dashboard() {
  const t = useT();
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api.get<HealthResponse>('/health'),
    refetchInterval: 5_000,
  });

  const stats = useQuery({
    queryKey: ['stats'],
    queryFn: () => api.get<StatsResponse>('/admin/api/stats'),
    refetchInterval: 5_000,
  });

  const jobs = useQuery({
    queryKey: ['jobs', 'recent'],
    queryFn: () =>
      api.get<{ id: string; status: string; createdAt: string; account: string | null }[]>('/jobs'),
    refetchInterval: 5_000,
  });

  const counts = stats.data?.counts;
  const jobStats = stats.data?.jobs;

  const counters = [
    { label: t('dashboard.status'), value: health.data?.status ?? '…' },
    {
      label: t('dashboard.smtpAccounts'),
      value: String(counts?.smtpAccounts ?? health.data?.accounts ?? '…'),
    },
    { label: t('dashboard.domains'), value: String(counts?.domains ?? '…') },
    { label: t('dashboard.mailboxes'), value: String(counts?.mailboxes ?? '…') },
    { label: t('dashboard.aliases'), value: String(counts?.aliases ?? '…') },
    { label: t('dashboard.apiKeys'), value: String(counts?.apiKeys ?? '…') },
    {
      label: t('dashboard.uptime'),
      value: health.data ? formatUptime(health.data.uptime) : '…',
    },
  ];

  const queueSummary = [
    { label: t('dashboard.pending'), value: jobStats?.pending },
    { label: t('dashboard.processing'), value: jobStats?.processing },
    { label: t('dashboard.done24h'), value: jobStats?.last24hDone },
    { label: t('dashboard.failed24h'), value: jobStats?.last24hFailed },
    { label: t('dashboard.dead'), value: jobStats?.dead },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 mb-4">{t('dashboard.title')}</h1>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        {counters.map((c) => (
          <div key={c.label} className="bg-white rounded shadow p-4">
            <div className="text-xs uppercase text-slate-500">{c.label}</div>
            <div className="text-xl font-semibold mt-1">{c.value}</div>
          </div>
        ))}
      </div>

      <h2 className="text-lg font-semibold text-slate-900 mb-2">{t('dashboard.sendQueue')}</h2>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {queueSummary.map((q) => (
          <div key={q.label} className="bg-white rounded shadow p-4">
            <div className="text-xs uppercase text-slate-500">{q.label}</div>
            <div className="text-xl font-semibold mt-1">{q.value ?? '…'}</div>
          </div>
        ))}
      </div>

      <h2 className="text-lg font-semibold text-slate-900 mb-2">{t('dashboard.recentJobs')}</h2>
      <div className="bg-white rounded shadow overflow-hidden">
        {jobs.isLoading && <div className="p-4 text-slate-500">{t('common.loading')}</div>}
        {jobs.data && (
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="text-left px-4 py-2 font-medium">{t('dashboard.colId')}</th>
                <th className="text-left px-4 py-2 font-medium">{t('dashboard.colStatus')}</th>
                <th className="text-left px-4 py-2 font-medium">{t('dashboard.colAccount')}</th>
                <th className="text-left px-4 py-2 font-medium">{t('dashboard.colCreated')}</th>
              </tr>
            </thead>
            <tbody>
              {jobs.data.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                    {t('dashboard.noRecentJobs')}
                  </td>
                </tr>
              )}
              {jobs.data.map((j) => (
                <tr key={j.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-mono text-xs">{j.id.slice(0, 8)}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={j.status} />
                  </td>
                  <td className="px-4 py-2">{j.account ?? '–'}</td>
                  <td className="px-4 py-2 text-slate-600 text-xs">
                    {new Date(j.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'done'
      ? 'bg-green-100 text-green-800'
      : status === 'pending' || status === 'processing'
        ? 'bg-yellow-100 text-yellow-800'
        : status === 'dead'
          ? 'bg-red-100 text-red-800'
          : 'bg-slate-100 text-slate-700';
  return <span className={`px-2 py-0.5 rounded text-xs ${cls}`}>{status}</span>;
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}
