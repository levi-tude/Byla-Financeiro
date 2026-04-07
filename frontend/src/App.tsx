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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LayoutShell />}>
          <Route index element={<OverviewPage />} />
          <Route path="conciliacao" element={<ConciliacaoPage />} />
          <Route path="entradas" element={<EntradasPage />} />
          <Route path="atividades" element={<AtividadesPage />} />
          <Route path="alunos" element={<AlunosPage />} />
          <Route path="saidas" element={<DespesasPage />} />
          <Route path="despesas" element={<Navigate to="/saidas" replace />} />
          <Route path="relatorios-ia" element={<RelatoriosPage />} />
          <Route path="pagamentos-planilha" element={<PagamentosPlanilhaPage />} />
          <Route path="validacao-pagamentos-diaria" element={<ValidacaoPagamentosDiariaPage />} />
          <Route path="calendario-financeiro" element={<CalendarioFinanceiroPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
