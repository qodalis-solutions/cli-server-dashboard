export default function ConnectionStatus() {
  // TODO: Wire to WebSocketContext
  const connected = true;

  return (
    <div className="flex items-center gap-1.5 mt-2 pl-9">
      <span
        className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-status-success' : 'bg-status-error'}`}
      />
      <span className="text-[11px] text-slate-500">
        {connected ? 'Connected' : 'Disconnected'}
      </span>
    </div>
  );
}
