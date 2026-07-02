import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api';
import { shortDate } from '../components/ResourceTable';
import type {
  DomainDTO as Domain,
  DnsRecordDTO as DnsRecord,
  DnsCheckDTO as DnsCheckResponse,
} from '@contracts';

const STATUS_BADGE: Record<DnsRecord['status'], string> = {
  ok: 'bg-emerald-100 text-emerald-800',
  missing: 'bg-amber-100 text-amber-800',
  mismatch: 'bg-orange-100 text-orange-800',
  error: 'bg-red-100 text-red-800',
};

export function DomainDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [dkimError, setDkimError] = useState<string | null>(null);
  const [keysize, setKeysize] = useState<2048 | 4096>(2048);
  const [selector, setSelector] = useState('');

  const domain = useQuery({
    queryKey: ['domain', id],
    queryFn: () => api.get<Domain>(`/admin/api/domains/${id}`),
  });

  const dns = useQuery({
    queryKey: ['domain-dns', id],
    queryFn: () => api.get<DnsCheckResponse>(`/admin/api/domains/${id}/dns-check`),
    enabled: !!domain.data,
  });

  const regenerate = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { keysize };
      if (selector) body.selector = selector;
      return api.post<Domain>(`/admin/api/domains/${id}/dkim`, body);
    },
    onSuccess: () => {
      setDkimError(null);
      void queryClient.invalidateQueries({ queryKey: ['domain', id] });
      void queryClient.invalidateQueries({ queryKey: ['domain-dns', id] });
    },
    onError: (err) => {
      setDkimError(err instanceof ApiError ? err.message : 'Regeneration failed');
    },
  });

  const refresh = useMutation({
    mutationFn: () => api.get<DnsCheckResponse>(`/admin/api/domains/${id}/dns-check?refresh=1`),
    onSuccess: (data) => {
      queryClient.setQueryData(['domain-dns', id], data);
    },
  });

  if (domain.isLoading) return <div className="text-slate-500">Loading…</div>;
  if (domain.isError || !domain.data) {
    return (
      <div className="text-red-700">
        Failed to load domain: {(domain.error as Error)?.message ?? 'not found'}
      </div>
    );
  }

  const d = domain.data;
  const dkimRecord = `${d.dkimSelector ?? 'mail'}._domainkey.${d.name}`;
  const dkimTxt = d.dkimPublicKey ? `v=DKIM1; h=sha256; k=rsa; p=${d.dkimPublicKey}` : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/admin/domains" className="text-sm text-indigo-600 hover:underline">
          ← Domains
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">{d.name}</h1>
        <span
          className={`text-xs px-2 py-0.5 rounded ${
            d.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
          }`}
        >
          {d.active ? 'active' : 'disabled'}
        </span>
        <span
          className={`text-xs px-2 py-0.5 rounded ${
            d.source === 'dms' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'
          }`}
        >
          {d.source}
        </span>
      </div>

      <section className="bg-white rounded shadow p-4 space-y-3">
        <h2 className="font-semibold text-slate-900">DKIM</h2>

        {d.dkimStatus === 'dns_republish_required' && (
          <div className="text-sm bg-amber-100 text-amber-800 rounded px-3 py-2">
            DKIM changed — DNS TXT must be re-published.
          </div>
        )}

        <dl className="grid grid-cols-[160px_1fr] gap-y-2 text-sm">
          <dt className="text-slate-500">Selector</dt>
          <dd className="font-mono">{d.dkimSelector ?? '—'}</dd>

          <dt className="text-slate-500">DNS record</dt>
          <dd className="font-mono break-all">{dkimRecord}</dd>

          <dt className="text-slate-500">Public key</dt>
          <dd>
            {dkimTxt ? (
              <div className="space-y-1">
                <textarea
                  readOnly
                  rows={4}
                  value={dkimTxt}
                  className="w-full text-xs font-mono p-2 border border-slate-200 rounded bg-slate-50"
                />
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(dkimTxt)}
                  className="text-xs text-indigo-600 hover:underline"
                >
                  Copy TXT value
                </button>
              </div>
            ) : (
              <span className="text-slate-500">no key generated yet</span>
            )}
          </dd>
        </dl>

        <div className="border-t border-slate-100 pt-3 space-y-2">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1" htmlFor="dkim-selector">
                Selector (optional)
              </label>
              <input
                id="dkim-selector"
                type="text"
                value={selector}
                onChange={(e) => setSelector(e.target.value)}
                placeholder={d.dkimSelector ?? 'mail'}
                className="px-2 py-1 border border-slate-300 rounded text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1" htmlFor="dkim-keysize">
                Key size
              </label>
              <select
                id="dkim-keysize"
                value={keysize}
                onChange={(e) => setKeysize(Number(e.target.value) as 2048 | 4096)}
                className="px-2 py-1 border border-slate-300 rounded text-sm"
              >
                <option value={2048}>2048</option>
                <option value={4096}>4096</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => regenerate.mutate()}
              disabled={regenerate.isPending}
              className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {regenerate.isPending
                ? 'Generating…'
                : d.dkimPublicKey
                  ? 'Regenerate DKIM'
                  : 'Generate DKIM'}
            </button>
          </div>
          {dkimError && <div className="text-sm text-red-700">{dkimError}</div>}
          <p className="text-xs text-slate-500">
            Regenerating overwrites the existing OpenDKIM key. After publishing the new TXT record,
            run a DNS recheck.
          </p>
        </div>
      </section>

      <section className="bg-white rounded shadow p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">DNS check</h2>
          <div className="flex items-center gap-3 text-sm">
            {dns.data && (
              <span className="text-slate-500">
                Checked {shortDate(dns.data.checkedAt)} {dns.data.cached && '(cached)'}
              </span>
            )}
            <button
              type="button"
              onClick={() => refresh.mutate()}
              disabled={refresh.isPending || dns.isLoading}
              className="px-3 py-1 border border-slate-300 rounded text-xs hover:bg-slate-50 disabled:opacity-50"
            >
              {refresh.isPending ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
        {dns.isLoading && <div className="text-slate-500 text-sm">Querying DNS…</div>}
        {dns.isError && (
          <div className="text-red-700 text-sm">Failed: {(dns.error as Error).message}</div>
        )}
        {dns.data && (
          <table className="w-full text-sm">
            <thead className="text-slate-700">
              <tr>
                <th className="text-left px-2 py-1 font-medium w-20">Type</th>
                <th className="text-left px-2 py-1 font-medium">Hostname</th>
                <th className="text-left px-2 py-1 font-medium w-28">Status</th>
                <th className="text-left px-2 py-1 font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {dns.data.records.map((r) => (
                <tr key={r.type} className="border-t border-slate-100 align-top">
                  <td className="px-2 py-2 font-mono">{r.type}</td>
                  <td className="px-2 py-2 font-mono break-all">{r.hostname}</td>
                  <td className="px-2 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${STATUS_BADGE[r.status]}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    {r.actual.length > 0 ? (
                      <div className="space-y-1">
                        {r.actual.map((v, i) => (
                          <div key={i} className="font-mono text-xs break-all">
                            {v}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                    {r.message && <div className="text-xs text-slate-500 mt-1">{r.message}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="text-xs text-slate-500">
        Created {shortDate(d.createdAt)} · Source {d.source} · Last synced{' '}
        {shortDate(d.lastSyncedAt)}
      </section>
    </div>
  );
}
