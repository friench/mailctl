import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AccessActionDTO, AccessMatchTypeDTO, AccessRuleDTO } from '@contracts';
import { api } from '../api';
import { useT } from '../i18n';

const MATCH_TYPES: AccessMatchTypeDTO[] = ['email', 'domain', 'ip'];
const ACTIONS: AccessActionDTO[] = ['block', 'allow'];

export function AccessListsPage() {
  const t = useT();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    matchType: 'email' as AccessMatchTypeDTO,
    action: 'block' as AccessActionDTO,
    value: '',
    recipient: '',
    note: '',
  });
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const rules = useQuery({
    queryKey: ['access-rules'],
    queryFn: () => api.get<AccessRuleDTO[]>('/admin/api/access-rules'),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['access-rules'] });

  const create = useMutation({
    mutationFn: () =>
      api.post<AccessRuleDTO>('/admin/api/access-rules', {
        matchType: form.matchType,
        action: form.action,
        value: form.value.trim(),
        recipient: form.recipient.trim() || null,
        note: form.note.trim() || null,
      }),
    onSuccess: () => {
      invalidate();
      setForm((f) => ({ ...f, value: '', recipient: '', note: '' }));
      setStatus({ kind: 'ok', text: t('accessLists.ruleAdded') });
    },
    onError: (err) =>
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : t('common.failed') }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/api/access-rules/${id}`),
    onSuccess: () => {
      invalidate();
      setStatus({ kind: 'ok', text: t('accessLists.ruleRemoved') });
    },
    onError: (err) =>
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : t('common.failed') }),
  });

  const input = 'rounded border border-slate-300 px-2 py-1 text-sm';
  const data = rules.data ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">{t('accessLists.title')}</h1>
      <p className="text-xs text-slate-500">{t('accessLists.description')}</p>

      <section className="rounded border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">{t('accessLists.addRule')}</h2>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-600">
            {t('accessLists.action')}
            <select
              className={`${input} mt-1 block`}
              value={form.action}
              onChange={(e) => setForm({ ...form, action: e.target.value as AccessActionDTO })}
            >
              {ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            {t('accessLists.match')}
            <select
              className={`${input} mt-1 block`}
              value={form.matchType}
              onChange={(e) =>
                setForm({ ...form, matchType: e.target.value as AccessMatchTypeDTO })
              }
            >
              {MATCH_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            {t('accessLists.value')}
            <input
              className={`${input} mt-1 block w-56`}
              placeholder={
                form.matchType === 'ip' ? '203.0.113.0/24' : `spam@bad.example or bad.example`
              }
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
            />
          </label>
          <label className="text-xs text-slate-600">
            {t('accessLists.recipient')} ({t('common.optional')})
            <input
              className={`${input} mt-1 block w-52`}
              placeholder="user@example.org — global if empty"
              value={form.recipient}
              onChange={(e) => setForm({ ...form, recipient: e.target.value })}
            />
          </label>
          <label className="text-xs text-slate-600">
            {t('accessLists.note')} ({t('common.optional')})
            <input
              className={`${input} mt-1 block w-40`}
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </label>
          <button
            type="button"
            onClick={() => create.mutate()}
            disabled={create.isPending || form.value.trim() === ''}
            className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {create.isPending ? t('accessLists.adding') : t('common.add')}
          </button>
        </div>
        {status && (
          <p className={`mt-2 text-xs ${status.kind === 'ok' ? 'text-green-700' : 'text-red-700'}`}>
            {status.text}
          </p>
        )}
      </section>

      <section className="rounded border border-slate-200 bg-white p-4">
        {rules.isLoading && <p className="text-sm text-slate-500">{t('common.loading')}</p>}
        {!rules.isLoading && data.length === 0 && (
          <p className="text-sm text-slate-500">{t('accessLists.noRules')}</p>
        )}
        {data.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-1 pr-2">{t('accessLists.action')}</th>
                <th className="py-1 pr-2">{t('accessLists.match')}</th>
                <th className="py-1 pr-2">{t('accessLists.value')}</th>
                <th className="py-1 pr-2">{t('accessLists.colScope')}</th>
                <th className="py-1 pr-2">{t('accessLists.note')}</th>
                <th className="py-1 pr-2"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="py-1 pr-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                        r.action === 'block'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {r.action}
                    </span>
                  </td>
                  <td className="py-1 pr-2 text-xs text-slate-500">{r.matchType}</td>
                  <td className="py-1 pr-2 font-mono text-xs">{r.value}</td>
                  <td className="py-1 pr-2 text-xs">
                    {r.recipient ? (
                      <span className="font-mono text-slate-600">→ {r.recipient}</span>
                    ) : (
                      <span className="text-slate-400">{t('accessLists.global')}</span>
                    )}
                  </td>
                  <td className="py-1 pr-2 text-xs text-slate-500">{r.note ?? '–'}</td>
                  <td className="py-1 pr-2 text-right">
                    <button
                      type="button"
                      onClick={() => remove.mutate(r.id)}
                      disabled={remove.isPending}
                      className="text-red-600 hover:underline text-xs disabled:opacity-40"
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
