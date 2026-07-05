import { Link, useParams } from 'react-router-dom';
import { SieveEditor } from '../components/SieveEditor';

export function MailboxSievePage() {
  const { id = '' } = useParams();
  return (
    <div className="space-y-4">
      <div>
        <Link to="/admin/mailboxes" className="text-sm text-indigo-600 hover:underline">
          ← Mailboxes
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">Filters &amp; vacation</h1>
      </div>
      <SieveEditor endpoint={`/admin/api/mailboxes/${id}/sieve`} queryKey={['mailbox-sieve', id]} />
    </div>
  );
}
