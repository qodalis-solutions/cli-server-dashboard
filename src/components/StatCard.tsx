interface Props {
  label: string;
  value: string | number;
  sub?: string;
  subColor?: string;
}

export default function StatCard({ label, value, sub, subColor = 'text-slate-500' }: Props) {
  return (
    <div className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl p-4">
      <div className="text-[11px] text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-semibold text-white mt-1">{value}</div>
      {sub && <div className={`text-[11px] mt-0.5 ${subColor}`}>{sub}</div>}
    </div>
  );
}
