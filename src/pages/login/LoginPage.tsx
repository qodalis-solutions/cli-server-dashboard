import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(username, password);
      navigate('/');
    } catch {
      setError(t('login.invalidCredentials'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-surface border border-border rounded-xl p-8 backdrop-blur-sm"
      >
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent to-primary flex items-center justify-center text-on-primary font-bold text-lg">
            Q
          </div>
          <div>
            <h1 className="text-xl font-bold text-heading">{t('nav.appName')}</h1>
            <p className="text-xs text-muted">{t('login.subtitle')}</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm">
            {error}
          </div>
        )}

        <label className="block text-sm text-muted mb-1">{t('login.username')}</label>
        <input
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value)}
          className="w-full mb-4 px-3 py-2 rounded-lg bg-control border border-border text-heading placeholder-subtle focus:outline-none focus:border-primary"
          placeholder="admin"
          autoFocus
        />

        <label className="block text-sm text-muted mb-1">{t('login.password')}</label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full mb-6 px-3 py-2 rounded-lg bg-control border border-border text-heading placeholder-subtle focus:outline-none focus:border-primary"
          placeholder="••••••••"
        />

        <button
          type="submit"
          disabled={loading || !username || !password}
          className="w-full py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-on-primary font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? t('login.signingIn') : t('login.signIn')}
        </button>
      </form>
    </div>
  );
}
