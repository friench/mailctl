import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { LogLinesDTO, MailQueueDTO, SessionDTO } from '@contracts';
import { api } from '../api';
import { useT } from '../i18n';

type Tab = 'logs' | 'queue' | 'sessions';

export function OpsPage() {
  const t = useT();
  const [tab, setTab] = useState<Tab>('logs');

  const tabLabels: Record<Tab, string> = {
    logs: t('ops.tabLogs'),
    queue: t('ops.tabQueue'),
    sessions: t('ops.tabSessions'),
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">{t('ops.title')}</h1>
      <div className="flex gap-2 text-sm">
        {(['logs', 'queue', 'sessions'] as Tab[]).map((tabKey) => (
          <button
            key={tabKey}
            type="button"
            onClick={() => setTab(tabKey)}
            className={`rounded px-3 py-1 ${
              tab === tabKey ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {tabLabels[tabKey]}
          </button>
        ))}
      </div>
      {tab === 'logs' && <LogsView />}
      {tab === 'queue' && <QueueView />}
      {tab === 'sessions' && <SessionsView />}
    </div>
  );
}

function LogsView() {
  const t = useT();
  const [lines, setLines] = useState(200);
  const [q, setQ] = useState('');
  const [applied, setApplied] = useState('');
  const logs = useQuery({
    queryKey: ['ops-logs', lines, applied],
    queryFn: () =>
      api.get<LogLinesDTO>(
        `/admin/api/ops/logs?lines=${lines}${applied ? `&q=${encodeURIComponent(applied)}` : ''}`,
      ),
    refetchInterval: 10_000,
  });

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-end gap-2 text-sm">
        <label className="text-xs text-slate-600">
          {t('ops.search')}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setApplied(q)}
            placeholder={t('ops.filterPlaceholder')}
            className="mt-1 block w-64 rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs text-slate-600">
          {t('ops.lines')}
          <input
            type="number"
            min={10}
            max={2000}
            value={lines}
            onChange={(e) => setLines(Number(e.target.value) || 200)}
            className="mt-1 block w-24 rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={() => setApplied(q)}
          className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500"
        >
          {t('ops.search')}
        </button>
        <span className="text-xs text-slate-500">
          {logs.data?.lines.length ?? 0} {t('ops.linesWord')}
        </span>
      </div>
      <pre className="max-h-[32rem] overflow-auto rounded border border-slate-200 bg-slate-900 p-3 text-xs leading-relaxed text-slate-100">
        {logs.isLoading
          ? t('common.loading')
          : logs.data?.lines.join('\n') || t('ops.noMatchingLines')}
      </pre>
    </section>
  );
}

function QueueView() {
  const t = useT();
  const queue = useQuery({
    queryKey: ['ops-queue'],
    queryFn: () => api.get<MailQueueDTO>('/admin/api/ops/queue'),
    refetchInterval: 15_000,
  });
  const entries = queue.data?.entries ?? [];

  return (
    <section className="rounded border border-slate-200 bg-white p-4">
      {queue.isLoading && <p className="text-sm text-slate-500">{t('common.loading')}</p>}
      {!queue.isLoading && entries.length === 0 && (
        <p className="text-sm text-slate-500">{t('ops.queueEmpty')}</p>
      )}
      {entries.length > 0 && (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-1 pr-2">{t('ops.queueColId')}</th>
                <th className="py-1 pr-2">{t('ops.queueColStatus')}</th>
                <th className="py-1 pr-2">{t('ops.queueColSize')}</th>
                <th className="py-1 pr-2">{t('ops.queueColArrival')}</th>
                <th className="py-1 pr-2">{t('ops.queueColSender')}</th>
                <th className="py-1 pr-2">{t('ops.queueColRecipients')}</th>
                <th className="py-1 pr-2">{t('ops.queueColReason')}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.queueId} className="border-b border-slate-100 align-top">
                  <td className="py-1 pr-2 font-mono text-xs">{e.queueId}</td>
                  <td className="py-1 pr-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                        e.status === 'active'
                          ? 'bg-emerald-100 text-emerald-800'
                          : e.status === 'hold'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {e.status}
                    </span>
                  </td>
                  <td className="py-1 pr-2 text-xs">{e.sizeBytes}</td>
                  <td className="py-1 pr-2 text-xs text-slate-500">{e.arrivalTime}</td>
                  <td className="py-1 pr-2 font-mono text-xs">{e.sender}</td>
                  <td className="py-1 pr-2 font-mono text-xs">{e.recipients.join(', ')}</td>
                  <td className="py-1 pr-2 text-xs text-slate-500">{e.reason ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {queue.data?.summary && (
            <p className="mt-2 text-xs text-slate-500">{queue.data.summary}</p>
          )}
        </>
      )}
    </section>
  );
}

function SessionsView() {
  const t = useT();
  const sessions = useQuery({
    queryKey: ['ops-sessions'],
    queryFn: () => api.get<SessionDTO[]>('/admin/api/ops/sessions'),
    refetchInterval: 15_000,
  });
  const rows = sessions.data ?? [];

  return (
    <section className="rounded border border-slate-200 bg-white p-4">
      {sessions.isLoading && <p className="text-sm text-slate-500">{t('common.loading')}</p>}
      {!sessions.isLoading && rows.length === 0 && (
        <p className="text-sm text-slate-500">{t('ops.noSessions')}</p>
      )}
      {rows.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="py-1 pr-2">{t('ops.colUser')}</th>
              <th className="py-1 pr-2">{t('ops.colProto')}</th>
              <th className="py-1 pr-2">{t('ops.colConnections')}</th>
              <th className="py-1 pr-2">{t('ops.colIps')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={`${s.user}-${s.proto}`} className="border-b border-slate-100">
                <td className="py-1 pr-2 font-mono text-xs">{s.user}</td>
                <td className="py-1 pr-2 text-xs">{s.proto}</td>
                <td className="py-1 pr-2 text-xs">{s.connections}</td>
                <td className="py-1 pr-2 font-mono text-xs text-slate-500">{s.ips.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
