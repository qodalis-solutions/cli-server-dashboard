import ButtonGroup, { type ButtonGroupLabels, type ButtonGroupTone } from '../../components/ButtonGroup';
import type { JobDto } from '../../types';
import { useI18n } from '../../i18n';
import { jobActions, type JobAction } from './jobActions';

const TONE: Record<JobAction, ButtonGroupTone> = {
  cancel: 'danger',
  trigger: 'primary',
  pause: 'warning',
  resume: 'success',
  stop: 'danger',
};

const LABEL = {
  cancel: 'jobs.cancelRun',
  trigger: 'jobs.trigger',
  pause: 'jobs.pause',
  resume: 'jobs.resume',
  stop: 'jobs.stop',
} as const;

const svg = (children: React.ReactNode) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">{children}</svg>
);
const ICONS: Record<JobAction, React.ReactNode> = {
  cancel: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>,
  trigger: svg(<path d="M7 4.5v15l12.5-7.5z" />),
  pause: svg(<path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z" />),
  resume: svg(<path d="M7 4.5v15l12.5-7.5z" />),
  stop: svg(<rect x="5.5" y="5.5" width="13" height="13" rx="1.5" />),
};

interface Props {
  job: JobDto;
  onAction: (action: JobAction, e: React.MouseEvent) => void;
  /** The action in progress for this job, if any: its segment spins and every segment waits. */
  pending?: JobAction | null;
  labels?: ButtonGroupLabels;
}

/** A job's run controls (cancel, trigger, pause or resume, stop) as one button group. */
export default function JobActionGroup({ job, onAction, pending = null, labels }: Props) {
  const { t } = useI18n();
  const items = jobActions(job).map(action => ({
    key: action,
    label: t(LABEL[action]),
    icon: ICONS[action],
    tone: TONE[action],
    loading: pending === action,
    disabled: pending !== null,
    onClick: (e: React.MouseEvent) => onAction(action, e),
  }));
  return <ButtonGroup items={items} label={t('jobs.actionsFor', { job: job.name })} labels={labels} />;
}
