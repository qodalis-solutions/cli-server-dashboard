import type { AuditEntryDto } from '../../types';
import { useI18n } from '../../i18n';
import { auditEventDetails, type AuditFact } from './auditEventDetails';

const LABELS = {
  source: 'audit.factSource',
  result: 'audit.factResult',
  duration: 'audit.factDuration',
  terminal: 'audit.factTerminal',
  origin: 'audit.factOrigin',
  token: 'audit.factToken',
} as const satisfies Record<AuditFact['label'], string>;

const TONES = { success: 'text-success', error: 'text-error' } as const;

/**
 * The details of a data query or a terminal link, read from the entry's metadata; null for other events (the page
 * shows their details text).
 */
export default function AuditEventFacts({ entry }: { entry: AuditEntryDto }) {
  const { t, formatNumber } = useI18n();
  const details = auditEventDetails(entry, {
    rows: n => t('audit.rows', { count: n }),
    ms: n => t('audit.ms', { ms: formatNumber(n) }),
    succeeded: t('audit.succeeded'),
    failed: t('audit.failed'),
  });
  if (!details) return null;

  return (
    <div className="space-y-1">
      {details.facts.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {details.facts.map(fact => (
            <span key={fact.label} className="text-[11px] bg-control px-1.5 py-0.5 rounded truncate max-w-[220px]" title={`${t(LABELS[fact.label])}: ${fact.value}`}>
              <span className="text-subtle">{t(LABELS[fact.label])}: </span>
              <span className={`${fact.tone ? TONES[fact.tone] : 'text-text'} ${fact.label === 'token' || fact.label === 'source' ? 'font-mono' : ''}`}>{fact.value}</span>
            </span>
          ))}
        </div>
      )}
      {details.query && (
        <code className="block font-mono text-[11px] text-muted truncate" title={details.query}>{details.query}</code>
      )}
      {details.error && <div className="text-[11px] text-error truncate" title={details.error}>{details.error}</div>}
    </div>
  );
}
