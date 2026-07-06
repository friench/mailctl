import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AliasDTO, AppSettingsDTO, MailboxDTO } from '@contracts';
import { api } from '../api';
import { useT } from '../i18n';
import { SieveEditor } from '../components/SieveEditor';

/** Targets of an alias, excluding a given address (the "keep a copy" marker). */
function targetsExcluding(alias: AliasDTO | undefined, address: string): string[] {
  if (!alias) return [];
  return alias.target
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && s.toLowerCase() !== address.toLowerCase());
}

export function MailboxDetailPage() {
  const t = useT();
  const { id = '' } = useParams();

  const mailbox = useQuery({
    queryKey: ['mailbox', id],
    queryFn: () => api.get<MailboxDTO>(`/admin/api/mailboxes/${id}`),
  });

  if (mailbox.isLoading) {
    return <p className="text-sm text-slate-500">{t('common.loading')}</p>;
  }
  if (!mailbox.data) {
    return (
      <div className="space-y-3">
        <Link to="/admin/mailboxes" className="text-sm text-indigo-600 hover:underline">
          ← {t('mailboxes.title')}
        </Link>
        <p className="text-sm text-red-700">{t('mailboxDetail.notFound')}</p>
      </div>
    );
  }

  const mb = mailbox.data;

  return (
    <div className="space-y-4">
      <div>
        <Link to="/admin/mailboxes" className="text-sm text-indigo-600 hover:underline">
          ← {t('mailboxes.title')}
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="font-mono text-xl font-semibold text-slate-900">{mb.address}</h1>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
            {mb.source}
          </span>
          <span className="text-xs text-slate-500">
            {t('common.created')} {new Date(mb.createdAt).toLocaleString()}
          </span>
        </div>
      </div>

      <SettingsSection mailbox={mb} />
      <ForwardingSection mailbox={mb} />
      <AliasesSection mailbox={mb} />

      <section className="rounded border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-semibold text-slate-900">{t('mailboxDetail.sectionFilters')}</h2>
        <SieveEditor
          endpoint={`/admin/api/mailboxes/${id}/sieve`}
          queryKey={['mailbox-sieve', id]}
        />
      </section>

      <section className="rounded border border-slate-200 bg-white p-4">
        <h2 className="mb-2 font-semibold text-slate-900">
          {t('mailboxDetail.sectionQuarantine')}
        </h2>
        <Link
          to={`/admin/quarantine?mailboxId=${id}`}
          className="text-sm text-indigo-600 hover:underline"
        >
          {t('mailboxDetail.quarantineLink')} →
        </Link>
      </section>
    </div>
  );
}

type Status = { kind: 'ok' | 'error'; text: string } | null;

const inputCls = 'rounded border border-slate-300 px-2 py-1 text-sm';

function SettingsSection({ mailbox }: { mailbox: MailboxDTO }) {
  const t = useT();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [quota, setQuota] = useState(mailbox.quotaMb != null ? String(mailbox.quotaMb) : '');
  const [active, setActive] = useState(mailbox.active);
  const [sendBlocked, setSendBlocked] = useState(mailbox.sendBlocked);
  const [receiveBlocked, setReceiveBlocked] = useState(mailbox.receiveBlocked);
  const [notes, setNotes] = useState(mailbox.notes ?? '');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<Status>(null);

  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<AppSettingsDTO>('/admin/api/settings'),
    staleTime: 5 * 60_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['mailbox', mailbox.id] });
    void queryClient.invalidateQueries({ queryKey: ['mailboxes'] });
  };

  const save = useMutation({
    mutationFn: () => {
      const trimmed = quota.trim();
      const quotaMb = trimmed === '' ? null : Number(trimmed);
      if (quotaMb !== null && (!Number.isFinite(quotaMb) || quotaMb < 0)) {
        throw new Error(t('mailboxes.quotaError'));
      }
      return api.patch(`/admin/api/mailboxes/${mailbox.id}`, {
        quotaMb,
        active,
        sendBlocked,
        receiveBlocked,
        notes: notes.trim() || null,
      });
    },
    onSuccess: () => {
      invalidate();
      setStatus({ kind: 'ok', text: t('common.save') });
    },
    onError: (err) =>
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : 'Failed' }),
  });

  const changePassword = useMutation({
    mutationFn: () => api.patch(`/admin/api/mailboxes/${mailbox.id}/password`, { password }),
    onSuccess: () => {
      setPassword('');
      setStatus({ kind: 'ok', text: t('mailboxes.statusPasswordChanged') });
    },
    onError: (err) =>
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : 'Failed' }),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/admin/api/mailboxes/${mailbox.id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mailboxes'] });
      navigate('/admin/mailboxes');
    },
    onError: (err) =>
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : 'Failed' }),
  });

  return (
    <section className="rounded border border-slate-200 bg-white p-4">
      <h2 className="mb-3 font-semibold text-slate-900">{t('mailboxDetail.sectionSettings')}</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="text-xs text-slate-600">
          {t('mailboxDetail.quota')}
          <input
            className={`${inputCls} mt-1 block w-full`}
            type="number"
            min={0}
            placeholder={t('mailboxDetail.quotaUnlimited')}
            value={quota}
            onChange={(e) => setQuota(e.target.value)}
          />
        </label>
        <label className="text-xs text-slate-600">
          {t('mailboxDetail.active')}
          <select
            className={`${inputCls} mt-1 block w-full`}
            value={active ? 'yes' : 'no'}
            onChange={(e) => setActive(e.target.value === 'yes')}
          >
            <option value="yes">{t('mailboxDetail.activeYes')}</option>
            <option value="no">{t('mailboxDetail.activeNo')}</option>
          </select>
        </label>
        <label className="text-xs text-slate-600">
          {t('mailboxDetail.sending')}
          <select
            className={`${inputCls} mt-1 block w-full`}
            value={sendBlocked ? 'blocked' : 'allowed'}
            onChange={(e) => setSendBlocked(e.target.value === 'blocked')}
          >
            <option value="allowed">{t('mailboxDetail.allowed')}</option>
            <option value="blocked">{t('mailboxDetail.blocked')}</option>
          </select>
        </label>
        <label className="text-xs text-slate-600">
          {t('mailboxDetail.receiving')}
          <select
            className={`${inputCls} mt-1 block w-full`}
            value={receiveBlocked ? 'blocked' : 'allowed'}
            onChange={(e) => setReceiveBlocked(e.target.value === 'blocked')}
          >
            <option value="allowed">{t('mailboxDetail.allowed')}</option>
            <option value="blocked">{t('mailboxDetail.blocked')}</option>
          </select>
        </label>
        <label className="text-xs text-slate-600 md:col-span-2">
          {t('mailboxDetail.notes')}
          <input
            className={`${inputCls} mt-1 block w-full`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {t('common.save')}
        </button>
        {settings.data?.autoconfigEnabled && (
          <a
            href={`/mail/mobileconfig?email=${encodeURIComponent(mailbox.address)}`}
            className="text-sm text-indigo-600 hover:underline"
          >
            {t('mailboxes.appleProfile')} ↓
          </a>
        )}
      </div>

      <div className="mt-4 border-t border-slate-100 pt-3">
        <p className="mb-1 text-xs font-medium text-slate-600">
          {t('mailboxDetail.changePassword')}
        </p>
        <div className="flex items-end gap-2">
          <input
            type="password"
            className={`${inputCls} w-64`}
            placeholder={t('mailboxDetail.newPassword')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            onClick={() => changePassword.mutate()}
            disabled={changePassword.isPending || password.length < 8}
            className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {t('mailboxDetail.changePassword')}
          </button>
        </div>
      </div>

      <div className="mt-4 border-t border-red-100 pt-3">
        <p className="mb-1 text-xs font-medium text-red-700">{t('mailboxDetail.dangerZone')}</p>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(t('mailboxDetail.deleteConfirm', { address: mailbox.address }))) {
              remove.mutate();
            }
          }}
          disabled={remove.isPending}
          className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          {t('mailboxDetail.deleteMailbox')}
        </button>
      </div>

      {status && (
        <p className={`mt-2 text-xs ${status.kind === 'ok' ? 'text-green-700' : 'text-red-700'}`}>
          {status.text}
        </p>
      )}
    </section>
  );
}

function ForwardingSection({ mailbox }: { mailbox: MailboxDTO }) {
  const t = useT();
  const queryClient = useQueryClient();
  const aliases = useQuery({
    queryKey: ['aliases'],
    queryFn: () => api.get<AliasDTO[]>('/admin/api/aliases'),
  });
  const forward = useMemo(
    () =>
      (aliases.data ?? []).find((a) => a.address.toLowerCase() === mailbox.address.toLowerCase()),
    [aliases.data, mailbox.address],
  );

  const [targets, setTargets] = useState('');
  const [keepCopy, setKeepCopy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    setTargets(targetsExcluding(forward, mailbox.address).join(', '));
    setKeepCopy(
      !!forward?.target
        .split(',')
        .some((s) => s.trim().toLowerCase() === mailbox.address.toLowerCase()),
    );
  }, [forward, mailbox.address]);

  const save = useMutation({
    mutationFn: () => {
      const list = targets
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (list.length === 0) {
        return forward
          ? api.delete(`/admin/api/aliases/${forward.id}`)
          : Promise.resolve(undefined);
      }
      const target = keepCopy ? [mailbox.address, ...list].join(', ') : list.join(', ');
      return forward
        ? api.patch(`/admin/api/aliases/${forward.id}`, { target })
        : api.post('/admin/api/aliases', { address: mailbox.address, target });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['aliases'] });
      setStatus({ kind: 'ok', text: t('mailboxes.statusForwardUpdated') });
    },
    onError: (err) =>
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : 'Failed' }),
  });

  return (
    <section className="rounded border border-slate-200 bg-white p-4">
      <h2 className="mb-1 font-semibold text-slate-900">{t('mailboxDetail.sectionForwarding')}</h2>
      <p className="mb-3 text-xs text-slate-500">{t('mailboxDetail.forwardingHelp')}</p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          className={`${inputCls} w-96`}
          placeholder="other@example.com, ..."
          value={targets}
          onChange={(e) => setTargets(e.target.value)}
        />
        <label className="flex items-center gap-1 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={keepCopy}
            onChange={(e) => setKeepCopy(e.target.checked)}
          />
          {t('mailboxDetail.keepCopy')}
        </label>
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {t('common.save')}
        </button>
        {status && (
          <span className={`text-xs ${status.kind === 'ok' ? 'text-green-700' : 'text-red-700'}`}>
            {status.text}
          </span>
        )}
      </div>
    </section>
  );
}

function AliasesSection({ mailbox }: { mailbox: MailboxDTO }) {
  const t = useT();
  const queryClient = useQueryClient();
  const aliases = useQuery({
    queryKey: ['aliases'],
    queryFn: () => api.get<AliasDTO[]>('/admin/api/aliases'),
  });
  const [newAddress, setNewAddress] = useState('');
  const [editing, setEditing] = useState<{ id: string; target: string } | null>(null);
  const [status, setStatus] = useState<Status>(null);

  // Aliases that deliver TO this mailbox (excluding the mailbox's own forwarding alias).
  const incoming = useMemo(() => {
    const addr = mailbox.address.toLowerCase();
    return (aliases.data ?? []).filter(
      (a) =>
        a.address.toLowerCase() !== addr &&
        a.target.split(',').some((s) => s.trim().toLowerCase() === addr),
    );
  }, [aliases.data, mailbox.address]);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['aliases'] });
  const fail = (err: unknown) =>
    setStatus({ kind: 'error', text: err instanceof Error ? err.message : 'Failed' });

  const add = useMutation({
    mutationFn: () =>
      api.post('/admin/api/aliases', { address: newAddress.trim(), target: mailbox.address }),
    onSuccess: () => {
      invalidate();
      setNewAddress('');
      setStatus({ kind: 'ok', text: t('common.add') });
    },
    onError: fail,
  });
  const saveEdit = useMutation({
    mutationFn: (v: { id: string; target: string }) =>
      api.patch(`/admin/api/aliases/${v.id}`, { target: v.target.trim() }),
    onSuccess: () => {
      invalidate();
      setEditing(null);
    },
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/api/aliases/${id}`),
    onSuccess: invalidate,
    onError: fail,
  });

  return (
    <section className="rounded border border-slate-200 bg-white p-4">
      <h2 className="mb-1 font-semibold text-slate-900">{t('mailboxDetail.sectionAliases')}</h2>
      <p className="mb-3 text-xs text-slate-500">{t('mailboxDetail.aliasesHelp')}</p>

      {incoming.length === 0 && (
        <p className="text-xs text-slate-500">{t('mailboxDetail.noAliases')}</p>
      )}
      <div className="space-y-1">
        {incoming.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono text-xs">{a.address}</span>
            <span className="text-slate-400">→</span>
            {editing?.id === a.id ? (
              <>
                <input
                  className={`${inputCls} w-72`}
                  value={editing.target}
                  onChange={(e) => setEditing({ id: a.id, target: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => saveEdit.mutate(editing)}
                  className="text-indigo-600 hover:underline text-xs"
                >
                  {t('common.save')}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="text-slate-500 hover:underline text-xs"
                >
                  {t('common.cancel')}
                </button>
              </>
            ) : (
              <>
                <span className="font-mono text-xs text-slate-600">{a.target}</span>
                <button
                  type="button"
                  onClick={() => setEditing({ id: a.id, target: a.target })}
                  className="text-indigo-600 hover:underline text-xs"
                >
                  {t('common.edit')}
                </button>
                <button
                  type="button"
                  onClick={() => remove.mutate(a.id)}
                  className="text-red-600 hover:underline text-xs"
                >
                  {t('common.delete')}
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          className={`${inputCls} w-64`}
          placeholder={t('mailboxDetail.aliasAddress')}
          value={newAddress}
          onChange={(e) => setNewAddress(e.target.value)}
        />
        <span className="text-xs text-slate-400">→ {mailbox.address}</span>
        <button
          type="button"
          onClick={() => add.mutate()}
          disabled={add.isPending || newAddress.trim() === ''}
          className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {t('common.add')}
        </button>
        {status && (
          <span className={`text-xs ${status.kind === 'ok' ? 'text-green-700' : 'text-red-700'}`}>
            {status.text}
          </span>
        )}
      </div>
    </section>
  );
}
