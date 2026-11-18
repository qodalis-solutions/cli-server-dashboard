// Screenshots of the dashboard for the README, written to docs/screenshots/ as WebP.
//
//   npm run build            # the server serves this checkout's dist (sibling copy), so build first
//   npm run screenshots
//
// Environment:
//   QCLI_URL        the server (default http://localhost:8046, the .NET demo)
//   QCLI_ADMIN_URL  the dashboard (default <QCLI_URL>/qcli/admin/; e.g. http://localhost:5173/qcli/admin/ for `npm run dev`)
//   QCLI_USER / QCLI_PASSWORD   sign-in (default root / root)
//   ONLY            comma-separated shot names to take (default: all)
//
// Desktop shots are 1440x900 at 2x, phone shots 390x844 at 2x. The light and dark heroes replace the server's color
// mode through theme.json, so they work with any server. An empty filesystem (the demo's in-memory store) gets a few
// sample files first.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const server = (process.env.QCLI_URL ?? 'http://localhost:8046').replace(/\/$/, '');
const admin = process.env.QCLI_ADMIN_URL ?? `${server}/qcli/admin/`;
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const out = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const SAMPLE_QUERY = "SELECT 'EUR' AS currency, 1.0000 AS rate, 'ECB' AS source UNION ALL SELECT 'USD', 1.0532, 'Fed' "
  + "UNION ALL SELECT 'RON', 4.9741, 'BNR' UNION ALL SELECT 'MDL', 19.2100, 'BNM' UNION ALL SELECT 'UAH', 43.6120, 'NBU'";
/** WebP quality: keeps every shot under ~400 KB. */
const QUALITY = 0.8;

const api = async (path, init = {}) => {
  const res = await fetch(`${server}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } });
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${res.status}`);
  return res.headers.get('content-type')?.includes('json') ? res.json() : null;
};

const login = await fetch(`${server}/api/v1/qcli/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: process.env.QCLI_USER ?? 'root', password: process.env.QCLI_PASSWORD ?? 'root' }),
});
if (!login.ok) throw new Error(`Sign-in failed: ${login.status} ${await login.text()}`);
const { token } = await login.json();

const jobs = await api('/api/v1/qcli/jobs').catch(() => []);
// A job with retention and some failed runs makes the richest job page
const detailJob = jobs.find(j => j.historyRetention && j.name.startsWith('fetch-')) ?? jobs.find(j => j.historyRetention) ?? jobs[0];
await seedFilesystem();

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const encoder = await browser.newPage();
const written = [];

try {
  await shoot('overview-dark', DESKTOP, 'dark', async p => {
    await p.goto(`${admin}`);
  });
  await shoot('overview-light', DESKTOP, 'light', async p => {
    await p.goto(`${admin}`);
  });
  await shoot('jobs', DESKTOP, 'dark', async p => {
    await p.goto(`${admin}jobs`);
  });
  await shoot('jobs-run-tooltip', DESKTOP, 'dark', async p => {
    await p.goto(`${admin}jobs?q=fetch-`);
    await settle(p);
    const bars = p.locator('[data-run-bar]');
    const count = await bars.count();
    let target = bars.first();
    for (let i = 0; i < count; i++) {
      if ((await bars.nth(i).getAttribute('data-outcome')) === 'failed') { target = bars.nth(i); break; }
    }
    await target.hover();
    await p.waitForTimeout(1500);
  });
  await shoot('recent-runs', DESKTOP, 'dark', async p => {
    await p.goto(`${admin}jobs?tab=runs`);
  });
  if (detailJob) {
    await shoot('job-detail', DESKTOP, 'dark', async p => {
      await p.goto(`${admin}jobs/${encodeURIComponent(detailJob.id)}`);
    });
    await shoot('job-history', DESKTOP, 'dark', async p => {
      await p.goto(`${admin}jobs/${encodeURIComponent(detailJob.id)}`);
      await settle(p);
      const more = p.getByRole('button', { name: 'More actions' }).first();
      await more.scrollIntoViewIfNeeded();
      await p.mouse.wheel(0, 250);
      await p.waitForTimeout(300);
      await more.click();
      await p.waitForTimeout(400);
    });
  }
  await shoot('plugins', DESKTOP, 'dark', async p => {
    await p.goto(`${admin}plugins`);
  });
  await shoot('logs', DESKTOP, 'dark', async p => {
    // Info entries only: an error's stack trace would show the machine's paths
    await p.goto(`${admin}logs?level=INFO`);
  });
  await shoot('audit', DESKTOP, 'dark', async p => {
    await p.goto(`${admin}audit`);
  });
  await shoot('events', DESKTOP, 'dark', async p => {
    await p.goto(`${admin}events`);
    // The demo's jobs send events every few seconds
    await p.waitForTimeout(12000);
  });
  await shoot('data-explorer', DESKTOP, 'dark', async p => {
    await p.goto(`${admin}data-explorer`);
    await settle(p);
    // A query that returns rows on any SQL source (the demo database has no tables)
    const editor = p.locator('.cm-content').first();
    if (await editor.count()) {
      await editor.click();
      await p.keyboard.press('ControlOrMeta+a');
      await p.keyboard.type(SAMPLE_QUERY);
      await p.getByRole('button', { name: 'Run', exact: true }).click();
      await p.waitForTimeout(1200);
    }
  });
  await shoot('terminal', DESKTOP, 'dark', async p => {
    await p.goto(`${admin}terminal`);
    await p.waitForTimeout(3000);
    await p.locator('.xterm').first().click();
    await p.keyboard.type('help', { delay: 30 });
    await p.keyboard.press('Enter');
    await p.waitForTimeout(2500);
  });
  await shoot('filesystem', DESKTOP, 'dark', async p => {
    await p.goto(`${admin}filesystem`);
  });
  // Two short-lived tokens, revoked right after the shot
  const tokens = [];
  const tokenShot = !only || only.has('tokens');
  for (const [name, permissions] of tokenShot ? [['ci-deploy', ['commands:execute']], ['grafana-export', ['jobs:read', 'logs:read']]] : []) {
    const created = await api('/api/v1/qcli/tokens', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, expiresInDays: 30, permissions }),
    }).catch(() => null);
    if (created) tokens.push(created.apiToken.id);
  }
  try {
    await shoot('tokens', DESKTOP, 'dark', async p => {
      await p.goto(`${admin}tokens`);
    });
  } finally {
    for (const id of tokens) await api(`/api/v1/qcli/tokens/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
  }
  await shoot('command-palette', DESKTOP, 'dark', async p => {
    await p.goto(`${admin}`);
    await settle(p);
    await p.keyboard.press('Control+k');
    await p.keyboard.type('fetch', { delay: 40 });
    await p.waitForTimeout(600);
  });
  await shoot('mobile-drawer', PHONE, 'dark', async p => {
    await p.goto(`${admin}jobs`);
    await settle(p);
    await p.getByRole('button', { name: 'Open menu' }).click();
    await p.waitForTimeout(500);
  });
  await shoot('mobile-jobs', PHONE, 'dark', async p => {
    await p.goto(`${admin}jobs`);
  });
} finally {
  await browser.close();
}

for (const { name, size } of written) console.log(`${name.padEnd(28)} ${(size / 1024).toFixed(0).padStart(4)} KB`);

/** Opens a page in a fresh context (signed in, English, the given color mode), runs `act` and saves the view. */
async function shoot(name, viewport, mode, act) {
  if (only && !only.has(name)) return;
  const phone = viewport === PHONE;
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: phone, isMobile: phone, reducedMotion: 'reduce' });
  await context.addInitScript(t => {
    localStorage.setItem('qcli_admin_token', t);
    localStorage.setItem('qcli_admin_locale', 'en');
  }, token);
  // The server's scheme with its mode replaced, so both heroes come from one server
  await context.route('**/qcli/admin/theme.json', async route => {
    const response = await route.fetch().catch(() => null);
    const theme = response?.ok() ? await response.json().catch(() => ({})) : {};
    await route.fulfill({ json: { ...theme, mode } });
  });
  const page = await context.newPage();
  try {
    await act(page);
    await settle(page);
    const png = await page.screenshot();
    const webp = await toWebp(png);
    await writeFile(`${out}${name}.webp`, webp);
    written.push({ name: `${name}.webp`, size: webp.length });
  } finally {
    await context.close();
  }
}

/** Waits for the page's requests and the charts' first paint. */
async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(900);
}

/** PNG → WebP with the browser's own encoder (no image tooling needed). */
async function toWebp(png) {
  const base64 = await encoder.evaluate(async ({ data, quality }) => {
    const blob = await (await fetch(`data:image/png;base64,${data}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    const webp = await canvas.convertToBlob({ type: 'image/webp', quality });
    const bytes = new Uint8Array(await webp.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }, { data: png.toString('base64'), quality: QUALITY });
  return Buffer.from(base64, 'base64');
}

/** A few sample files when the filesystem has hardly any (the demo's in-memory store), so the page shows something. */
async function seedFilesystem() {
  const root = await api('/api/qcli/fs/ls?path=/').catch(() => null);
  if (!root || (root.entries ?? []).filter(e => e.type === 'file').length > 1) return;
  for (const dir of ['/reports', '/exports', '/config']) {
    await api('/api/qcli/fs/mkdir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: dir }) })
      .catch(() => {}); // already there
  }
  const files = {
    '/README.md': '# Shared files\n\nReports and exports of the rate fetchers.\n',
    '/rates-2026-11-18.csv': 'currency,rate\nEUR,1.0000\nUSD,1.0532\nRON,4.9741\nMDL,19.2100\n',
    '/retention.json': JSON.stringify({ maxAge: '30d', maxRunsPerJob: 500, failedMaxRunsPerJob: 50 }, null, 2),
    '/reports/fetch-failures.csv': 'job,failed\nfetch-ro-bank1,12\nfetch-md-bank1,3\n',
  };
  for (const [path, content] of Object.entries(files)) {
    const form = new FormData();
    form.append('file', new Blob([content]), path.split('/').pop());
    // The servers take the file's full path
    form.append('path', path);
    await api('/api/qcli/fs/upload', { method: 'POST', body: form });
  }
}
