import { useState, type FormEvent } from 'react';
import Modal from '../../components/Modal';
import { formatSpan, updateJob, type JobUpdate } from '../../api/jobs';
import type { JobDto } from '../../types';
import { useI18n } from '../../i18n';
import { JOB_OVERLAP_POLICIES } from '../../i18n/messages/jobs';
import { jobUpdateFrom, type JobForm } from './jobForm';

const INPUT = 'w-full px-2.5 py-1.5 text-xs bg-control border border-border rounded-lg text-text placeholder:text-subtle focus:outline-none focus:border-primary';

/** Edits a job's schedule and options (`PUT /jobs/{id}`); only changed fields are sent. */
export default function JobEditModal({ job, onClose, onSaved }: { job: JobDto; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const initial: JobForm = {
    description: job.description ?? '',
    group: job.group ?? '',
    tags: (job.tags ?? []).join(', '),
    timing: job.schedule ? 'schedule' : 'interval',
    schedule: job.schedule ?? '',
    interval: formatSpan(job.interval) ?? '',
    maxRetries: String(job.maxRetries ?? 0),
    timeout: formatSpan(job.timeout) ?? '',
    overlapPolicy: job.overlapPolicy ?? '',
    maxConcurrentRuns: String(job.maxConcurrentRuns ?? 1),
  };
  const [form, setForm] = useState<JobForm>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (field: keyof JobForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  async function save(e?: FormEvent) {
    e?.preventDefault();
    const result = jobUpdateFrom(initial, form);
    if ('error' in result) {
      setError(t(result.error));
      return;
    }
    if (Object.keys(result.update).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateJob(job.id, result.update satisfies JobUpdate);
      onSaved();
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('jobs.editTitle', { name: job.name })}
      actions={<>
        <button onClick={onClose} className="px-3 py-1.5 text-xs bg-control hover:bg-control-hover text-text rounded-lg">{t('common.cancel')}</button>
        <button onClick={() => save()} disabled={saving} className="px-3 py-1.5 text-xs bg-primary text-on-primary rounded-lg disabled:opacity-50">
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </>}
    >
      <form onSubmit={save} className="space-y-3">
        <label className="block text-xs text-muted">
          {t('jobs.description')}
          <input className={`mt-1 ${INPUT}`} value={form.description} onChange={set('description')} />
        </label>
        <label className="block text-xs text-muted">
          {t('jobs.group')}
          <input className={`mt-1 ${INPUT}`} value={form.group} onChange={set('group')} />
        </label>
        {/* Servers without job tags send none: no field to edit */}
        {job.tags !== undefined && job.tags !== null && (
          <label className="block text-xs text-muted">
            {t('jobs.tags')}
            <input className={`mt-1 font-mono ${INPUT}`} placeholder={t('jobs.tagsHint')} value={form.tags} onChange={set('tags')} />
          </label>
        )}
        <fieldset className="text-xs text-muted">
          <legend>{t('jobs.timing')}</legend>
          <div className="mt-1 flex gap-4">
            <label className="flex items-center gap-1.5">
              <input type="radio" name="timing" value="interval" checked={form.timing === 'interval'} onChange={set('timing')} />
              {t('jobs.interval')}
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" name="timing" value="schedule" checked={form.timing === 'schedule'} onChange={set('timing')} />
              {t('jobs.schedule')}
            </label>
          </div>
          {form.timing === 'interval' ? (
            <input aria-label={t('jobs.interval')} className={`mt-2 font-mono ${INPUT}`} placeholder="30s, 5m, 1h" value={form.interval} onChange={set('interval')} />
          ) : (
            <input aria-label={t('jobs.schedule')} className={`mt-2 font-mono ${INPUT}`} placeholder="*/5 * * * *" value={form.schedule} onChange={set('schedule')} />
          )}
        </fieldset>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label className="block text-xs text-muted">
            {t('jobs.maxRetries')}
            <input type="number" min={0} className={`mt-1 ${INPUT}`} value={form.maxRetries} onChange={set('maxRetries')} />
          </label>
          <label className="block text-xs text-muted">
            {t('jobs.timeout')}
            <input className={`mt-1 font-mono ${INPUT}`} placeholder="5m" value={form.timeout} onChange={set('timeout')} />
          </label>
          <label className="block text-xs text-muted">
            {t('jobs.overlapPolicy')}
            <select className={`mt-1 ${INPUT}`} value={form.overlapPolicy} onChange={set('overlapPolicy')}>
              {!form.overlapPolicy && <option value="">—</option>}
              {JOB_OVERLAP_POLICIES.map(p => <option key={p} value={p}>{t(`jobs.overlap_${p}`)}</option>)}
            </select>
          </label>
          <label className="block text-xs text-muted" title={t('jobs.maxConcurrentRunsHint')}>
            {t('jobs.maxConcurrentRuns')}
            <input type="number" min={1} step={1} className={`mt-1 ${INPUT}`} value={form.maxConcurrentRuns} onChange={set('maxConcurrentRuns')} />
          </label>
        </div>
        {error && <div className="text-error text-xs p-2 bg-error/10 border border-error/20 rounded-lg">{error}</div>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/** The server's `{ error }` text when the body is one, otherwise the message. */
function errorText(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  try {
    const body = JSON.parse(message) as { error?: unknown };
    return typeof body.error === 'string' ? body.error : message;
  } catch {
    return message;
  }
}
