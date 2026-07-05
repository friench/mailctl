import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ImportItemResultDTO, ImportResultDTO } from '@contracts';
import { api } from '../api';

const SAMPLE = JSON.stringify(
  {
    domains: [{ name: 'example.com' }],
    mailboxes: [{ address: 'user@example.com', password: 'ChangeMe123', quotaMb: 1024 }],
    aliases: [{ address: 'info@example.com', target: 'user@example.com' }],
  },
  null,
  2,
);

export function ImportPage() {
  const queryClient = useQueryClient();
  const [text, setText] = useState(SAMPLE);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResultDTO | null>(null);

  const run = useMutation({
    mutationFn: (dryRun: boolean) => {
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        throw new Error('Invalid JSON');
      }
      return api.post<ImportResultDTO>(`/admin/api/import?dryRun=${dryRun}`, body);
    },
    onSuccess: (res) => {
      setResult(res);
      setError(null);
      if (!res.dryRun) {
        queryClient.invalidateQueries({ queryKey: ['domains'] });
        queryClient.invalidateQueries({ queryKey: ['mailboxes'] });
        queryClient.invalidateQueries({ queryKey: ['aliases'] });
      }
    },
    onError: (err) => {
      setResult(null);
      setError(err instanceof Error ? err.message : 'Failed');
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Bulk import</h1>
      <p className="text-xs text-slate-500">
        Idempotent provisioning from a JSON document. Domains are created first, then mailboxes,
        then aliases; anything that already exists is skipped, so re-running is safe. Use a dry run
        to preview.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        className="h-72 w-full rounded border border-slate-300 p-3 font-mono text-xs"
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => run.mutate(true)}
          disabled={run.isPending}
          className="rounded border border-indigo-600 px-3 py-1.5 text-sm text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
        >
          Dry run
        </button>
        <button
          type="button"
          onClick={() => run.mutate(false)}
          disabled={run.isPending}
          className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {run.isPending ? 'Working…' : 'Import'}
        </button>
        {error && <span className="text-xs text-red-700">{error}</span>}
      </div>

      {result && (
        <section className="rounded border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-3 text-sm">
            <span
              className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                result.dryRun ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {result.dryRun ? 'dry run' : 'applied'}
            </span>
            <span className="text-slate-600">
              {result.summary.created} {result.dryRun ? 'to create' : 'created'} ·{' '}
              {result.summary.skipped} skipped · {result.summary.failed} failed
            </span>
          </div>
          <ResultTable title="Domains" items={result.domains} />
          <ResultTable title="Mailboxes" items={result.mailboxes} />
          <ResultTable title="Aliases" items={result.aliases} />
        </section>
      )}
    </div>
  );
}

const ACTION_STYLE: Record<ImportItemResultDTO['action'], string> = {
  created: 'text-emerald-700',
  skipped: 'text-slate-500',
  failed: 'text-red-700',
};

function ResultTable({ title, items }: { title: string; items: ImportItemResultDTO[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-3">
      <h3 className="mb-1 text-xs font-semibold text-slate-700">{title}</h3>
      <table className="w-full text-xs">
        <tbody>
          {items.map((i) => (
            <tr key={i.key} className="border-b border-slate-100">
              <td className="py-0.5 pr-2 font-mono">{i.key}</td>
              <td className={`py-0.5 pr-2 ${ACTION_STYLE[i.action]}`}>{i.action}</td>
              <td className="py-0.5 text-slate-500">{i.error ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
