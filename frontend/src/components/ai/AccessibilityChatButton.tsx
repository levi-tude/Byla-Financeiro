type ConsultaBylaButtonProps = {
  onClick: () => void;
};

/** Botão flutuante do Consulta Byla (só Admin). */
export function AccessibilityChatButton({ onClick }: ConsultaBylaButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Abrir Consulta Byla"
      className="fixed bottom-6 left-4 z-[85] h-12 w-12 rounded-full border border-indigo-200 bg-indigo-600 text-white shadow-lg transition hover:bg-indigo-700 focus-visible:outline focus-visible:ring-2 focus-visible:ring-indigo-500 md:left-auto md:right-6"
      title="Consulta Byla"
    >
      <span className="text-xl" aria-hidden="true">
        ?
      </span>
    </button>
  );
}
