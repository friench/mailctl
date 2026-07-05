import { useState } from 'react';
import type { QuarantineMessageDTO } from '@contracts';

export interface QuarantineMessagesProps {
  messages: QuarantineMessageDTO[];
  /** Link to the raw message for a uid (opens in a new tab), or null to hide "View". */
  viewHref?: (uid: number) => string;
  onRelease: (uid: number) => void;
  onDelete: (uid: number) => void;
  /** When provided, renders a bulk action bar operating on the selected uids. */
  onBulk?: (uids: number[], action: 'release' | 'delete') => void;
  busy?: boolean;
}

function formatSize(bytes: number | null): string {
  if (bytes == null) return '–';
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}

/** Presentational table of quarantined (Junk) messages with per-row + bulk actions. */
export function QuarantineMessages({
  messages,
  viewHref,
  onRelease,
  onDelete,
  onBulk,
  busy,
}: QuarantineMessagesProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  if (messages.length === 0) {
    return <p className="text-sm text-slate-500">No quarantined messages.</p>;
  }

  const toggle = (uid: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  const allSelected = messages.every((m) => selected.has(m.uid));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(messages.map((m) => m.uid)));
  const bulk = (action: 'release' | 'delete') => {
    if (onBulk && selected.size) {
      onBulk([...selected], action);
      setSelected(new Set());
    }
  };

  return (
    <div className="space-y-2">
      {onBulk && (
        <div className="flex items-center gap-3 text-xs">
          <span className="text-slate-500">{selected.size} selected</span>
          <button
            type="button"
            onClick={() => bulk('release')}
            disabled={busy || selected.size === 0}
            className="text-indigo-600 hover:underline disabled:opacity-40"
          >
            Release selected
          </button>
          <button
            type="button"
            onClick={() => bulk('delete')}
            disabled={busy || selected.size === 0}
            className="text-red-600 hover:underline disabled:opacity-40"
          >
            Delete selected
          </button>
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
            {onBulk && (
              <th className="py-1 pr-2">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              </th>
            )}
            <th className="py-1 pr-2">From</th>
            <th className="py-1 pr-2">Subject</th>
            <th className="py-1 pr-2">Date</th>
            <th className="py-1 pr-2">Score</th>
            <th className="py-1 pr-2">Size</th>
            <th className="py-1 pr-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {messages.map((m) => (
            <tr key={m.uid} className="border-b border-slate-100 align-top">
              {onBulk && (
                <td className="py-1 pr-2">
                  <input
                    type="checkbox"
                    checked={selected.has(m.uid)}
                    onChange={() => toggle(m.uid)}
                  />
                </td>
              )}
              <td className="py-1 pr-2 font-mono text-xs">{m.from || '–'}</td>
              <td className="py-1 pr-2">{m.subject || '(no subject)'}</td>
              <td className="py-1 pr-2 text-xs text-slate-500">{m.date || '–'}</td>
              <td className="py-1 pr-2 text-xs">{m.score != null ? m.score.toFixed(1) : '–'}</td>
              <td className="py-1 pr-2 text-xs text-slate-500">{formatSize(m.sizeBytes)}</td>
              <td className="space-x-2 py-1 pr-2 text-xs">
                {viewHref && (
                  <a
                    href={viewHref(m.uid)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-600 hover:underline"
                  >
                    View
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => onRelease(m.uid)}
                  disabled={busy}
                  className="text-indigo-600 hover:underline disabled:opacity-40"
                >
                  Release
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(m.uid)}
                  disabled={busy}
                  className="text-red-600 hover:underline disabled:opacity-40"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
