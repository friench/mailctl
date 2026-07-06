import { useQuery } from '@tanstack/react-query';
import type { BounceEventDTO } from '@contracts';
import { api } from '../api';
import { useT } from '../i18n';

const CLASS_STYLE: Record<BounceEventDTO['classification'], string> = {
  hard: 'bg-red-100 text-red-800',
  soft: 'bg-amber-100 text-amber-800',
  unknown: 'bg-slate-100 text-slate-700',
};

export function BouncesPage() {
  const t = useT();
  const bounces = useQuery({
    queryKey: ['bounces'],
    queryFn: () => api.get<BounceEventDTO[]>('/admin/api/bounces'),
    refetchInterval: 15_000,
  });
  const rows = bounces.data ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">{t('bounces.title')}</h1>
      <p className="text-xs text-slate-500">{t('bounces.intro')}</p>

      <section className="rounded border border-slate-200 bg-white p-4">
        {bounces.isLoading && <p className="text-sm text-slate-500">{t('common.loading')}</p>}
        {!bounces.isLoading && rows.length === 0 && (
          <p className="text-sm text-slate-500">{t('bounces.empty')}</p>
        )}
        {rows.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-1 pr-2">{t('bounces.colRecipient')}</th>
                <th className="py-1 pr-2">{t('bounces.colClass')}</th>
                <th className="py-1 pr-2">{t('bounces.colStatus')}</th>
                <th className="py-1 pr-2">{t('bounces.colDiagnostic')}</th>
                <th className="py-1 pr-2">{t('bounces.colJob')}</th>
                <th className="py-1 pr-2">{t('bounces.colDate')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id} className="border-b border-slate-100 align-top">
                  <td className="py-1 pr-2 font-mono text-xs">{b.recipient}</td>
                  <td className="py-1 pr-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${CLASS_STYLE[b.classification]}`}
                    >
                      {t(`bounces.${b.classification}`)}
                    </span>
                  </td>
                  <td className="py-1 pr-2 font-mono text-xs">{b.statusCode ?? '–'}</td>
                  <td className="py-1 pr-2 text-xs text-slate-600">{b.diagnostic ?? '–'}</td>
                  <td className="py-1 pr-2 font-mono text-xs">
                    {b.sendJobId ? b.sendJobId.slice(0, 8) : '–'}
                  </td>
                  <td className="py-1 pr-2 text-xs text-slate-500">
                    {new Date(b.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
