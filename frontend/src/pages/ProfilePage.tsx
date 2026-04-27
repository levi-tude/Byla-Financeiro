import { useMemo } from 'react';
import { useAuth } from '../auth/AuthContext';

export function ProfilePage() {
  const auth = useAuth();

  const initials = useMemo(() => {
    const email = auth.email?.trim() ?? '';
    if (!email) return 'U';
    return email.charAt(0).toUpperCase();
  }, [auth.email]);

  return (
    <div className="min-h-full bg-slate-100 px-4 py-6 dark:bg-slate-950 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-xl font-semibold text-white">
              {initials}
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Perfil</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Dados da sua conta no sistema BYLA.</p>
            </div>
          </div>

          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Email</dt>
              <dd className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{auth.email ?? 'Nao informado'}</dd>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Perfil de acesso</dt>
              <dd className="mt-1 text-sm font-medium text-slate-900 capitalize dark:text-slate-100">{auth.role ?? 'Nao definido'}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
