type ConsultaBylaButtonProps = {
  onClick: () => void;
};

/** Botão flutuante do Consulta Byla — canto inferior direito com safe-area. */
export function AccessibilityChatButton({ onClick }: ConsultaBylaButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Abrir Consulta Byla"
      className="fixed z-[85] flex h-12 w-12 min-h-11 min-w-11 items-center justify-center rounded-full border border-indigo-200 bg-indigo-600 text-white shadow-lg transition hover:bg-indigo-700 focus-visible:outline focus-visible:ring-2 focus-visible:ring-indigo-500"
      style={{
        right: 'max(1rem, env(safe-area-inset-right, 0px))',
        bottom: 'max(1.25rem, env(safe-area-inset-bottom, 0px))',
      }}
      title="Consulta Byla"
    >
      <span className="text-xl" aria-hidden="true">
        ?
      </span>
    </button>
  );
}
