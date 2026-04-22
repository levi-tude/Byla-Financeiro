import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getPasswordRecoveryRedirectUrl } from './authRedirect';
import { supabase } from '../services/supabase';
import type { AppRole, AuthState } from './types';

type AuthContextValue = AuthState & {
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const SESSION_TIMEOUT_MS = 25_000;
const PROFILE_TIMEOUT_MS = 20_000;

function isRole(value: unknown): value is AppRole {
  return value === 'admin' || value === 'secretaria';
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(`${label} — tempo esgotado (${Math.round(ms / 1000)}s).`)), ms);
    promise.then(
      (v) => {
        window.clearTimeout(t);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(t);
        reject(e);
      }
    );
  });
}

async function fetchRoleFromProfile(userId: string): Promise<AppRole | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  if (error) return null;
  return isRole(data?.role) ? data.role : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    loading: true,
    userId: null,
    email: null,
    role: null,
    error: null,
  });

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      if (!supabase) {
        if (!mounted) return;
        setState({
          loading: false,
          userId: null,
          email: null,
          role: null,
          error: 'Supabase não configurado no frontend.',
        });
        return;
      }

      try {
        const { data, error } = await withTimeout(
          supabase.auth.getSession(),
          SESSION_TIMEOUT_MS,
          'Leitura da sessão'
        );
        if (!mounted) return;
        if (error) {
          setState((prev) => ({ ...prev, loading: false, error: error.message }));
          return;
        }

        const user = data.session?.user ?? null;
        if (!user) {
          setState({ loading: false, userId: null, email: null, role: null, error: null });
          return;
        }

        const role = await withTimeout(fetchRoleFromProfile(user.id), PROFILE_TIMEOUT_MS, 'Perfil (profiles)');
        if (!mounted) return;
        setState({
          loading: false,
          userId: user.id,
          email: user.email ?? null,
          role,
          error: role ? null : 'Usuário sem perfil configurado. Defina role em profiles.',
        });
      } catch (e) {
        if (!mounted) return;
        const msg = e instanceof Error ? e.message : String(e);
        setState({
          loading: false,
          userId: null,
          email: null,
          role: null,
          error: `Não foi possível validar o login. ${msg} Tente atualizar a página ou sair e entrar de novo.`,
        });
      }
    }

    void bootstrap();

    if (!supabase) {
      return () => {
        mounted = false;
      };
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      // Não usar async direto no callback: pode travar a fila interna do supabase-js.
      queueMicrotask(() => {
        void (async () => {
          const user = session?.user ?? null;
          if (!user) {
            if (!mounted) return;
            setState({ loading: false, userId: null, email: null, role: null, error: null });
            return;
          }
          try {
            const role = await withTimeout(fetchRoleFromProfile(user.id), PROFILE_TIMEOUT_MS, 'Perfil (profiles)');
            if (!mounted) return;
            setState({
              loading: false,
              userId: user.id,
              email: user.email ?? null,
              role,
              error: role ? null : 'Usuário sem perfil configurado. Defina role em profiles.',
            });
          } catch {
            if (!mounted) return;
            setState({
              loading: false,
              userId: user.id,
              email: user.email ?? null,
              role: null,
              error: 'Não foi possível carregar o perfil. Atualize a página.',
            });
          }
        })();
      });
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      signIn: async (email: string, password: string) => {
        if (!supabase) throw new Error('Supabase não configurado no frontend.');
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },
      signOut: async () => {
        if (!supabase) return;
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      },
      requestPasswordReset: async (email: string) => {
        if (!supabase) throw new Error('Supabase não configurado no frontend.');
        const redirectTo = getPasswordRecoveryRedirectUrl();
        if (!/^https?:\/\//i.test(redirectTo)) {
          throw new Error(
            'URL de retorno inválida. Defina VITE_SITE_URL no .env com a URL completa (ex.: http://localhost:5173).'
          );
        }
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
        if (error) throw error;
      },
    }),
    [state]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  return ctx;
}
