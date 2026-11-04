import { useWebSocket } from '../context/WebSocketContext';
import { useI18n } from '../i18n';

export default function ConnectionStatus() {
  const { status } = useWebSocket();
  const { t } = useI18n();

  const colors = {
    connected: 'bg-success',
    disconnected: 'bg-error',
    reconnecting: 'bg-warning',
  };

  return (
    <div className="flex items-center gap-1.5 mt-2 pl-9">
      <span className={`w-1.5 h-1.5 rounded-full ${colors[status]}`} />
      <span className="text-[11px] text-subtle">{t(`nav.${status}`)}</span>
    </div>
  );
}
