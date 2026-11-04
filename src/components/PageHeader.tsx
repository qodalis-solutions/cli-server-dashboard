interface Props {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, actions }: Props) {
  return (
    <div className="px-6 py-4 border-b border-border/75 flex items-center justify-between">
      <div>
        <h2 className="text-lg font-semibold text-heading">{title}</h2>
        {subtitle && <p className="text-xs text-subtle mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
