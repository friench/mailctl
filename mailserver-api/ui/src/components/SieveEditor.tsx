import { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import type { SieveConfigDTO, SieveRuleDTO } from '@contracts';
import { api } from '../api';

const EMPTY: SieveConfigDTO = {
  vacation: { enabled: false, subject: '', message: '', days: 7 },
  rules: [],
};

const FIELDS: SieveRuleDTO['field'][] = ['from', 'to', 'subject'];
const ACTIONS: SieveRuleDTO['action'][] = ['fileinto', 'redirect', 'discard'];

/** Editor for a mailbox's Sieve config (vacation + filter rules) at `endpoint`. */
export function SieveEditor({ endpoint, queryKey }: { endpoint: string; queryKey: string[] }) {
  const loaded = useQuery({ queryKey, queryFn: () => api.get<SieveConfigDTO>(endpoint) });
  const [cfg, setCfg] = useState<SieveConfigDTO>(EMPTY);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (loaded.data) setCfg(loaded.data);
  }, [loaded.data]);

  const save = useMutation({
    mutationFn: () => api.put<SieveConfigDTO>(endpoint, cfg),
    onSuccess: () => setStatus({ kind: 'ok', text: 'Saved' }),
    onError: (err) =>
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : 'Failed' }),
  });

  const setVacation = (v: Partial<SieveConfigDTO['vacation']>) =>
    setCfg((c) => ({ ...c, vacation: { ...c.vacation, ...v } }));
  const setRule = (i: number, r: Partial<SieveRuleDTO>) =>
    setCfg((c) => ({ ...c, rules: c.rules.map((x, j) => (j === i ? { ...x, ...r } : x)) }));
  const addRule = () =>
    setCfg((c) => ({
      ...c,
      rules: [...c.rules, { field: 'subject', contains: '', action: 'fileinto', arg: '' }],
    }));
  const removeRule = (i: number) =>
    setCfg((c) => ({ ...c, rules: c.rules.filter((_, j) => j !== i) }));

  const input = 'rounded border border-slate-300 px-2 py-1 text-sm';

  return (
    <div className="space-y-6">
      <section className="rounded border border-slate-200 bg-white p-4">
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <input
            type="checkbox"
            checked={cfg.vacation.enabled}
            onChange={(e) => setVacation({ enabled: e.target.checked })}
          />
          Vacation / out-of-office auto-reply
        </label>
        {cfg.vacation.enabled && (
          <div className="mt-3 grid gap-2">
            <input
              className={input}
              placeholder="Subject"
              value={cfg.vacation.subject}
              onChange={(e) => setVacation({ subject: e.target.value })}
            />
            <textarea
              className={`${input} h-24`}
              placeholder="Message"
              value={cfg.vacation.message}
              onChange={(e) => setVacation({ message: e.target.value })}
            />
            <label className="text-xs text-slate-600">
              Repeat interval (days)
              <input
                type="number"
                min={1}
                max={365}
                className={`${input} ml-2 w-20`}
                value={cfg.vacation.days}
                onChange={(e) => setVacation({ days: Number(e.target.value) || 7 })}
              />
            </label>
          </div>
        )}
      </section>

      <section className="rounded border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Filter rules</h3>
          <button
            type="button"
            onClick={addRule}
            className="text-indigo-600 hover:underline text-xs"
          >
            + Add rule
          </button>
        </div>
        {cfg.rules.length === 0 && <p className="text-xs text-slate-500">No rules.</p>}
        <div className="space-y-2">
          {cfg.rules.map((r, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">If</span>
              <select
                className={input}
                value={r.field}
                onChange={(e) => setRule(i, { field: e.target.value as SieveRuleDTO['field'] })}
              >
                {FIELDS.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
              <span className="text-xs text-slate-500">contains</span>
              <input
                className={input}
                placeholder="text"
                value={r.contains}
                onChange={(e) => setRule(i, { contains: e.target.value })}
              />
              <span className="text-xs text-slate-500">→</span>
              <select
                className={input}
                value={r.action}
                onChange={(e) => setRule(i, { action: e.target.value as SieveRuleDTO['action'] })}
              >
                {ACTIONS.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
              {r.action !== 'discard' && (
                <input
                  className={input}
                  placeholder={r.action === 'fileinto' ? 'folder' : 'address'}
                  value={r.arg ?? ''}
                  onChange={(e) => setRule(i, { arg: e.target.value })}
                />
              )}
              <button
                type="button"
                onClick={() => removeRule(i)}
                className="text-red-600 hover:underline text-xs"
              >
                remove
              </button>
            </div>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {save.isPending ? 'Saving…' : 'Save filters'}
        </button>
        {status && (
          <span className={`text-xs ${status.kind === 'ok' ? 'text-green-700' : 'text-red-700'}`}>
            {status.text}
          </span>
        )}
      </div>
    </div>
  );
}
