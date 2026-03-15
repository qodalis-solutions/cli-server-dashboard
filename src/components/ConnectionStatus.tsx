import { useWebSocket } from '../context/WebSocketContext';

export default function ConnectionStatus() {
  const { status } = useWebSocket();

  const colors = {
    connected: 'bg-status-success',
    disconnected: 'bg-status-error',
    reconnecting: 'bg-status-warning',
  };

  return (
    <div className="flex items-center gap-1.5 mt-2 pl-9">
      <span className={`w-1.5 h-1.5 rounded-full ${colors[status]}`} />
      <span className="text-[11px] text-slate-500 capitalize">{status}</span>
    </div>
  );
}
