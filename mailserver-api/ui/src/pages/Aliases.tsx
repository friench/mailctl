import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AliasDTO as Alias } from '@contracts';
import { ResourceTable, shortDate } from '../components/ResourceTable';
import { api } from '../api';

function TempAliasForm() {
  const queryClient = useQueryClient();
  const [domain, setDomain] = useState('');
  const [target, setTarget] = useState('');
  const [ttlHours, setTtlHours] = useState('');
  const [generated, setGenerated] = useState<string | null>(null);

  const gen = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { domain, target };
      if (ttlHours.trim() !== '') body.ttlHours = Number(ttlHours);
      return api.post<Alias>('/admin/api/aliases/temp', body);
    },
    onSuccess: (alias) => {
      setGenerated(alias.address);
      setTarget('');
      setTtlHours('');
      void queryClient.invalidateQueries({ queryKey: ['aliases'] });
    },
  });

  return (
    <div className="mb-4 rounded border border-slate-200 bg-white p-4">
      <h3 className="mb-2 text-sm font-semibold text-slate-900">Generate temp address</h3>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-600">
          Domain
          <input
            className="mt-1 block w-44 rounded border border-slate-300 px-2 py-1 text-sm"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="example.com"
          />
        </label>
        <label className="text-xs text-slate-600">
          Forward to
          <input
            className="mt-1 block w-56 rounded border border-slate-300 px-2 py-1 text-sm"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="user@example.com"
          />
        </label>
        <label className="text-xs text-slate-600">
          TTL hours (optional)
          <input
            className="mt-1 block w-32 rounded border border-slate-300 px-2 py-1 text-sm"
            value={ttlHours}
            onChange={(e) => setTtlHours(e.target.value)}
            placeholder="24"
            type="number"
            min="1"
          />
        </label>
        <button
          type="button"
          onClick={() => gen.mutate()}
          disabled={gen.isPending || !domain || !target}
          className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {gen.isPending ? 'Generating…' : 'Generate'}
        </button>
      </div>
      {generated && (
        <p className="mt-2 text-xs text-slate-600">
          Created <span className="font-mono text-slate-900">{generated}</span>
        </p>
      )}
      {gen.isError && (
        <p className="mt-2 text-xs text-red-700">
          {gen.error instanceof Error ? gen.error.message : 'Failed'}
        </p>
      )}
    </div>
  );
}

export function AliasesPage() {
  return (
    <>
      <TempAliasForm />
      <ResourceTable<Alias>
        title="Aliases"
        endpoint="/admin/api/aliases"
        queryKey={['aliases']}
        columns={[
          {
            key: 'address',
            header: 'Alias',
            render: (r) => <span className="font-mono">{r.address}</span>,
          },
          {
            key: 'target',
            header: 'Target',
            render: (r) => <span className="font-mono">{r.target}</span>,
          },
          { key: 'source', header: 'Source', render: (r) => r.source },
          {
            key: 'notes',
            header: 'Notes',
            render: (r) => <span className="text-slate-500 text-xs">{r.notes ?? '–'}</span>,
          },
          {
            key: 'expires',
            header: 'Expires',
            render: (r) => (r.expiresAt ? shortDate(r.expiresAt) : '–'),
          },
          { key: 'created', header: 'Created', render: (r) => shortDate(r.createdAt) },
        ]}
        createFields={[
          {
            name: 'address',
            label: 'Alias address (use @domain for a catch-all)',
            required: true,
            placeholder: 'info@example.com or @example.com',
          },
          {
            name: 'target',
            label: 'Target(s) — email, @domain, or devnull to discard',
            required: true,
            placeholder: 'user@example.com, @other.com, devnull',
          },
          { name: 'notes', label: 'Notes (optional)' },
        ]}
        transformCreate={(values) => {
          const body: Record<string, unknown> = {
            address: values.address,
            target: values.target,
          };
          if (values.notes) body.notes = values.notes;
          return body;
        }}
      />
    </>
  );
}
