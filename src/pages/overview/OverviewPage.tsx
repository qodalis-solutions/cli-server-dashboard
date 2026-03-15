import { useEffect, useState } from 'react';
import StatCard from '../../components/StatCard';
import PageHeader from '../../components/PageHeader';
import MonoPanel from '../../components/MonoPanel';
import { useApi } from '../../hooks/useApi';
import { useWebSocket } from '../../context/WebSocketContext';
import { getStatus } from '../../api/status';
import { getCapabilities } from '../../api/status';
import { getJobs } from '../../api/jobs';

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

export default function OverviewPage() {
  const { data: status, loading: statusLoading } = useApi(getStatus, []);
  const { data: caps, loading: capsLoading } = useApi(getCapabilities, []);
  const { data: jobs } = useApi(getJobs, []);

  const [eventLines, setEventLines] = useState<string[]>([]);
  const { subscribe } = useWebSocket();

  useEffect(() => {
    const unsub = subscribe('*', (event) => {
      const type = (event.type as string) ?? 'unknown';
      const payload = JSON.stringify(event);
      setEventLines(prev => [...prev.slice(-99), `[${formatTimestamp()}] ${type} ${payload}`]);
    });
    return unsub;
  }, [subscribe]);

  const uptime = status ? formatUptime(status.uptimeSeconds) : '—';
  const commandCount = status ? String(status.registeredCommands) : '—';
  const activeJobs = status ? String(status.registeredJobs) : '—';
  const wsClients = status ? String(status.activeWsConnections) : '—';

  // Show last 5 jobs as a proxy for "recent" (jobs API doesn't return executions directly)
  const recentJobs = jobs ? jobs.slice(0, 5) : null;

  return (
    <div>
      <PageHeader
        title="Overview"
        subtitle="Server health and activity at a glance"
      />

      <div className="p-6 space-y-6">
        {/* Stat Cards */}
        <div className="flex gap-4">
          <StatCard
            label="Uptime"
            value={uptime}
            sub={statusLoading ? 'Loading...' : status ? `Since ${new Date(status.startedAt).toLocaleString()}` : undefined}
          />
          <StatCard
            label="Commands"
            value={commandCount}
            sub="Registered processors"
          />
          <StatCard
            label="Active Jobs"
            value={activeJobs}
            sub="Registered jobs"
          />
          <StatCard
            label="WS Clients"
            value={wsClients}
            sub="Active connections"
          />
        </div>

        {/* Server Info Panel */}
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Server Information</h3>
          {capsLoading ? (
            <p className="text-slate-400 text-sm">Loading...</p>
          ) : caps ? (
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">OS</span>
                <span className="text-slate-200 font-mono text-xs">{caps.os ?? status?.os ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Platform</span>
                <span className="text-slate-200 font-mono text-xs">{caps.platform ?? status?.platform ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Shell</span>
                <span className="text-slate-200 font-mono text-xs">{caps.shell ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Version</span>
                <span className="text-slate-200 font-mono text-xs">{caps.version ?? status?.platformVersion ?? '—'}</span>
              </div>
              {status && (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Memory</span>
                    <span className="text-slate-200 font-mono text-xs">{status.memoryUsageMb.toFixed(1)} MB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Shell Sessions</span>
                    <span className="text-slate-200 font-mono text-xs">{status.activeShellSessions}</span>
                  </div>
                </>
              )}
            </div>
          ) : (
            <p className="text-slate-400 text-sm">Unable to load server info.</p>
          )}
        </div>

        {/* Recent Jobs */}
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
            <span className="text-sm font-medium text-white">Recent Jobs</span>
            <a href="jobs" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">View all</a>
          </div>
          {recentJobs === null ? (
            <div className="px-4 py-4 text-sm text-slate-400">No job data available.</div>
          ) : recentJobs.length === 0 ? (
            <div className="px-4 py-4 text-sm text-slate-400">No jobs registered.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-slate-500 uppercase tracking-wide border-b border-white/[0.04]">
                  <th className="text-left px-4 py-2 font-medium">Name</th>
                  <th className="text-left px-4 py-2 font-medium">Group</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-left px-4 py-2 font-medium">Last Run</th>
                  <th className="text-left px-4 py-2 font-medium">Next Run</th>
                </tr>
              </thead>
              <tbody>
                {recentJobs.map(job => (
                  <tr key={job.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-2 text-slate-200">{job.name}</td>
                    <td className="px-4 py-2 text-slate-400">{job.group}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        job.status === 'active' || job.status === 'running'
                          ? 'bg-green-500/20 text-green-400'
                          : job.status === 'paused'
                          ? 'bg-amber-500/20 text-amber-400'
                          : job.status === 'stopped' || job.status === 'failed'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-slate-500/20 text-slate-400'
                      }`}>
                        {job.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-400 text-xs font-mono">
                      {job.lastRun ? new Date(job.lastRun).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-2 text-slate-400 text-xs font-mono">
                      {job.nextRun ? new Date(job.nextRun).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Live Events */}
        <MonoPanel
          title="Live Events"
          lines={eventLines.length > 0 ? eventLines : ['Waiting for events...']}
          maxLines={100}
        />
      </div>
    </div>
  );
}
