import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { formatAuthErrorMessage } from '../auth/authErrors';
import { useAuth } from '../auth/AuthContext';
import { ThemeToggle } from '../components/ui/ThemeToggle';

export function LoginPage() {
  const auth = useAuth();
  const location = useLocation();
  const resetOk = Boolean((location.state as { passwordResetOk?: boolean } | null)?.passwordResetOk);
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(resetOk ? 'Senha alterada. Entre com a nova senha.' : null);
  const [submitting, setSubmitting] = useState(false);

  if (!auth.loading && auth.userId && auth.role) {
    return <Navigate to={auth.role === 'admin' ? '/' : '/alunos'} replace />;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await auth.signIn(email.trim(), password);
    } catch (err) {
      setError(formatAuthErrorMessage(err) || 'Não foi possível entrar.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgotSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      await auth.requestPasswordReset(email.trim());
      setInfo('Se este e-mail estiver cadastrado, enviamos um link para redefinir a senha. Verifique a caixa de entrada e o spam.');
      setMode('login');
    } catch (err) {
      setError(formatAuthErrorMessage(err) || 'Não foi possível enviar o e-mail.');
    } finally {
      setSubmitting(false);
    }
  }

  if (mode === 'forgot') {
    return (
      <div className="relative min-h-screen bg-gray-100 flex items-center justify-center p-4 dark:bg-slate-950">
        <div className="absolute right-3 top-3 z-10">
          <ThemeToggle />
        </div>
        <form
          onSubmit={handleForgotSubmit}
          className="w-full max-w-sm space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
        >
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Esqueci minha senha</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">Enviaremos um link para o e-mail cadastrado.</p>
          </div>
          <label className="block text-sm text-gray-700">
            E-mail
            <input
              type="email"
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          {info && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">{info}</p>}
          {(error || auth.error) && <p className="text-sm text-red-600">{error ?? auth.error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-byla-navy text-white py-2 text-sm font-medium disabled:opacity-60"
          >
            {submitting ? 'Enviando...' : 'Enviar link'}
          </button>
          <button
            type="button"
            className="w-full text-sm text-gray-600 underline"
            onClick={() => {
              setMode('login');
              setError(null);
            }}
          >
            Voltar ao login
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-gray-100 flex items-center justify-center p-4 dark:bg-slate-950">
      <div className="absolute right-3 top-3 z-10">
        <ThemeToggle />
      </div>
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
      >
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Entrar no painel Byla</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">Use seu usuário autorizado.</p>
        </div>
        <label className="block text-sm text-gray-700 dark:text-slate-300">
          E-mail
          <input
            type="email"
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </label>
        <label className="block text-sm text-gray-700">
          Senha
          <input
            type="password"
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        <div className="text-right">
          <button type="button" className="text-sm text-byla-navy underline" onClick={() => setMode('forgot')}>
            Esqueci minha senha
          </button>
        </div>
        {info && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">{info}</p>}
        {(error || auth.error) && <p className="text-sm text-red-600">{error ?? auth.error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-byla-navy text-white py-2 text-sm font-medium disabled:opacity-60"
        >
          {submitting ? 'Entrando...' : 'Entrar'}
        </button>
        <p className="text-xs text-gray-500 text-center">
          Problemas com o e-mail de recuperação? Confira <code className="text-gray-600">VITE_SITE_URL</code> e os Redirect URLs no Supabase.
        </p>
      </form>
    </div>
  );
}
