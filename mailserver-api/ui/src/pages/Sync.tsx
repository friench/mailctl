import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { shortDate } from '../components/ResourceTable';
import type {
  EntityType,
  Resolution,
  ReconciliationItem,
  SyncRunSummary,
  ApplyItemResult,
} from '@contracts';

interface Preview {
  items: ReconciliationItem[];
  generatedAt: string;
  lastRun: SyncRunSummary | null;
}

interface ApplyOutcome {
  results: ApplyItemResult[];
  summary: SyncRunSummary;
}

interface Selection {
  resolution: Resolution;
  fields?: Record<string, 'dms' | 'db'>;
  password?: string;
}

const RESOLUTION_LABEL: Record<Resolution, string> = {
  import: 'import ← DMS',
  push: 'push → DMS',
  field_pick: 'pick field…',
  delete_db: 'delete in DB',
  delete_dms: 'delete in DMS',
  skip: 'skip',
};

const FIELD_BY_ENTITY: Record<EntityType, string> = {
  mailbox: 'quota',
  alias: 'target',
  dkim: 'publicKey',
  domain: '',
};

function itemId(i: { entityType: string; key: string }): string {
  return `${i.entityType}:${i.key}`;
}

function truncate(value: string, max = 28): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function renderState(state: Record<string, unknown> | null): string {
  if (!state) return '–';
  return Object.entries(state)
    .map(([k, v]) => `${k}=${v === null ? '∅' : truncate(String(v))}`)
    .join('  ');
}

export function SyncPage() {
  const queryClient = useQueryClient();
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [confirmDeletes, setConfirmDeletes] = useState(false);
  const [outcome, setOutcome] = useState<ApplyOutcome | null>(null);

  const preview = useQuery({
    queryKey: ['sync-preview'],
    queryFn: () => api.get<Preview>('/admin/api/sync/preview'),
  });

  const apply = useMutation({
    mutationFn: (body: unknown) => api.post<ApplyOutcome>('/admin/api/sync/apply', body),
    onSuccess: (result) => {
      setOutcome(result);
      setSelections({});
      setConfirmDeletes(false);
      void queryClient.invalidateQueries({ queryKey: ['sync-preview'] });
    },
  });

  const items = preview.data?.items ?? [];
  const chosen = Object.entries(selections).filter(([, s]) => s.resolution !== 'skip');
  const anyDelete = chosen.some(
    ([, s]) => s.resolution === 'delete_db' || s.resolution === 'delete_dms',
  );

  function setResolution(item: ReconciliationItem, resolution: Resolution) {
    setSelections((prev) => ({ ...prev, [itemId(item)]: { resolution } }));
  }
  function setField(item: ReconciliationItem, dir: 'dms' | 'db') {
    const field = FIELD_BY_ENTITY[item.entityType];
    setSelections((prev) => ({
      ...prev,
      [itemId(item)]: { ...prev[itemId(item)], resolution: 'field_pick', fields: { [field]: dir } },
    }));
  }
  function setPassword(item: ReconciliationItem, password: string) {
    setSelections((prev) => ({
      ...prev,
      [itemId(item)]: { ...prev[itemId(item)], resolution: 'push', password },
    }));
  }

  function applySelected() {
    const resolutions = items
      .filter((it) => selections[itemId(it)] && selections[itemId(it)].resolution !== 'skip')
      .map((it) => {
        const sel = selections[itemId(it)]!;
        return {
          entityType: it.entityType,
          key: it.key,
          resolution: sel.resolution,
          stateHash: it.stateHash,
          ...(sel.fields ? { fields: sel.fields } : {}),
          ...(sel.password ? { password: sel.password } : {}),
        };
      });
    if (resolutions.length === 0) return;
    apply.mutate({ confirmDeletes, resolutions });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold text-slate-900">Sync with mail server</h1>
        <button
          type="button"
          onClick={() => void preview.refetch()}
          className="px-3 py-1.5 bg-slate-200 text-slate-800 rounded text-sm hover:bg-slate-300"
        >
          Refresh preview
        </button>
      </div>

      <p className="text-sm text-slate-600 mb-4">
        Review every divergence between docker-mailserver and the panel database, then choose a
        direction per row. Nothing is written until you press <strong>Apply selected</strong>.
        Deletions require the confirmation box.
      </p>

      {preview.data?.lastRun && (
        <div className="text-xs text-slate-500 mb-3">
          Last apply: {shortDate(preview.data.lastRun.at)} — applied {preview.data.lastRun.applied},
          failed {preview.data.lastRun.failed}, rejected {preview.data.lastRun.rejected}
        </div>
      )}

      {outcome && (
        <div className="bg-white rounded shadow p-3 mb-4 text-sm">
          <div className="font-medium mb-1">
            Applied {outcome.summary.applied} · failed {outcome.summary.failed} · rejected{' '}
            {outcome.summary.rejected}
          </div>
          {outcome.results
            .filter((r) => r.status !== 'applied')
            .map((r) => (
              <div key={itemId(r)} className="text-xs text-amber-700">
                {r.entityType} {r.key}: {r.status}
                {r.error ? ` — ${r.error}` : ''}
              </div>
            ))}
        </div>
      )}

      <div className="bg-white rounded shadow overflow-x-auto">
        {preview.isLoading && <div className="p-4 text-slate-500">Loading…</div>}
        {preview.isError && (
          <div className="p-4 text-red-700">Failed to load: {(preview.error as Error).message}</div>
        )}
        {preview.data && (
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Type</th>
                <th className="text-left px-3 py-2 font-medium">Key</th>
                <th className="text-left px-3 py-2 font-medium">Divergence</th>
                <th className="text-left px-3 py-2 font-medium">DMS</th>
                <th className="text-left px-3 py-2 font-medium">DB</th>
                <th className="text-left px-3 py-2 font-medium">Resolution</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    No divergence — DMS and the panel database are in sync.
                  </td>
                </tr>
              )}
              {items.map((it) => {
                const sel = selections[itemId(it)];
                const resolution = sel?.resolution ?? 'skip';
                return (
                  <tr key={itemId(it)} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-2">{it.entityType}</td>
                    <td className="px-3 py-2 font-mono text-xs">{it.key}</td>
                    <td className="px-3 py-2 text-xs">{it.divergence}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      <div className="max-w-[12rem] truncate" title={renderState(it.dmsState)}>
                        {renderState(it.dmsState)}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      <div className="max-w-[12rem] truncate" title={renderState(it.dbState)}>
                        {renderState(it.dbState)}
                      </div>
                    </td>
                    <td className="px-3 py-2 space-y-1">
                      <select
                        value={resolution}
                        onChange={(e) => setResolution(it, e.target.value as Resolution)}
                        className="border border-slate-300 rounded text-xs px-1 py-0.5"
                      >
                        {[...new Set<Resolution>([...it.availableResolutions, 'skip'])].map((r) => (
                          <option key={r} value={r}>
                            {RESOLUTION_LABEL[r]}
                          </option>
                        ))}
                      </select>
                      {resolution === 'field_pick' && (
                        <select
                          value={sel?.fields?.[FIELD_BY_ENTITY[it.entityType]] ?? 'dms'}
                          onChange={(e) => setField(it, e.target.value as 'dms' | 'db')}
                          className="border border-slate-300 rounded text-xs px-1 py-0.5 ml-1"
                        >
                          <option value="dms">use DMS</option>
                          <option value="db">use DB</option>
                        </select>
                      )}
                      {resolution === 'push' && it.entityType === 'mailbox' && (
                        <input
                          type="password"
                          placeholder="mailbox password"
                          value={sel?.password ?? ''}
                          onChange={(e) => setPassword(it, e.target.value)}
                          className="block border border-slate-300 rounded text-xs px-1 py-0.5 mt-1"
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {items.length > 0 && (
        <div className="mt-4 flex items-center gap-4">
          <button
            type="button"
            onClick={applySelected}
            disabled={apply.isPending || chosen.length === 0 || (anyDelete && !confirmDeletes)}
            className="px-4 py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            {apply.isPending ? 'Applying…' : `Apply selected (${chosen.length})`}
          </button>
          {anyDelete && (
            <label className="flex items-center gap-2 text-sm text-red-700">
              <input
                type="checkbox"
                checked={confirmDeletes}
                onChange={(e) => setConfirmDeletes(e.target.checked)}
                className="h-4 w-4"
              />
              Confirm deletions (destructive)
            </label>
          )}
        </div>
      )}
    </div>
  );
}
