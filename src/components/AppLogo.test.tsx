// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import AppLogo from './AppLogo';
import { DEFAULT_ICON, applyBranding } from '../branding';

describe('AppLogo', () => {
  afterEach(() => {
    cleanup();
    applyBranding({});
  });

  it('shows the Qodalis Solutions logo by default', () => {
    const { container } = render(<AppLogo size={28} />);
    expect(container.querySelector('img')!.getAttribute('src')).toBe(DEFAULT_ICON);
  });

  it("shows the server's icon, and the default when it fails to load", () => {
    applyBranding({ icon: '/favicon.svg' });
    const { container } = render(<AppLogo size={28} />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('/favicon.svg');

    fireEvent.error(img);
    expect(container.querySelector('img')!.getAttribute('src')).toBe(DEFAULT_ICON);
  });
});
