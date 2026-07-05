import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import type { AppSettingsDTO, SelfServiceDTO } from '@contracts';
import { api } from '../api';
import { useAuth } from '../auth';
import { SieveEditor } from '../components/SieveEditor';

export function SelfServicePage() {
  const { user, logout } = useAuth();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<SelfServiceDTO>('/admin/api/me'),
  });
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<AppSettingsDTO>('/admin/api/settings'),
    staleTime: 5 * 60_000,
  });

  const [pw, setPw] = useState('');
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const changePassword = useMutation({
    mutationFn: () => api.patch('/admin/api/me/password', { password: pw }),
    onSuccess: () => {
      setPw('');
      setStatus({ kind: 'ok', text: 'Password updated' });
    },
    onError: (err) =>
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : 'Failed' }),
  });

  const mailbox = me.data?.mailbox ?? null;
  const email = user?.email ?? '';

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <h1 className="text-lg font-semibold text-slate-900">My mailbox</h1>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-500">{email}</span>
          <button
            type="button"
            onClick={() => void logout()}
            className="text-indigo-600 hover:underline"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-6 p-6">
        <section className="rounded border border-slate-200 bg-white p-4">
          <h2 className="mb-3 font-semibold text-slate-900">Mailbox</h2>
          {me.isLoading && <p className="text-sm text-slate-500">Loading…</p>}
          {mailbox ? (
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-slate-500">Address</dt>
              <dd className="font-mono">{mailbox.address}</dd>
              <dt className="text-slate-500">Quota</dt>
              <dd>{mailbox.quotaMb != null ? `${mailbox.quotaMb} MB` : 'unlimited'}</dd>
              <dt className="text-slate-500">Sending</dt>
              <dd>{mailbox.sendBlocked ? 'blocked' : 'enabled'}</dd>
              <dt className="text-slate-500">Receiving</dt>
              <dd>{mailbox.receiveBlocked ? 'blocked' : 'enabled'}</dd>
            </dl>
          ) : (
            !me.isLoading && (
              <p className="text-sm text-slate-500">No mailbox linked to this account.</p>
            )
          )}
          {settings.data?.autoconfigEnabled && (
            <a
              href={`/mail/mobileconfig?email=${encodeURIComponent(email)}`}
              className="mt-3 inline-block text-sm text-indigo-600 hover:underline"
            >
              Download Apple mail profile ↓
            </a>
          )}
        </section>

        <section className="rounded border border-slate-200 bg-white p-4">
          <h2 className="mb-3 font-semibold text-slate-900">Change password</h2>
          <div className="flex items-end gap-2">
            <label className="text-xs text-slate-600">
              New password
              <input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                className="mt-1 block w-64 rounded border border-slate-300 px-2 py-1 text-sm"
                placeholder="min 10 characters"
              />
            </label>
            <button
              type="button"
              onClick={() => changePassword.mutate()}
              disabled={changePassword.isPending || pw.length < 8}
              className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {changePassword.isPending ? 'Saving…' : 'Update'}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Updates both your sign-in and mailbox password.
          </p>
          {status && (
            <p
              className={`mt-2 text-xs ${status.kind === 'ok' ? 'text-green-700' : 'text-red-700'}`}
            >
              {status.text}
            </p>
          )}
        </section>

        {mailbox && (
          <section>
            <h2 className="mb-3 font-semibold text-slate-900">Filters &amp; vacation</h2>
            <SieveEditor endpoint="/admin/api/me/sieve" queryKey={['me-sieve']} />
          </section>
        )}
      </main>
    </div>
  );
}
