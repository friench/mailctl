import { Link, useParams } from 'react-router-dom';
import { SieveEditor } from '../components/SieveEditor';
import { useT } from '../i18n';

export function MailboxSievePage() {
  const t = useT();
  const { id = '' } = useParams();
  return (
    <div className="space-y-4">
      <div>
        <Link to="/admin/mailboxes" className="text-sm text-indigo-600 hover:underline">
          {t('sieve.back')}
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">{t('sieve.title')}</h1>
      </div>
      <SieveEditor endpoint={`/admin/api/mailboxes/${id}/sieve`} queryKey={['mailbox-sieve', id]} />
    </div>
  );
}
