const variants = {
  success: 'bg-success/15 text-success border-success/30',
  warning: 'bg-warning/15 text-warning border-warning/30',
  error: 'bg-error/15 text-error border-error/30',
  info: 'bg-info/15 text-info border-info/30',
  neutral: 'bg-subtle/15 text-muted border-subtle/30',
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
