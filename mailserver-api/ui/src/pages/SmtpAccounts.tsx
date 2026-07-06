import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ResourceTable, formatBoolean, shortDate } from '../components/ResourceTable';
import { api } from '../api';
import type { SmtpAccountDTO as SmtpAccount } from '@contracts';
import { useT } from '../i18n';

export function SmtpAccountsPage() {
  const t = useT();
  return (
    <ResourceTable<SmtpAccount>
      title={t('smtpAccounts.title')}
      endpoint="/admin/api/smtp-accounts"
      queryKey={['smtp-accounts']}
      columns={[
        { key: 'name', header: t('smtpAccounts.colName'), render: (r) => r.name },
        { key: 'host', header: t('smtpAccounts.colHost'), render: (r) => `${r.host}:${r.port}` },
        { key: 'from', header: t('smtpAccounts.colFrom'), render: (r) => r.fromAddress },
        { key: 'priority', header: t('smtpAccounts.colPriority'), render: (r) => r.priority },
        { key: 'secure', header: t('smtpAccounts.colTls'), render: (r) => formatBoolean(r.secure) },
        {
          key: 'tlsPolicy',
          header: t('smtpAccounts.colTlsPolicy'),
          render: (r) => (
            <span className="text-xs text-slate-600">
              {[
                r.requireTls ? 'STARTTLS' : null,
                r.rejectUnauthorized === true
                  ? 'verify'
                  : r.rejectUnauthorized === false
                    ? 'no-verify'
                    : null,
                r.minTlsVersion ?? null,
              ]
                .filter(Boolean)
                .join(' · ') || '–'}
            </span>
          ),
        },
        {
          key: 'active',
          header: t('smtpAccounts.colActive'),
          render: (r) => formatBoolean(r.active),
        },
        { key: 'created', header: t('common.created'), render: (r) => shortDate(r.createdAt) },
      ]}
      createFields={[
        {
          name: 'name',
          label: t('smtpAccounts.fieldName'),
          required: true,
          placeholder: 'primary',
        },
        {
          name: 'host',
          label: t('smtpAccounts.fieldHost'),
          required: true,
          placeholder: 'mailserver',
        },
        {
          name: 'port',
          label: t('smtpAccounts.fieldPort'),
          required: true,
          type: 'number',
          defaultValue: 587,
        },
        { name: 'secure', label: t('smtpAccounts.fieldTls'), type: 'checkbox' },
        { name: 'requireTls', label: t('smtpAccounts.fieldRequireTls'), type: 'checkbox' },
        {
          name: 'rejectUnauthorized',
          label: t('smtpAccounts.fieldVerify'),
          type: 'select',
          options: [
            { value: 'default', label: t('smtpAccounts.verifyDefault') },
            { value: 'verify', label: t('smtpAccounts.verifyOn') },
            { value: 'skip', label: t('smtpAccounts.verifyOff') },
          ],
        },
        {
          name: 'minTlsVersion',
          label: t('smtpAccounts.fieldMinTls'),
          type: 'select',
          options: [
            { value: '', label: t('smtpAccounts.minTlsAny') },
            { value: 'TLSv1.2', label: 'TLSv1.2' },
            { value: 'TLSv1.3', label: 'TLSv1.3' },
          ],
        },
        {
          name: 'fromAddress',
          label: t('smtpAccounts.fieldFromAddress'),
          required: true,
          type: 'email',
        },
        { name: 'fromName', label: t('smtpAccounts.fieldFromName') },
        { name: 'userEnvVar', label: t('smtpAccounts.fieldUserEnvVar') },
        { name: 'passwordEnvVar', label: t('smtpAccounts.fieldPasswordEnvVar') },
        {
          name: 'priority',
          label: t('smtpAccounts.fieldPriority'),
          required: true,
          type: 'number',
          defaultValue: 1,
        },
      ]}
      transformCreate={(values) => {
        const body: Record<string, unknown> = {
          name: values.name,
          host: values.host,
          port: Number(values.port),
          secure: Boolean(values.secure),
          requireTls: Boolean(values.requireTls),
          fromAddress: values.fromAddress,
          priority: Number(values.priority),
        };
        if (values.rejectUnauthorized === 'verify') body.rejectUnauthorized = true;
        else if (values.rejectUnauthorized === 'skip') body.rejectUnauthorized = false;
        if (values.minTlsVersion) body.minTlsVersion = values.minTlsVersion;
        if (values.fromName) body.fromName = values.fromName;
        if (values.userEnvVar) body.userEnvVar = values.userEnvVar;
        if (values.passwordEnvVar) body.passwordEnvVar = values.passwordEnvVar;
        return body;
      }}
      rowActions={(row) => <SmtpAccountActions account={row} />}
    />
  );
}

function SmtpAccountActions({ account }: { account: SmtpAccount }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch<SmtpAccount>(`/admin/api/smtp-accounts/${account.id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['smtp-accounts'] });
      setMessage({ text: t('smtpAccounts.saved'), error: false });
    },
    onError: (err) => {
      setMessage({ text: err instanceof Error ? err.message : t('common.failed'), error: true });
    },
  });

  const onEdit = () => {
    const priorityInput = window.prompt(t('smtpAccounts.fieldPriority'), String(account.priority));
    if (priorityInput === null) return;
    const priority = Number(priorityInput);
    if (!Number.isFinite(priority)) {
      setMessage({ text: t('smtpAccounts.priorityMustBeNumber'), error: true });
      return;
    }

    const fromNameInput = window.prompt(t('smtpAccounts.promptFromName'), account.fromName ?? '');
    if (fromNameInput === null) return;
    const fromName = fromNameInput.trim();

    const body: Record<string, unknown> = {};
    if (priority !== account.priority) body.priority = priority;
    if (fromName !== (account.fromName ?? '')) body.fromName = fromName;

    if (Object.keys(body).length === 0) {
      setMessage({ text: t('smtpAccounts.noChanges'), error: false });
      return;
    }
    patch.mutate(body);
  };

  return (
    <span className="space-x-3">
      <button
        type="button"
        onClick={() => patch.mutate({ active: !account.active })}
        disabled={patch.isPending}
        className="text-indigo-600 hover:underline text-xs disabled:opacity-50"
      >
        {account.active ? t('smtpAccounts.disable') : t('smtpAccounts.enable')}
      </button>
      <button
        type="button"
        onClick={onEdit}
        disabled={patch.isPending}
        className="text-indigo-600 hover:underline text-xs disabled:opacity-50"
      >
        {t('common.edit')}
      </button>
      {message && (
        <span className={`text-xs ${message.error ? 'text-red-700' : 'text-slate-600'}`}>
          {message.text}
        </span>
      )}
    </span>
  );
}
