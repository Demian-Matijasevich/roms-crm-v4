export default function EmptyState({ message = "No hay datos", icon = "\u{1F4ED}" }: { message?: string; icon?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <span className="text-4xl mb-3">{icon}</span>
      <p className="text-[var(--muted)]">{message}</p>
    </div>
  );
}
