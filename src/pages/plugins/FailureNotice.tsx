import { useEffect, useRef } from 'react';
import { ErrorState } from '@qodalis/cli-server-dashboard-kit';

/**
 * A failed install, update or remove: the title and the server's message, brought into view when it appears (the
 * action's button may be far below the place it is shown, or the dialog scrolled) and announced (`role="alert"`).
 */
export default function FailureNotice({ title, message }: { title: string; message: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [title, message]);
  return (
    <div ref={ref} data-testid="action-failure">
      <ErrorState title={title} error={message} compact />
    </div>
  );
}
