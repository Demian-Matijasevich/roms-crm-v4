interface Props {
  icon?: string;
  title?: string;
  message?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({
  icon = "📭",
  title,
  message,
  description,
  actionLabel,
  onAction,
}: Props) {
  // Compat con la API vieja (message + icon).
  const heading = title || message || "No hay datos";
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <div className="text-5xl mb-3 opacity-60" aria-hidden>
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-white">{heading}</h3>
      {description && (
        <p className="text-xs text-[var(--muted)] mt-1.5 max-w-md leading-relaxed">{description}</p>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 px-4 py-2 rounded-lg bg-[var(--purple)] hover:bg-[var(--purple-dark)] text-white text-sm font-medium transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
