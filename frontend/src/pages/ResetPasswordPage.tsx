import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatAuthErrorMessage } from '../auth/authErrors';
import { supabase } from '../services/supabase';

function hashHasRecoveryType(): boolean {
  const raw = window.location.hash?.replace(/^#/, '') ?? '';
  if (!raw) return false;
  const q = new URLSearchParams(raw);
  return q.get('type') === 'recovery';
}

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setBlocked(true);
      setError('Supabase não configurado no frontend.');
      return;
    }

    const expectingFromHash = hashHasRecoveryType();
    let cancelled = false;
    let settled = false;

    const finishOk = () => {
      if (cancelled || settled) return;
      settled = true;
      window.clearTimeout(timer);
      setReady(true);
      setBlocked(false);
    };

    const timer = window.setTimeout(() => {
      if (cancelled || settled) return;
      settled = true;
      setBlocked(true);
      setError(
        'Link inválido, expirado ou já utilizado. Peça um novo e-mail em “Esqueci minha senha” na tela de login.'
      );
    }, 12000);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (expectingFromHash && event === 'SIGNED_IN' && session)) {
        finishOk();
      }
    });

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session && expectingFromHash) {
        finishOk();
      }
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!supabase) return;
    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (password !== password2) {
      setError('As senhas não coincidem.');
      return;
    }
    setSubmitting(true);
    try {
      const { error: upErr } = await supabase.auth.updateUser({ password });
      if (upErr) throw upErr;
      await supabase.auth.signOut();
      setSuccess(true);
      window.setTimeout(
        () => navigate('/login', { replace: true, state: { passwordResetOk: true } }),
        1500
      );
    } catch (err) {
      setError(formatAuthErrorMessage(err) || 'Não foi possível atualizar a senha.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!supabase) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <p className="text-sm text-red-600">Supabase não configurado.</p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-gray-200 p-5 text-center space-y-3">
          <p className="text-sm text-gray-800">Senha atualizada. Redirecionando para o login…</p>
          <Link to="/login" className="text-sm text-byla-navy underline">
            Ir para o login
          </Link>
        </div>
      </div>
    );
  }

  if (blocked && !ready) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
          <h1 className="text-lg font-semibold text-gray-900">Redefinir senha</h1>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Link to="/login" className="block text-center text-sm text-byla-navy underline">
            Voltar ao login
          </Link>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <p className="text-sm text-gray-600">Validando link de recuperação…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4"
      >
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Nova senha</h1>
          <p className="text-sm text-gray-500 mt-1">Defina uma senha nova para sua conta.</p>
        </div>
        <label className="block text-sm text-gray-700">
          Nova senha
          <input
            type="password"
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />
        </label>
        <label className="block text-sm text-gray-700">
          Confirmar senha
          <input
            type="password"
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-byla-navy text-white py-2 text-sm font-medium disabled:opacity-60"
        >
          {submitting ? 'Salvando...' : 'Salvar nova senha'}
        </button>
        <Link to="/login" className="block text-center text-sm text-gray-600 underline">
          Voltar ao login
        </Link>
      </form>
    </div>
  );
}
