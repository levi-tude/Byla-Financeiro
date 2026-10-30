/** 'gestor' = só leitura: por ora acessa apenas o Consulta Byla e o próprio perfil. */
export type AppRole = 'admin' | 'secretaria' | 'gestor';

export type AuthState = {
  loading: boolean;
  userId: string | null;
  email: string | null;
  role: AppRole | null;
  error: string | null;
};
