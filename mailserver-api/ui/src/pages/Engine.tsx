import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EngineOverviewDTO } from '@contracts';
import { api } from '../api';
import { useT } from '../i18n';

export function EnginePage() {
  const t = useT();
  const queryClient = useQueryClient();
  const overview = useQuery({
    queryKey: ['engine-overview'],
    queryFn: () => api.get<EngineOverviewDTO>('/admin/api/engine/overview'),
    refetchInterval: 15_000,
  });

  const restart = useMutation({
    mutationFn: (name: string) =>
      api.post(`/admin/api/engine/containers/${encodeURIComponent(name)}/restart`),
    onSuccess: () => {
      // Give Docker a moment, then refresh statuses.
      setTimeout(() => void queryClient.invalidateQueries({ queryKey: ['engine-overview'] }), 1500);
    },
  });

  const data = overview.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">{t('engine.title')}</h1>
        <button
          type="button"
          onClick={() => overview.refetch()}
          className="text-indigo-600 hover:underline text-xs"
        >
          {t('common.refresh')}
        </button>
      </div>

      {overview.isLoading && <p className="text-sm text-slate-500">{t('common.loading')}</p>}
      {data && (
        <>
          <section className="rounded border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">
                Rspamd{' '}
                <span
                  className={`ml-1 rounded px-1.5 py-0.5 text-xs font-medium ${
                    data.rspamd.enabled
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {data.rspamd.enabled ? t('engine.enabled') : t('engine.disabled')}
                </span>
              </h2>
              {data.rspamd.uiUrl && (
                <a
                  href={data.rspamd.uiUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-600 hover:underline text-sm"
                >
                  {t('engine.openRspamdUi')}
                </a>
              )}
            </div>
            {data.rspamd.stat ? (
              <div className="space-y-3">
                <dl className="grid grid-cols-4 gap-2 text-sm">
                  <Stat label={t('engine.scanned')} value={data.rspamd.stat.scanned} />
                  <Stat label={t('engine.spam')} value={data.rspamd.stat.spam} />
                  <Stat label={t('engine.ham')} value={data.rspamd.stat.ham} />
                  <Stat label={t('engine.learned')} value={data.rspamd.stat.learned} />
                </dl>
                {Object.keys(data.rspamd.stat.actions).length > 0 && (
                  <div className="text-xs">
                    <p className="mb-1 font-medium text-slate-600">{t('common.actions')}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-600">
                      {Object.entries(data.rspamd.stat.actions).map(([name, count]) => (
                        <span key={name}>
                          {name}: <span className="font-mono">{count}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">{t('engine.noRspamdStats')}</p>
            )}
          </section>

          <section className="rounded border border-slate-200 bg-white p-4">
            <h2 className="mb-3 font-semibold text-slate-900">{t('engine.containers')}</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="py-1 pr-2">{t('engine.colName')}</th>
                  <th className="py-1 pr-2">{t('engine.colState')}</th>
                  <th className="py-1 pr-2">{t('engine.colHealth')}</th>
                  <th className="py-1 pr-2">{t('engine.colImage')}</th>
                  <th className="py-1 pr-2">{t('engine.colStarted')}</th>
                  <th className="py-1 pr-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.containers.map((c) => (
                  <tr key={c.name} className="border-b border-slate-100">
                    <td className="py-1 pr-2 font-mono text-xs">{c.name}</td>
                    <td className="py-1 pr-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                          c.state === 'running'
                            ? 'bg-emerald-100 text-emerald-800'
                            : c.state === 'missing'
                              ? 'bg-slate-100 text-slate-500'
                              : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {c.state}
                      </span>
                    </td>
                    <td className="py-1 pr-2 text-xs text-slate-500">{c.health ?? '–'}</td>
                    <td className="py-1 pr-2 font-mono text-xs text-slate-500">{c.image ?? '–'}</td>
                    <td className="py-1 pr-2 text-xs text-slate-500">
                      {c.startedAt ? new Date(c.startedAt).toLocaleString() : '–'}
                    </td>
                    <td className="py-1 pr-2 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`${t('engine.restart')} ${c.name}?`))
                            restart.mutate(c.name);
                        }}
                        disabled={restart.isPending || c.state === 'missing'}
                        className="text-indigo-600 hover:underline text-xs disabled:opacity-40"
                      >
                        {t('engine.restart')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="rounded border border-slate-200 bg-white p-4">
            <h2 className="mb-3 font-semibold text-slate-900">{t('engine.featureToggles')}</h2>
            {data.features.length === 0 ? (
              <p className="text-sm text-slate-500">{t('engine.noSettings')}</p>
            ) : (
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-3">
                {data.features.map((f) => (
                  <div key={f.key} className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-slate-600">{f.key}</span>
                    <span className="font-mono text-xs text-slate-900">{f.value}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {data.dovecot.stats.columns.length > 0 && (
            <section className="rounded border border-slate-200 bg-white p-4">
              <h2 className="mb-3 font-semibold text-slate-900">{t('engine.dovecotStats')}</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                      {data.dovecot.stats.columns.map((c) => (
                        <th key={c} className="py-1 pr-3 font-medium">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.dovecot.stats.rows.map((row, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        {row.map((cell, j) => (
                          <td key={j} className="py-1 pr-3 font-mono text-slate-700">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded bg-slate-50 p-2">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-mono text-lg text-slate-900">{value.toLocaleString()}</dd>
    </div>
  );
}
