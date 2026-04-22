import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LayoutShell } from './app/LayoutShell';
import { OverviewPage } from './pages/OverviewPage';
import { ConciliacaoPage } from './pages/ConciliacaoPage';
import { EntradasPage } from './pages/EntradasPage';
import { AtividadesPage } from './pages/AtividadesPage';
import { DespesasPage } from './pages/DespesasPage';
import { AlunosPage } from './pages/AlunosPage';
import { RelatoriosPage } from './pages/RelatoriosPage';
import { PagamentosPlanilhaPage } from './pages/PagamentosPlanilhaPage';
import { ValidacaoPagamentosDiariaPage } from './pages/ValidacaoPagamentosDiariaPage';
import { CalendarioFinanceiroPage } from './pages/CalendarioFinanceiroPage';
import { ControleCaixaPage } from './pages/ControleCaixaPage';
import { FluxoCaixaOperacionalPage } from './pages/FluxoCaixaOperacionalPage';
import { RequireAuth } from './auth/RequireAuth';
import { LoginPage } from './pages/LoginPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { useAuth } from './auth/AuthContext';

function HomeByRole() {
  const auth = useAuth();
  if (auth.loading) return null;
  if (!auth.userId) return <Navigate to="/login" replace />;
  if (auth.role === 'secretaria') return <Navigate to="/alunos" replace />;
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
          <Route
            path="entradas"
            element={
              <RequireAuth roles={['admin']}>
                <EntradasPage />
              </RequireAuth>
            }
          />
          <Route
            path="atividades"
            element={
              <RequireAuth roles={['secretaria', 'admin']}>
                <AtividadesPage />
              </RequireAuth>
            }
          />
          <Route
            path="alunos"
            element={
              <RequireAuth roles={['secretaria', 'admin']}>
                <AlunosPage />
              </RequireAuth>
            }
          />
          <Route
            path="saidas"
            element={
              <RequireAuth roles={['admin']}>
                <DespesasPage />
              </RequireAuth>
            }
          />
          <Route path="despesas" element={<Navigate to="/saidas" replace />} />
          <Route
            path="relatorios-ia"
            element={
              <RequireAuth roles={['admin']}>
                <RelatoriosPage />
              </RequireAuth>
            }
          />
          <Route
            path="pagamentos-planilha"
            element={
              <RequireAuth roles={['secretaria', 'admin']}>
                <PagamentosPlanilhaPage />
              </RequireAuth>
            }
          />
          <Route
            path="validacao-pagamentos-diaria"
            element={
              <RequireAuth roles={['secretaria', 'admin']}>
                <ValidacaoPagamentosDiariaPage />
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
