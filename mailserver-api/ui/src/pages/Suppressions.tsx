import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SuppressionDTO, SuppressionReasonDTO } from '@contracts';
import { api } from '../api';
import { useT } from '../i18n';

const REASONS: SuppressionReasonDTO[] = ['manual', 'complaint', 'unsubscribe', 'hard_bounce'];

const REASON_STYLE: Record<SuppressionReasonDTO, string> = {
  hard_bounce: 'bg-red-100 text-red-800',
  complaint: 'bg-amber-100 text-amber-800',
  unsubscribe: 'bg-slate-100 text-slate-700',
  manual: 'bg-slate-100 text-slate-700',
};

export function SuppressionsPage() {
  const t = useT();
  const queryClient = useQueryClient();
  const [address, setAddress] = useState('');
  const [reason, setReason] = useState<SuppressionReasonDTO>('manual');
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const rows = useQuery({
    queryKey: ['suppressions'],
    queryFn: () => api.get<SuppressionDTO[]>('/admin/api/suppressions'),
  });
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['suppressions'] });

  const add = useMutation({
    mutationFn: () =>
      api.post<SuppressionDTO>('/admin/api/suppressions', { address: address.trim(), reason }),
    onSuccess: () => {
      invalidate();
      setAddress('');
      setStatus({ kind: 'ok', text: t('common.add') });
    },
    onError: (err) =>
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : 'Failed' }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/api/suppressions/${id}`),
    onSuccess: invalidate,
  });

  const input = 'rounded border border-slate-300 px-2 py-1 text-sm';
  const data = rows.data ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">{t('suppressions.title')}</h1>
      <p className="text-xs text-slate-500">{t('suppressions.intro')}</p>

      <section className="rounded border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">{t('suppressions.addTitle')}</h2>
        <div className="flex flex-wrap items-end gap-2">
          <input
            className={`${input} w-64`}
            placeholder={t('suppressions.addr_placeholder')}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <select
            className={input}
            value={reason}
            onChange={(e) => setReason(e.target.value as SuppressionReasonDTO)}
          >
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {t(`suppressions.${r}`)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => add.mutate()}
            disabled={add.isPending || address.trim() === ''}
            className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {t('common.add')}
          </button>
          {status && (
            <span className={`text-xs ${status.kind === 'ok' ? 'text-green-700' : 'text-red-700'}`}>
              {status.text}
            </span>
          )}
        </div>
      </section>

      <section className="rounded border border-slate-200 bg-white p-4">
        {rows.isLoading && <p className="text-sm text-slate-500">{t('common.loading')}</p>}
        {!rows.isLoading && data.length === 0 && (
          <p className="text-sm text-slate-500">{t('suppressions.empty')}</p>
        )}
        {data.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-1 pr-2">{t('suppressions.address')}</th>
                <th className="py-1 pr-2">{t('suppressions.reason')}</th>
                <th className="py-1 pr-2">{t('suppressions.colDate')}</th>
                <th className="py-1 pr-2"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id} className="border-b border-slate-100">
                  <td className="py-1 pr-2 font-mono text-xs">{s.address}</td>
                  <td className="py-1 pr-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${REASON_STYLE[s.reason]}`}
                    >
                      {t(`suppressions.${s.reason}`)}
                    </span>
                  </td>
                  <td className="py-1 pr-2 text-xs text-slate-500">
                    {new Date(s.createdAt).toLocaleString()}
                  </td>
                  <td className="py-1 pr-2 text-right">
                    <button
                      type="button"
                      onClick={() => remove.mutate(s.id)}
                      className="text-red-600 hover:underline text-xs"
                    >
                      {t('common.delete')}
                    </button>
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
