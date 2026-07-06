import { useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api';
import { useT } from '../i18n';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
}

export interface FormField {
  name: string;
  label: string;
  type?: 'text' | 'email' | 'password' | 'number' | 'checkbox';
  required?: boolean;
  placeholder?: string;
  defaultValue?: string | number | boolean;
}

export interface ResourceTableProps<T extends { id: string }> {
  title: string;
  endpoint: string;
  queryKey: readonly unknown[];
  columns: Column<T>[];
  createFields?: FormField[];
  /** Transform form values before sending. */
  transformCreate?: (values: Record<string, unknown>) => unknown;
  /** Render extra row actions (e.g., toggle active). */
  rowActions?: (row: T) => ReactNode;
  /** Element shown on successful create — useful for "save this key now" style flashes. */
  renderCreateResult?: (result: unknown) => ReactNode;
  canDelete?: boolean;
}

export function ResourceTable<T extends { id: string }>(props: ResourceTableProps<T>) {
  const t = useT();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [createResult, setCreateResult] = useState<unknown>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: props.queryKey,
    queryFn: () => api.get<T[]>(props.endpoint),
  });

  const createMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => {
      const body = props.transformCreate ? props.transformCreate(values) : values;
      return api.post<unknown>(props.endpoint, body);
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: props.queryKey });
      setCreateResult(result);
      setCreateError(null);
      if (!props.renderCreateResult) {
        setShowCreate(false);
      }
    },
    onError: (err) => {
      setCreateError(err instanceof Error ? err.message : t('resourceTable.createFailed'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`${props.endpoint}/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: props.queryKey });
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold text-slate-900">{props.title}</h1>
        {props.createFields && (
          <button
            type="button"
            onClick={() => {
              setShowCreate(!showCreate);
              setCreateResult(null);
              setCreateError(null);
            }}
            className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700"
          >
            {showCreate ? t('common.cancel') : t('resourceTable.new')}
          </button>
        )}
      </div>

      {showCreate && props.createFields && (
        <div className="bg-white rounded shadow p-4 mb-4">
          {createResult && props.renderCreateResult ? (
            <div>
              {props.renderCreateResult(createResult)}
              <button
                type="button"
                onClick={() => {
                  setCreateResult(null);
                  setShowCreate(false);
                }}
                className="mt-3 text-sm text-indigo-600 hover:underline"
              >
                {t('resourceTable.done')}
              </button>
            </div>
          ) : (
            <CreateForm
              fields={props.createFields}
              error={createError}
              submitting={createMutation.isPending}
              onSubmit={(values) => createMutation.mutate(values)}
            />
          )}
        </div>
      )}

      <div className="bg-white rounded shadow overflow-hidden">
        {list.isLoading && <div className="p-4 text-slate-500">{t('common.loading')}</div>}
        {list.isError && (
          <div className="p-4 text-red-700">
            {t('resourceTable.failedToLoad')} {(list.error as Error).message}
          </div>
        )}
        {list.data && (
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                {props.columns.map((c) => (
                  <th key={c.key} className="text-left px-4 py-2 font-medium">
                    {c.header}
                  </th>
                ))}
                {(props.canDelete !== false || props.rowActions) && (
                  <th className="text-right px-4 py-2 font-medium">{t('common.actions')}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {list.data.length === 0 && (
                <tr>
                  <td
                    colSpan={props.columns.length + 1}
                    className="px-4 py-6 text-center text-slate-500"
                  >
                    {t('resourceTable.noRecords')}
                  </td>
                </tr>
              )}
              {list.data.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  {props.columns.map((c) => (
                    <td key={c.key} className="px-4 py-2 align-top">
                      {c.render(row)}
                    </td>
                  ))}
                  {(props.canDelete !== false || props.rowActions) && (
                    <td className="px-4 py-2 text-right space-x-3">
                      {props.rowActions?.(row)}
                      {props.canDelete !== false && (
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(t('resourceTable.confirmDelete')))
                              deleteMutation.mutate(row.id);
                          }}
                          className="text-red-600 hover:underline text-xs"
                        >
                          {t('common.delete')}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

interface CreateFormProps {
  fields: FormField[];
  error: string | null;
  submitting: boolean;
  onSubmit: (values: Record<string, unknown>) => void;
}

function CreateForm({ fields, error, submitting, onSubmit }: CreateFormProps) {
  const t = useT();
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    for (const f of fields) {
      if (f.defaultValue !== undefined) initial[f.name] = f.defaultValue;
      else if (f.type === 'checkbox') initial[f.name] = false;
      else if (f.type === 'number') initial[f.name] = '';
      else initial[f.name] = '';
    }
    return initial;
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(values);
      }}
      className="space-y-3"
    >
      {fields.map((f) => (
        <div key={f.name}>
          <label className="block text-sm text-slate-700 mb-1" htmlFor={f.name}>
            {f.label}
          </label>
          {f.type === 'checkbox' ? (
            <input
              id={f.name}
              type="checkbox"
              checked={Boolean(values[f.name])}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.checked }))}
              className="h-4 w-4"
            />
          ) : (
            <input
              id={f.name}
              type={f.type ?? 'text'}
              required={f.required}
              placeholder={f.placeholder}
              value={String(values[f.name] ?? '')}
              onChange={(e) => {
                const val =
                  f.type === 'number' && e.target.value !== ''
                    ? Number(e.target.value)
                    : e.target.value;
                setValues((v) => ({ ...v, [f.name]: val }));
              }}
              className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          )}
        </div>
      ))}
      {error && <div className="text-sm text-red-700">{error}</div>}
      <button
        type="submit"
        disabled={submitting}
        className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
      >
        {submitting ? t('resourceTable.creating') : t('common.create')}
      </button>
    </form>
  );
}

export function formatBoolean(value: boolean): string {
  return value ? '✓' : '–';
}

export function shortDate(value: string | null): string {
  if (!value) return '–';
  return new Date(value).toLocaleString();
}

export function ApiErrorMessage({ error }: { error: unknown }) {
  if (!error) return null;
  if (error instanceof ApiError) {
    return (
      <div className="text-sm text-red-700">
        {error.status}: {error.message}
      </div>
    );
  }
  return (
    <div className="text-sm text-red-700">
      {error instanceof Error ? error.message : 'Unknown error'}
    </div>
  );
}
