// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { completionStatus, currentCompletions, startCompletion } from '@codemirror/autocomplete';
import SqlEditor from './SqlEditor';
import { toCompletionSchema } from './sqlDialect';

// jsdom has no layout: CodeMirror measures text ranges
if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}

afterEach(cleanup);

function mount(props: Partial<Parameters<typeof SqlEditor>[0]> = {}) {
  const onChange = vi.fn();
  const onRun = vi.fn();
  const utils = render(
    <SqlEditor value="SELECT 1" onChange={onChange} onRun={onRun} dialect="postgresql" ariaLabel="Query" {...props} />,
  );
  const content = utils.container.querySelector('.cm-content') as HTMLElement;
  const view = EditorView.findFromDOM(utils.container.querySelector('.cm-editor') as HTMLElement)!;
  return { ...utils, onChange, onRun, content, view };
}

describe('SqlEditor', () => {
  it('shows the query with line numbers and an accessible label', () => {
    const { content, container } = mount();
    expect(content.textContent).toBe('SELECT 1');
    expect(content.getAttribute('aria-label')).toBe('Query');
    expect(container.querySelector('.cm-lineNumbers')).toBeTruthy();
  });

  it('reports edits and follows a value set from outside', () => {
    const { view, onChange, rerender, content, onRun } = mount();
    view.dispatch({ changes: { from: view.state.doc.length, insert: ' + 1' } });
    expect(onChange).toHaveBeenCalledWith('SELECT 1 + 1');

    rerender(<SqlEditor value="SELECT * FROM users" onChange={onChange} onRun={onRun} dialect="postgresql" ariaLabel="Query" />);
    expect(content.textContent).toBe('SELECT * FROM users');
  });

  it('runs on Ctrl+Enter', () => {
    const { content, onRun } = mount();
    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it('completes table names from the schema, quoted for the dialect', async () => {
    const schema = toCompletionSchema({ source: 'db', tables: [{ name: 'Users', type: 'table', columns: [] }] }, 'postgresql');
    const { view } = mount({ value: 'SELECT * FROM Us', schema });
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    startCompletion(view);
    await vi.waitFor(() => expect(completionStatus(view.state)).toBe('active'));
    const users = currentCompletions(view.state).find(c => c.label === 'Users');
    expect(users?.apply).toBe('"Users"');
  });

  it.each([['mssql', '[Users]'], ['mysql', '`Users`'], ['sqlite', '"Users"']] as const)(
    'completes a mixed-case table quoted the %s way', async (dialect, expected) => {
      const schema = toCompletionSchema({ source: 'db', tables: [{ name: 'Users', type: 'table', columns: [] }] }, dialect);
      const { view } = mount({ value: 'SELECT * FROM Us', schema, dialect });
      view.dispatch({ selection: { anchor: view.state.doc.length } });
      startCompletion(view);
      await vi.waitFor(() => expect(completionStatus(view.state)).toBe('active'));
      expect(currentCompletions(view.state).find(c => c.label === 'Users')?.apply).toBe(expected);
    },
  );
});
