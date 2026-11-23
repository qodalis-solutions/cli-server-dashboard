import './styles.css';
import { defineExtension, useDashboard } from '@qodalis/cli-server-dashboard-kit';
import JobsPage from './JobsPage';
import JobDetail from './JobDetail';
import { jobIdOf } from './router';
import { failingJobs, jobEntries, useBoundFetch } from './overview';
import { ActiveJobsCard, RunsChartCard } from './OverviewCards';

/** Routes inside the extension: `/` the jobs (filters in the query: `?q=`, `?at=`, …), `/<id>` a job. */
function JobsModule() {
  useBoundFetch();
  const { path } = useDashboard();
  const id = jobIdOf(path);
  return id ? <JobDetail key={id} /> : <JobsPage />;
}

export default defineExtension(JobsModule, {
  overview: {
    cards: [
      { id: 'active-jobs', size: 'stat', component: ActiveJobsCard },
      { id: 'runs-24h', size: 'full', component: RunsChartCard },
    ],
    attention: failingJobs,
  },
  palette: jobEntries,
});
