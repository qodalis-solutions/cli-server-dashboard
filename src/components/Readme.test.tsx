// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Readme } from './Readme';

describe('Readme', () => {
  afterEach(cleanup);

  it('renders markdown: headings, lists, code and tables', () => {
    render(<Readme text={'# Weather\n\n- one\n- two\n\n```bash\npip install x\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |'} />);
    expect(screen.getByRole('heading', { name: 'Weather' })).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('pip install x').closest('pre')).toBeTruthy();
    expect(screen.getByRole('table')).toBeTruthy();
  });

  it('skips raw HTML', () => {
    const { container } = render(<Readme text={'before <script>alert(1)</script><img src=x onerror="alert(1)"> after'} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('opens http(s) links in a new tab and drops other targets', () => {
    render(<Readme text={'[docs](https://example.com) [local](./docs/x.md) [js](javascript:alert(1))'} />);
    const docs = screen.getByRole('link', { name: 'docs' });
    expect(docs.getAttribute('target')).toBe('_blank');
    expect(docs.getAttribute('rel')).toContain('noopener');
    expect(screen.queryByRole('link', { name: 'local' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'js' })).toBeNull();
    expect(screen.getByText('local')).toBeTruthy();
  });

  it('shows images as links, never loading them', () => {
    const { container } = render(<Readme text={'![build status](https://img.shields.io/x.svg)'} />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('link', { name: 'build status' }).getAttribute('href')).toBe('https://img.shields.io/x.svg');
  });

  it('shows other formats as text', () => {
    const { container } = render(<Readme text={'Title\n=====\n\n*not emphasis*'} format="rst" />);
    expect(container.querySelector('pre')?.textContent).toBe('Title\n=====\n\n*not emphasis*');
    expect(container.querySelector('em')).toBeNull();
  });
});
