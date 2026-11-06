// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '../../i18n';
import RunDetailsModal from './RunDetailsModal';
import type { RunSummary } from './runDetails';

const getJobExecution = vi.fn();
vi.mock('../../api/jobs', () => ({ getJobExecution: (...args: unknown[]) => getJobExecution(...args) }));

const run: RunSummary = {
  id: 'e1', jobId: 'sync', jobName: 'Sync', status: 'failed', startedAt: '2026-11-06T10:00:00Z', completedAt: null,
  duration: 1200, error: 'Connection refused (sho…', retryAttempt: 1,
};

function show(onClose = () => {}) {
  return render(
    <I18nProvider>
      <RunDetailsModal run={run} onClose={onClose} statusBadge={s => <span>{s}</span>} triggerLabel={x => x} />
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  getJobExecution.mockReset();
  vi.unstubAllGlobals();
});

describe('RunDetailsModal', () => {
  it('shows the full error from the run, its attempt and logs, and copies the error', async () => {
    const full = 'Connection refused (shortened in the list)\n  at connect (db.ts:12)';
    getJobExecution.mockResolvedValue({
      ...run, completedAt: '2026-11-06T10:00:01Z', triggerType: 'schedule', error: full,
      logs: [{ timestamp: '2026-11-06T10:00:00Z', level: 'ERROR', message: 'cannot connect' }],
    });
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    show();
    expect(screen.getByText('Connection refused (sho…')).toBeTruthy();
    await act(async () => {});

    expect(getJobExecution).toHaveBeenCalledWith('sync', 'e1');
    expect(screen.getByText((_, el) => el?.tagName === 'PRE' && el.textContent === full)).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy(); // attempt: retryAttempt 1 is the second run
    expect(screen.getByText(/cannot connect/)).toBeTruthy();

    await act(async () => { fireEvent.click(screen.getByText('Copy error')); });
    expect(writeText).toHaveBeenCalledWith(full);
    expect(screen.getByText('Copied')).toBeTruthy();
  });

  it('keeps the listed error when the run cannot be loaded', async () => {
    getJobExecution.mockRejectedValue(new Error('404'));
    show();
    await act(async () => {});
    expect(screen.getByText('Connection refused (sho…')).toBeTruthy();
    expect(screen.getByText(/Could not load the full run \(404\)/)).toBeTruthy();
  });

  it('closes on Escape', () => {
    getJobExecution.mockReturnValue(new Promise(() => {}));
    const onClose = vi.fn();
    show(onClose);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
