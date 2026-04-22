import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import type { AppRole } from './types';

type RequireAuthProps = {
  children: JSX.Element;
  roles?: readonly AppRole[];
};

function roleHome(role: AppRole): string {
  return role === 'admin' ? '/' : '/alunos';
}

export function RequireAuth({ children, roles }: RequireAuthProps) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.loading) {
    return (
      <div className="p-6 space-y-2">
        <div className="text-sm text-gray-600">Carregando sessão...</div>
        <p className="text-xs text-gray-400">Se ficar muito tempo aqui, atualize a página ou limpe o armazenamento do site para este domínio.</p>
      </div>
    );
  }

  if (!auth.userId) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!auth.role) {
    return (
      <div className="p-6 text-sm text-red-600">
        Seu usuário não tem perfil configurado. Peça para o administrador definir `admin` ou `secretaria`.
      </div>
    );
  }

  if (roles && !roles.includes(auth.role)) {
    return <Navigate to={roleHome(auth.role)} replace />;
  }

  return children;
}
