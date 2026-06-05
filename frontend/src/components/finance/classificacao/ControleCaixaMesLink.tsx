import { Link } from 'react-router-dom';

export function ControleCaixaMesLink() {
  return (
    <Link
      to="/controle-caixa"
      className="mt-2 inline-flex text-sm font-semibold text-indigo-700 hover:underline dark:text-indigo-300"
    >
      Abrir Controle de Caixa deste mês →
    </Link>
  );
}
