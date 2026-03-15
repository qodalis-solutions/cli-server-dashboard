const variants = {
  success: 'bg-status-success/15 text-status-success border-status-success/30',
  warning: 'bg-status-warning/15 text-status-warning border-status-warning/30',
  error: 'bg-status-error/15 text-status-error border-status-error/30',
  info: 'bg-status-info/15 text-status-info border-status-info/30',
  neutral: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
} as const;

interface Props {
  variant: keyof typeof variants;
  children: React.ReactNode;
  dot?: boolean;
}

export default function Badge({ variant, children, dot }: Props) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${variants[variant]}`}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
