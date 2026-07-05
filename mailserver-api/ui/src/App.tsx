import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './auth';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { DomainsPage } from './pages/Domains';
import { DomainDetailPage } from './pages/DomainDetail';
import { MailboxesPage } from './pages/Mailboxes';
import { AliasesPage } from './pages/Aliases';
import { SyncPage } from './pages/Sync';
import { SmtpAccountsPage } from './pages/SmtpAccounts';
import { ApiKeysPage } from './pages/ApiKeys';
import { SendLogPage } from './pages/SendLog';
import { UsersPage } from './pages/Users';
import { WebhooksPage } from './pages/Webhooks';
import { FeatureFlagsPage } from './pages/FeatureFlags';
import { BackupsPage } from './pages/Backups';
import { StatsPage } from './pages/Stats';
import { SelfServicePage } from './pages/SelfService';
import { MailboxSievePage } from './pages/MailboxSieve';
import { QuarantinePage } from './pages/Quarantine';
import { AccessListsPage } from './pages/AccessLists';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return <div className="min-h-screen grid place-items-center">Loading…</div>;
  }
  if (!user) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

/** End users (domain_user) get the self-service view; everyone else the admin layout. */
function RoleLayout() {
  const { user } = useAuth();
  if (user?.role === 'domain_user') return <SelfServicePage />;
  return <Layout />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Routes>
          <Route path="/admin/login" element={<Login />} />
          <Route
            path="/admin"
            element={
              <RequireAuth>
                <RoleLayout />
              </RequireAuth>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="stats" element={<StatsPage />} />
            <Route path="domains" element={<DomainsPage />} />
            <Route path="domains/:id" element={<DomainDetailPage />} />
            <Route path="mailboxes" element={<MailboxesPage />} />
            <Route path="mailboxes/:id/sieve" element={<MailboxSievePage />} />
            <Route path="aliases" element={<AliasesPage />} />
            <Route path="quarantine" element={<QuarantinePage />} />
            <Route path="access-lists" element={<AccessListsPage />} />
            <Route path="sync" element={<SyncPage />} />
            <Route path="smtp-accounts" element={<SmtpAccountsPage />} />
            <Route path="api-keys" element={<ApiKeysPage />} />
            <Route path="send-log" element={<SendLogPage />} />
            <Route path="webhooks" element={<WebhooksPage />} />
            <Route path="feature-flags" element={<FeatureFlagsPage />} />
            <Route path="backups" element={<BackupsPage />} />
            <Route path="users" element={<UsersPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/admin/" replace />} />
        </Routes>
      </AuthProvider>
    </QueryClientProvider>
  );
}
