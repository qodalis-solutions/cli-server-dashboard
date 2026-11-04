import ErrorBoundary from './ErrorBoundary';
interface Props {
  label: string;
  value: string | number;
  sub?: string;
  subColor?: string;
}

function StatCardContent({ label, value, sub, subColor = 'text-subtle' }: Props) {
  return (
    <div className="flex-1 bg-surface border border-border rounded-xl p-4">
      <div className="text-[11px] text-subtle uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-semibold text-heading mt-1">{value}</div>
      {sub && <div className={`text-[11px] mt-0.5 ${subColor}`}>{sub}</div>}
    </div>
  );
}

/** A failing card shows an inline error instead of breaking the page */
export default function StatCard(props: Props) {
  return (
    <ErrorBoundary label={props.label} resetKeys={[props.value]}>
      <StatCardContent {...props} />
    </ErrorBoundary>
  );
}
