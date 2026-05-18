type AccessibilityChatButtonProps = {
  onClick: () => void;
  unreadCount?: number;
};

export function AccessibilityChatButton({ onClick, unreadCount = 0 }: AccessibilityChatButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Abrir Assistente do Byla"
      className="fixed bottom-6 left-4 z-[85] h-12 w-12 rounded-full border border-indigo-200 bg-indigo-600 text-white shadow-lg transition hover:bg-indigo-700 focus-visible:outline focus-visible:ring-2 focus-visible:ring-indigo-500 md:left-auto md:right-6"
      title="Assistente do Byla"
    >
      <span className="text-xl" aria-hidden="true">
        ?
      </span>
      {unreadCount > 0 ? (
        <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-semibold">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      ) : null}
    </button>
  );
}
