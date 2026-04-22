export type AppRole = 'admin' | 'secretaria';

export type AuthState = {
  loading: boolean;
  userId: string | null;
  email: string | null;
  role: AppRole | null;
  error: string | null;
};
