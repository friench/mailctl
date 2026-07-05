import { NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { AppSettingsDTO } from '@contracts';
import { useAuth } from '../auth';
import { api } from '../api';

const NAV = [
  { to: '/admin/', label: 'Dashboard', end: true },
  { to: '/admin/stats', label: 'Stats' },
  { to: '/admin/domains', label: 'Domains' },
  { to: '/admin/mailboxes', label: 'Mailboxes' },
  { to: '/admin/aliases', label: 'Aliases' },
  { to: '/admin/import', label: 'Bulk import' },
  { to: '/admin/quarantine', label: 'Quarantine' },
  { to: '/admin/access-lists', label: 'Allow / deny' },
  { to: '/admin/engine', label: 'Engine' },
  { to: '/admin/ops', label: 'Operations' },
  { to: '/admin/migrations', label: 'Migrations' },
  { to: '/admin/fetchmail', label: 'Fetchmail' },
  { to: '/admin/sync', label: 'Sync' },
  { to: '/admin/smtp-accounts', label: 'SMTP accounts' },
  { to: '/admin/api-keys', label: 'API keys' },
  { to: '/admin/send-log', label: 'Send log' },
  { to: '/admin/webhooks', label: 'Webhooks' },
  { to: '/admin/feature-flags', label: 'Feature flags' },
  { to: '/admin/backups', label: 'Backups' },
  { to: '/admin/users', label: 'Users' },
];

export function Layout() {
  const { user, logout } = useAuth();
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<AppSettingsDTO>('/admin/api/settings'),
    staleTime: 5 * 60_000,
  });
  const webmailUrl = settings.data?.webmailUrl ?? null;

  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside className="w-60 bg-slate-900 text-slate-200 flex flex-col">
        <div className="px-5 py-4 text-lg font-semibold border-b border-slate-700">mail-api</div>
        <nav className="flex-1 py-2">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block px-5 py-2 text-sm hover:bg-slate-800 ${
                  isActive ? 'bg-slate-800 text-white border-l-2 border-indigo-400' : ''
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
          {webmailUrl && (
            <a
              href={webmailUrl}
              target="_blank"
              rel="noreferrer"
              className="block px-5 py-2 text-sm text-slate-300 hover:bg-slate-800"
            >
              Webmail ↗
            </a>
          )}
        </nav>
        <div className="px-5 py-3 border-t border-slate-700 text-xs">
          <div className="truncate text-slate-400">{user?.email}</div>
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-2 text-indigo-300 hover:text-indigo-100"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
