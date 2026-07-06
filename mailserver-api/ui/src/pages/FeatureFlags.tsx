import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { shortDate } from '../components/ResourceTable';
import type { FeatureFlagDTO as Flag } from '@contracts';
import { useT } from '../i18n';

export function FeatureFlagsPage() {
  const t = useT();
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: ['feature-flags'],
    queryFn: () => api.get<Flag[]>('/admin/api/feature-flags'),
  });

  const toggle = useMutation({
    mutationFn: (vars: { key: string; enabled: boolean }) =>
      api.patch<Flag>(`/admin/api/feature-flags/${vars.key}`, { enabled: vars.enabled }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['feature-flags'] });
    },
  });

  const reset = useMutation({
    mutationFn: (key: string) => api.delete<Flag>(`/admin/api/feature-flags/${key}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['feature-flags'] });
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 mb-4">{t('featureFlags.title')}</h1>

      <div className="bg-white rounded shadow overflow-hidden">
        {list.isLoading && <div className="p-4 text-slate-500">{t('common.loading')}</div>}
        {list.data && (
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="text-left px-4 py-2 font-medium">{t('featureFlags.colFlag')}</th>
                <th className="text-left px-4 py-2 font-medium">{t('featureFlags.colState')}</th>
                <th className="text-left px-4 py-2 font-medium">{t('featureFlags.colDefault')}</th>
                <th className="text-left px-4 py-2 font-medium">{t('featureFlags.colUpdated')}</th>
                <th className="text-right px-4 py-2 font-medium">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((f) => (
                <tr key={f.key} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs">{f.key}</div>
                    <div className="text-slate-600 text-xs mt-1">{f.description}</div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggle.mutate({ key: f.key, enabled: !f.enabled })}
                      disabled={toggle.isPending}
                      className={`px-2 py-0.5 rounded text-xs ${
                        f.enabled
                          ? 'bg-green-100 text-green-800 hover:bg-green-200'
                          : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                      } disabled:opacity-50`}
                    >
                      {f.enabled ? t('featureFlags.enabled') : t('featureFlags.disabled')}
                    </button>
                    {f.override && (
                      <span className="ml-2 text-xs text-amber-700">
                        {t('featureFlags.override')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {f.default ? t('featureFlags.enabled') : t('featureFlags.disabled')}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{shortDate(f.updatedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    {f.override && (
                      <button
                        type="button"
                        onClick={() => reset.mutate(f.key)}
                        className="text-indigo-600 hover:underline text-xs"
                      >
                        {t('featureFlags.resetToDefault')}
                      </button>
                    )}
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
