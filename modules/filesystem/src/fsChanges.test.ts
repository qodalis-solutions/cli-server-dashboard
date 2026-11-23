import { describe, expect, it } from 'vitest';
import { fsChangeAffects, normalizeFsPath, parentFolder } from './fsChanges';

describe('fs paths', () => {
  it('normalizes separators and trailing slashes', () => {
    expect(normalizeFsPath('/a/b/')).toBe('/a/b');
    expect(normalizeFsPath('\\a\\b')).toBe('/a/b');
    expect(normalizeFsPath('//a//b')).toBe('/a/b');
    expect(normalizeFsPath('/')).toBe('/');
    expect(normalizeFsPath('')).toBe('/');
  });

  it('finds the parent folder', () => {
    expect(parentFolder('/a/b.txt')).toBe('/a');
    expect(parentFolder('/b.txt')).toBe('/');
    expect(parentFolder('/a/b/')).toBe('/a');
  });
});

describe('fsChangeAffects', () => {
  const change = (fields: Record<string, unknown>) => ({ type: 'fs:changed', ...fields });

  it('is true for entries of the folder', () => {
    expect(fsChangeAffects('/data', change({ action: 'upload', path: '/data/a.csv' }))).toBe(true);
    expect(fsChangeAffects('/', change({ action: 'mkdir', path: '/logs' }))).toBe(true);
    expect(fsChangeAffects('/data/', change({ action: 'delete', path: '/data/old' }))).toBe(true);
  });

  it('is true when a move or copy lands in the folder', () => {
    expect(fsChangeAffects('/b', change({ action: 'move', path: '/a/x.txt', newPath: '/b/x.txt' }))).toBe(true);
    expect(fsChangeAffects('/a', change({ action: 'copy', path: '/a/x.txt', newPath: '/b/x.txt' }))).toBe(true);
  });

  it('is true when the folder or one above it is deleted', () => {
    expect(fsChangeAffects('/data/2026', change({ action: 'delete', path: '/data/2026' }))).toBe(true);
    expect(fsChangeAffects('/data/2026', change({ action: 'delete', path: '/data' }))).toBe(true);
  });

  it('is false for other folders', () => {
    expect(fsChangeAffects('/data', change({ action: 'upload', path: '/data/2026/a.csv' }))).toBe(false);
    expect(fsChangeAffects('/data', change({ action: 'upload', path: '/database/a.csv' }))).toBe(false);
    expect(fsChangeAffects('/data', change({ action: 'write' }))).toBe(false);
  });
});
