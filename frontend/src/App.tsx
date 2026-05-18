import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LayoutShell } from './app/LayoutShell';
import { OverviewPage } from './pages/OverviewPage';
import { ConciliacaoPage } from './pages/ConciliacaoPage';
import { AtividadesPage } from './pages/AtividadesPage';
import { RelatoriosPage } from './pages/RelatoriosPage';
import { ValidacaoPagamentosDiariaPage } from './pages/ValidacaoPagamentosDiariaPage';
import { CalendarioFinanceiroPage } from './pages/CalendarioFinanceiroPage';
import { ControleCaixaPage } from './pages/ControleCaixaPage';
import { FluxoCaixaOperacionalPage } from './pages/FluxoCaixaOperacionalPage';
import { FluxoDivergenciasPage } from './pages/FluxoDivergenciasPage';
import { ProfilePage } from './pages/ProfilePage';
import { RequireAuth } from './auth/RequireAuth';
import { LoginPage } from './pages/LoginPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { useAuth } from './auth/AuthContext';
import { TransacoesPage } from './pages/TransacoesPage';

function HomeByRole() {
  const auth = useAuth();
  if (auth.loading) return null;
  if (!auth.userId) return <Navigate to="/login" replace />;
  if (auth.role === 'secretaria') return <Navigate to="/fluxo-caixa" replace />;
  return <OverviewPage />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <LayoutShell />
            </RequireAuth>
          }
        >
          <Route index element={<HomeByRole />} />
          <Route
            path="conciliacao"
            element={
              <RequireAuth roles={['admin']}>
                <ConciliacaoPage />
              </RequireAuth>
            }
          />
          <Route path="alunos" element={<Navigate to="/fluxo-caixa" replace />} />
          <Route path="pagamentos-planilha" element={<Navigate to="/fluxo-caixa" replace />} />
          <Route path="atividades" element={<Navigate to="/performance-atividades" replace />} />
          <Route
            path="performance-atividades"
            element={
              <RequireAuth roles={['admin']}>
                <AtividadesPage />
              </RequireAuth>
            }
          />
          <Route
            path="transacoes"
            element={
              <RequireAuth roles={['admin']}>
                <TransacoesPage />
              </RequireAuth>
            }
          />
          <Route
            path="entradas"
            element={
              <RequireAuth roles={['admin']}>
                <Navigate to="/transacoes" replace />
              </RequireAuth>
            }
          />
          <Route
            path="saidas"
            element={
              <RequireAuth roles={['admin']}>
                <Navigate to="/transacoes" replace />
              </RequireAuth>
            }
          />
          <Route path="despesas" element={<Navigate to="/transacoes" replace />} />
          <Route
            path="relatorios-ia"
            element={
              <RequireAuth roles={['admin']}>
                <RelatoriosPage />
              </RequireAuth>
            }
          />
          <Route
            path="validacao-pagamentos-diaria"
            element={
              <RequireAuth roles={['admin']}>
                <ValidacaoPagamentosDiariaPage />
              </RequireAuth>
            }
          />
          <Route
            path="fluxo-divergencias"
            element={
              <RequireAuth roles={['admin']}>
                <FluxoDivergenciasPage />
              </RequireAuth>
            }
          />
          <Route
            path="fluxo-caixa"
            element={
              <RequireAuth roles={['secretaria', 'admin']}>
                <FluxoCaixaOperacionalPage />
              </RequireAuth>
            }
          />
          <Route
            path="perfil"
            element={
              <RequireAuth roles={['secretaria', 'admin']}>
                <ProfilePage />
              </RequireAuth>
            }
          />
          <Route
            path="controle-caixa"
            element={
              <RequireAuth roles={['admin']}>
                <ControleCaixaPage />
              </RequireAuth>
            }
          />
          <Route
            path="calendario-financeiro"
            element={
              <RequireAuth roles={['admin']}>
                <CalendarioFinanceiroPage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
