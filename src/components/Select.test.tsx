// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { MultiSelect, Select, type SelectOption } from './Select';

afterEach(cleanup);

const FRUITS: SelectOption[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry', disabled: true },
  { value: 'date', label: 'Date' },
  { value: 'blueberry', label: 'Blueberry' },
];

function Controlled({ initial = null as string | null, onChange = vi.fn(), clearable = false, options = FRUITS, searchable = undefined as boolean | undefined }) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <Select
      label="Fruit"
      placeholder="Pick a fruit"
      options={options}
      value={value}
      searchable={searchable}
      onChange={v => { setValue(v); onChange(v); }}
      onClear={clearable ? () => setValue(null) : undefined}
    />
  );
}

const combobox = () => screen.getByRole('combobox', { name: 'Fruit' });
const activeOption = () => {
  const id = combobox().getAttribute('aria-activedescendant');
  return id ? document.getElementById(id) : null;
};

describe('Select', () => {
  it('shows the placeholder, opens a listbox and picks an option with the arrows and Enter', () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    expect(combobox().textContent).toContain('Pick a fruit');
    expect(combobox().getAttribute('aria-expanded')).toBe('false');

    fireEvent.keyDown(combobox(), { key: 'ArrowDown' });
    expect(combobox().getAttribute('aria-expanded')).toBe('true');
    const listbox = screen.getByRole('listbox', { name: 'Fruit' });
    expect(combobox().getAttribute('aria-controls')).toBe(listbox.id);
    expect(activeOption()?.textContent).toBe('Apple');

    fireEvent.keyDown(combobox(), { key: 'ArrowDown' });
    expect(activeOption()?.textContent).toBe('Banana');
    // The disabled Cherry is skipped
    fireEvent.keyDown(combobox(), { key: 'ArrowDown' });
    expect(activeOption()?.textContent).toBe('Date');
    fireEvent.keyDown(combobox(), { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('date');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(combobox().textContent).toContain('Date');
    expect(document.activeElement).toBe(combobox());
  });

  it('marks the selected option, jumps with Home/End and type-ahead, and closes on Escape without choosing', () => {
    const onChange = vi.fn();
    render(<Controlled initial="banana" onChange={onChange} />);
    fireEvent.click(combobox());
    expect(screen.getByRole('option', { name: 'Banana' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('option', { name: 'Cherry' }).getAttribute('aria-disabled')).toBe('true');
    expect(activeOption()?.textContent).toBe('Banana');

    fireEvent.keyDown(combobox(), { key: 'End' });
    expect(activeOption()?.textContent).toBe('Blueberry');
    fireEvent.keyDown(combobox(), { key: 'Home' });
    expect(activeOption()?.textContent).toBe('Apple');
    fireEvent.keyDown(combobox(), { key: 'd' });
    expect(activeOption()?.textContent).toBe('Date');

    const escape = fireEvent.keyDown(combobox(), { key: 'Escape' });
    expect(escape).toBe(false); // handled: a dialog around it stays open
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('picks by typing while closed, like a native select', () => {
    const onChange = vi.fn();
    render(<Controlled initial="apple" onChange={onChange} />);
    fireEvent.keyDown(combobox(), { key: 'b' });
    expect(onChange).toHaveBeenLastCalledWith('banana');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('picks with a click, ignores disabled options and closes on a press outside', () => {
    const onChange = vi.fn();
    render(<><Controlled onChange={onChange} /><button>Elsewhere</button></>);
    fireEvent.click(combobox());
    fireEvent.click(screen.getByRole('option', { name: 'Cherry' }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('option', { name: 'Apple' }));
    expect(onChange).toHaveBeenCalledWith('apple');

    fireEvent.click(combobox());
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('filters long lists with a search field that drives the list', () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} searchable />);
    fireEvent.click(combobox());
    const search = screen.getByRole('combobox', { name: 'Fruit: Search…' });
    expect(document.activeElement).toBe(search);
    fireEvent.change(search, { target: { value: 'b' } });
    const options = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(options.map(o => o.textContent)).toEqual(['Banana', 'Blueberry']);
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('blueberry');

    fireEvent.click(combobox());
    fireEvent.change(screen.getByRole('combobox', { name: 'Fruit: Search…' }), { target: { value: 'zzz' } });
    expect(screen.getByText('No matches')).toBeTruthy();
  });

  it('turns on the search by itself for more than 10 options', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ value: `v${i}`, label: `Item ${i}` }));
    render(<Controlled options={many} />);
    fireEvent.click(combobox());
    expect(screen.getByRole('combobox', { name: 'Fruit: Search…' })).toBeTruthy();
  });

  it('clears the value with the clear button when clearable', () => {
    render(<Controlled initial="date" clearable />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(combobox().textContent).toContain('Pick a fruit');
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
  });

  it('does not open when disabled', () => {
    render(<Select label="Fruit" options={FRUITS} value={null} onChange={vi.fn()} disabled />);
    fireEvent.click(combobox());
    fireEvent.keyDown(combobox(), { key: 'ArrowDown' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

describe('MultiSelect', () => {
  function Multi({ onChange = vi.fn() }) {
    const [value, setValue] = useState<string[]>(['apple']);
    return <MultiSelect label="Fruit" placeholder="Any" options={FRUITS} value={value} clearable onChange={v => { setValue(v); onChange(v); }} />;
  }

  it('toggles options with Enter and Space, stays open and shows the selection as chips', () => {
    const onChange = vi.fn();
    render(<Multi onChange={onChange} />);
    expect(combobox().textContent).toContain('Apple');
    fireEvent.keyDown(combobox(), { key: 'ArrowDown' });
    expect(screen.getByRole('listbox').getAttribute('aria-multiselectable')).toBe('true');

    fireEvent.keyDown(combobox(), { key: 'ArrowDown' });
    fireEvent.keyDown(combobox(), { key: ' ' });
    expect(onChange).toHaveBeenLastCalledWith(['apple', 'banana']);
    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Banana' }).getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(combobox(), { key: 'End' });
    fireEvent.keyDown(combobox(), { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith(['apple', 'banana', 'blueberry']);
    // Two chips, then the rest counted
    expect(combobox().textContent).toContain('+1');

    fireEvent.keyDown(combobox(), { key: 'Home' });
    fireEvent.keyDown(combobox(), { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith(['banana', 'blueberry']);

    fireEvent.keyDown(combobox(), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(combobox().textContent).toContain('Any');
  });
});
