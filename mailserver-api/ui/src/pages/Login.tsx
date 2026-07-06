import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { api } from '../api';

interface AuthConfig {
  oidc: { enabled: boolean; label: string };
}

const SSO_ERRORS: Record<string, string> = {
  sso_denied: 'SSO sign-in was cancelled.',
  sso_state: 'SSO session expired — please try again.',
  sso_exchange: 'SSO sign-in failed. Please try again.',
  sso_unverified: 'Your SSO email is not verified.',
  sso_no_account: 'No account exists for your SSO identity. Ask an admin to add you.',
};

export function Login() {
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);

  useEffect(() => {
    api
      .get<AuthConfig>('/admin/auth/config')
      .then(setAuthConfig)
      .catch(() => setAuthConfig(null));
    const ssoError = new URLSearchParams(location.search).get('error');
    if (ssoError) setError(SSO_ERRORS[ssoError] ?? 'SSO sign-in failed.');
  }, [location.search]);

  if (loading) {
    return <div className="min-h-screen grid place-items-center">Loading…</div>;
  }
  if (user) {
    const next = (location.state as { from?: string } | undefined)?.from ?? '/admin/';
    return <Navigate to={next} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      navigate('/admin/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-slate-100">
      <div className="bg-white shadow rounded p-6 w-80">
        <h1 className="text-xl font-semibold mb-4">mail-api admin</h1>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="block text-sm text-slate-700 mb-1" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-700 mb-1" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {error && <div className="text-sm text-red-700">{error}</div>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full px-3 py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {authConfig?.oidc.enabled && (
          <>
            <div className="my-4 flex items-center gap-2 text-xs text-slate-400">
              <span className="h-px flex-1 bg-slate-200" />
              or
              <span className="h-px flex-1 bg-slate-200" />
            </div>
            <a
              href="/admin/auth/oidc/start"
              className="block w-full rounded border border-slate-300 px-3 py-2 text-center text-sm text-slate-700 hover:bg-slate-50"
            >
              {authConfig.oidc.label || 'Sign in with SSO'}
            </a>
          </>
        )}
      </div>
    </div>
  );
}
