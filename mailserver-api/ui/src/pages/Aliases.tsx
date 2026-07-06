import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AliasDTO as Alias } from '@contracts';
import { ResourceTable, shortDate } from '../components/ResourceTable';
import { api } from '../api';
import { useT } from '../i18n';

function TempAliasForm() {
  const t = useT();
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
      <h3 className="mb-2 text-sm font-semibold text-slate-900">{t('aliases.tempTitle')}</h3>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-600">
          {t('aliases.tempDomain')}
          <input
            className="mt-1 block w-44 rounded border border-slate-300 px-2 py-1 text-sm"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="example.com"
          />
        </label>
        <label className="text-xs text-slate-600">
          {t('aliases.tempForwardTo')}
          <input
            className="mt-1 block w-56 rounded border border-slate-300 px-2 py-1 text-sm"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="user@example.com"
          />
        </label>
        <label className="text-xs text-slate-600">
          {t('aliases.tempTtl')}
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
          {gen.isPending ? t('aliases.tempGenerating') : t('aliases.tempGenerate')}
        </button>
      </div>
      {generated && (
        <p className="mt-2 text-xs text-slate-600">
          {t('common.created')} <span className="font-mono text-slate-900">{generated}</span>
        </p>
      )}
      {gen.isError && (
        <p className="mt-2 text-xs text-red-700">
          {gen.error instanceof Error ? gen.error.message : t('common.failed')}
        </p>
      )}
    </div>
  );
}

export function AliasesPage() {
  const t = useT();
  return (
    <>
      <TempAliasForm />
      <ResourceTable<Alias>
        title={t('aliases.title')}
        endpoint="/admin/api/aliases"
        queryKey={['aliases']}
        columns={[
          {
            key: 'address',
            header: t('aliases.colAlias'),
            render: (r) => <span className="font-mono">{r.address}</span>,
          },
          {
            key: 'target',
            header: t('aliases.colTarget'),
            render: (r) => <span className="font-mono">{r.target}</span>,
          },
          { key: 'source', header: t('aliases.colSource'), render: (r) => r.source },
          {
            key: 'notes',
            header: t('aliases.colNotes'),
            render: (r) => <span className="text-slate-500 text-xs">{r.notes ?? '–'}</span>,
          },
          {
            key: 'expires',
            header: t('aliases.colExpires'),
            render: (r) => (r.expiresAt ? shortDate(r.expiresAt) : '–'),
          },
          {
            key: 'created',
            header: t('aliases.colCreated'),
            render: (r) => shortDate(r.createdAt),
          },
        ]}
        createFields={[
          {
            name: 'address',
            label: t('aliases.fieldAddress'),
            required: true,
            placeholder: 'info@example.com or @example.com',
          },
          {
            name: 'target',
            label: t('aliases.fieldTarget'),
            required: true,
            placeholder: 'user@example.com, @other.com, devnull',
          },
          { name: 'notes', label: t('aliases.fieldNotes') },
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
