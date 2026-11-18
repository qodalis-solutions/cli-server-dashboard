import { offers } from '../../api/jobs';
import type { JobDto } from '../../types';

export type JobAction = 'cancel' | 'trigger' | 'pause' | 'resume' | 'stop';

/**
 * The actions to show for a job, in order: cancel while a run is going, trigger, pause (active) or resume (paused),
 * and stop; only those the job offers (`actions`).
 */
export function jobActions(job: Pick<JobDto, 'status' | 'currentExecutionId' | 'actions'>): JobAction[] {
  const running = job.status === 'running' || !!job.currentExecutionId;
  const list: JobAction[] = [];
  if (running && offers(job, 'cancel')) list.push('cancel');
  if (offers(job, 'trigger')) list.push('trigger');
  if (offers(job, 'pause') && (job.status === 'active' || job.status === 'running' || job.status === 'scheduled')) list.push('pause');
  else if (offers(job, 'resume') && job.status === 'paused') list.push('resume');
  if (offers(job, 'stop')) list.push('stop');
  return list;
}
