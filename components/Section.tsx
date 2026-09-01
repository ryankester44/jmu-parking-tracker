export function Section({
  id,
  title,
  subtitle,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h2 className="text-xl font-bold sm:text-2xl">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-[color:var(--text-secondary)]">{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}
