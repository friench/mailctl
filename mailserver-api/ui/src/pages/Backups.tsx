import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { shortDate } from '../components/ResourceTable';
import type { BackupsResponseDTO as BackupsResponse } from '@contracts';

interface BackupResult {
  ok: true;
  filename: string;
  sizeBytes: number;
  uploadedToS3: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function BackupsPage() {
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: ['backups'],
    queryFn: () => api.get<BackupsResponse>('/admin/api/backups'),
  });

  const backup = useMutation({
    mutationFn: () => api.post<BackupResult>('/admin/api/backups'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['backups'] });
    },
  });

  const config = list.data?.config;
  const items = list.data?.items ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold text-slate-900">Backups</h1>
        <button
          type="button"
          onClick={() => backup.mutate()}
          disabled={backup.isPending}
          className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          {backup.isPending ? 'Backing up…' : 'Back up now'}
        </button>
      </div>

      {backup.isSuccess && backup.data && (
        <div className="bg-white rounded shadow p-3 mb-4 text-sm text-slate-700">
          Backup created: <span className="font-mono text-xs">{backup.data.filename}</span> (
          {formatBytes(backup.data.sizeBytes)}) —{' '}
          {backup.data.uploadedToS3 ? 'uploaded to S3' : 'stored locally only'}
        </div>
      )}
      {backup.isError && (
        <div className="bg-white rounded shadow p-3 mb-4 text-sm text-red-700">
          Backup failed: {(backup.error as Error).message}
        </div>
      )}

      {config && (
        <div className="mb-4 text-sm text-slate-600">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              Interval: <strong>{config.intervalHours}h</strong>
            </span>
            <span>
              Keep: <strong>{config.keep}</strong>
            </span>
            <span>
              Dir: <span className="font-mono text-xs">{config.dir}</span>
            </span>
            <span>
              Scheduled:{' '}
              <span className={config.enabled ? 'text-green-700' : 'text-slate-500'}>
                {config.enabled ? 'on' : 'off'}
              </span>
            </span>
            <span
              className={`px-2 py-0.5 rounded text-xs ${
                list.data?.s3Configured
                  ? 'bg-green-100 text-green-800'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              S3: offsite {list.data?.s3Configured ? 'on' : 'off'}
            </span>
          </div>
          {!config.enabled && (
            <div className="text-xs text-slate-500 mt-1">
              Scheduled backups are off. Enable them via Feature flags →{' '}
              <span className="font-mono">backups_enabled</span>.
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded shadow overflow-hidden">
        {list.isLoading && <div className="p-4 text-slate-500">Loading…</div>}
        {list.isError && (
          <div className="p-4 text-red-700">Failed to load: {(list.error as Error).message}</div>
        )}
        {list.data && (
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Filename</th>
                <th className="text-left px-4 py-2 font-medium">Size</th>
                <th className="text-left px-4 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                    No backups yet.
                  </td>
                </tr>
              )}
              {items.map((item) => (
                <tr key={item.filename} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-mono text-xs">{item.filename}</td>
                  <td className="px-4 py-2 text-slate-600">{formatBytes(item.sizeBytes)}</td>
                  <td className="px-4 py-2 text-slate-600">{shortDate(item.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
