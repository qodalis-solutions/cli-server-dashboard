import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(username, password);
      navigate('/');
    } catch {
      setError('Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white/[0.04] border border-white/[0.08] rounded-xl p-8 backdrop-blur-sm"
      >
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary-light to-primary flex items-center justify-center text-white font-bold text-lg">
            Q
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Qodalis Admin</h1>
            <p className="text-xs text-slate-400">Server Administration</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        <label className="block text-sm text-slate-400 mb-1">Username</label>
        <input
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value)}
          className="w-full mb-4 px-3 py-2 rounded-lg bg-white/[0.06] border border-white/[0.1] text-white placeholder-slate-500 focus:outline-none focus:border-primary-light"
          placeholder="admin"
          autoFocus
        />

        <label className="block text-sm text-slate-400 mb-1">Password</label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full mb-6 px-3 py-2 rounded-lg bg-white/[0.06] border border-white/[0.1] text-white placeholder-slate-500 focus:outline-none focus:border-primary-light"
          placeholder="••••••••"
        />

        <button
          type="submit"
          disabled={loading || !username || !password}
          className="w-full py-2.5 rounded-lg bg-primary hover:bg-primary-dark text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
