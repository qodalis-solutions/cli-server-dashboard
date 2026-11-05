// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { DEFAULT_ICON, applyBranding, getBranding, isSafeIconUrl, resolveBranding } from './branding';

describe('resolveBranding', () => {
  it('is empty without branding', () => {
    expect(resolveBranding(null)).toEqual({});
    expect(resolveBranding({ mode: 'dark' })).toEqual({});
  });

  it('reads the name, icon and terminal name', () => {
    expect(
      resolveBranding({ branding: { name: ' RateBell ', icon: '/favicon.svg', cli: { name: 'RateBell CLI' } } }),
    ).toEqual({ name: 'RateBell', icon: '/favicon.svg', cli: { name: 'RateBell CLI' } });
  });

  it('drops bad values instead of failing', () => {
    expect(
      resolveBranding({ branding: { name: 'a'.repeat(81), icon: 'javascript:alert(1)', cli: { name: 42 } } }),
    ).toEqual({});
  });
});

describe('isSafeIconUrl', () => {
  it.each(['/favicon.svg', 'https://ratebell.app/favicon.svg', 'data:image/png;base64,iVBORw0KGgo='])(
    'accepts %s',
    icon => expect(isSafeIconUrl(icon)).toBe(true),
  );

  it.each(['//evil.example/x.svg', 'javascript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', 'favicon.svg', 42])(
    'rejects %s',
    icon => expect(isSafeIconUrl(icon)).toBe(false),
  );
});

describe('applyBranding', () => {
  it("sets the tab's title and icon, and keeps the branding for the pages", () => {
    document.head.innerHTML = '<link rel="icon" type="image/svg+xml" href="/qodalis-icon.svg" />';
    document.title = 'Qodalis Cli Admin';

    applyBranding({ name: 'RateBell', icon: '/favicon.svg' });

    expect(document.title).toBe('RateBell');
    expect(document.querySelector<HTMLLinkElement>('link[rel="icon"]')!.getAttribute('href')).toBe('/favicon.svg');
    expect(getBranding().name).toBe('RateBell');
  });

  it('keeps the Qodalis Solutions logo without a custom icon', () => {
    document.head.innerHTML = '<link rel="icon" href="x" />';
    document.title = 'Qodalis Cli Admin';

    applyBranding({});

    expect(document.title).toBe('Qodalis Cli Admin');
    expect(document.querySelector<HTMLLinkElement>('link[rel="icon"]')!.getAttribute('href')).toBe(DEFAULT_ICON);
  });
});
