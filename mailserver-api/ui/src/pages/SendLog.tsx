import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import type { SendJobDTO as Job } from '@contracts';

export function SendLogPage() {
  const [filter, setFilter] = useState<'all' | 'pending' | 'done' | 'dead'>('all');
  const jobs = useQuery({
    queryKey: ['jobs', 'all'],
    queryFn: () => api.get<Job[]>('/jobs'),
    refetchInterval: 5_000,
  });

  const filtered = !jobs.data
    ? []
    : filter === 'all'
      ? jobs.data
      : jobs.data.filter(
          (j) => j.status === filter || (filter === 'pending' && j.status === 'processing'),
        );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold text-slate-900">Send log</h1>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as 'all' | 'pending' | 'done' | 'dead')}
          className="border border-slate-300 rounded px-2 py-1 text-sm"
        >
          <option value="all">All</option>
          <option value="pending">Pending / processing</option>
          <option value="done">Done</option>
          <option value="dead">Dead</option>
        </select>
      </div>

      <div className="bg-white rounded shadow overflow-hidden">
        {jobs.isLoading && <div className="p-4 text-slate-500">Loading…</div>}
        {jobs.data && (
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="text-left px-4 py-2 font-medium">To</th>
                <th className="text-left px-4 py-2 font-medium">Subject</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">Attempts</th>
                <th className="text-left px-4 py-2 font-medium">Account</th>
                <th className="text-left px-4 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    No jobs.
                  </td>
                </tr>
              )}
              {filtered.map((j) => (
                <tr key={j.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-mono text-xs">{j.payload.to}</td>
                  <td className="px-4 py-2">{j.payload.subject}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={j.status} />
                    {j.error && (
                      <div className="text-xs text-red-700 mt-1 max-w-xs truncate">{j.error}</div>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {j.attempts}/{j.maxAttempts}
                  </td>
                  <td className="px-4 py-2">{j.account ?? '–'}</td>
                  <td className="px-4 py-2 text-xs text-slate-600">
                    {new Date(j.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'done'
      ? 'bg-green-100 text-green-800'
      : status === 'pending' || status === 'processing'
        ? 'bg-yellow-100 text-yellow-800'
        : status === 'dead'
          ? 'bg-red-100 text-red-800'
          : 'bg-slate-100 text-slate-700';
  return <span className={`px-2 py-0.5 rounded text-xs ${cls}`}>{status}</span>;
}
