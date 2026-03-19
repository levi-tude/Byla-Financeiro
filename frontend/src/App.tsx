import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LayoutShell } from './app/LayoutShell';
import { OverviewPage } from './pages/OverviewPage';
import { ConciliacaoPage } from './pages/ConciliacaoPage';
import { EntradasPage } from './pages/EntradasPage';
import { AtividadesPage } from './pages/AtividadesPage';
import { DespesasPage } from './pages/DespesasPage';
import { AlunosPage } from './pages/AlunosPage';
import { RelatoriosPage } from './pages/RelatoriosPage';

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      <p className="text-gray-500 mt-2">Em breve.</p>
    </div>
  );
}

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
          <Route path="despesas" element={<DespesasPage />} />
          <Route path="relatorios-ia" element={<RelatoriosPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
