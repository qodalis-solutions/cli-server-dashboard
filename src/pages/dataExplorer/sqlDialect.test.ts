import { describe, expect, it } from 'vitest';
import { detectSqlDialect, quoteIdentifier, toCompletionSchema } from './sqlDialect';
import { tableQuery } from './resultTable';
import type { DataExplorerSource } from '../../api/dataExplorer';

const source = (over: Partial<DataExplorerSource> & Record<string, unknown>): DataExplorerSource =>
  ({ name: 'db', description: '', language: 'sql', ...over }) as DataExplorerSource;

describe('detectSqlDialect', () => {
  it.each([
    [{ name: 'orders-pg' }, 'postgresql'],
    [{ description: 'PostgreSQL 16 replica' }, 'postgresql'],
    [{ name: 'shop_mysql' }, 'mysql'],
    [{ description: 'MariaDB' }, 'mysql'],
    [{ name: 'demo-sqlite' }, 'sqlite'],
    [{ name: 'erp', description: 'SQL Server warehouse' }, 'mssql'],
    [{ name: 'mssql-main' }, 'mssql'],
    [{ dialect: 'postgres', name: 'mysql-like-name' }, 'postgresql'],
    [{ templates: [{ name: 't', query: "SELECT name FROM sqlite_master WHERE type='table'" }] }, 'sqlite'],
    [{ templates: [{ name: 't', query: 'SELECT TOP 10 * FROM sys.tables' }] }, 'mssql'],
    [{ templates: [{ name: 't', query: 'SELECT * FROM pg_catalog.pg_tables' }] }, 'postgresql'],
    [{ templates: [{ name: 't', query: 'SHOW TABLES' }] }, 'mysql'],
    [{ name: 'warehouse' }, 'standard'],
  ] as const)('%o → %s', (over, expected) => {
    expect(detectSqlDialect(source(over))).toBe(expected);
  });
});

describe('quoteIdentifier', () => {
  it('quotes mixed-case names where the dialect folds case', () => {
    expect(quoteIdentifier('Users', 'postgresql')).toBe('"Users"');
    expect(quoteIdentifier('users', 'postgresql')).toBe('users');
    expect(quoteIdentifier('Users', 'standard')).toBe('"Users"');
    expect(quoteIdentifier('Users', 'sqlite')).toBe('Users');
    expect(quoteIdentifier('Users', 'mysql')).toBe('Users');
    expect(quoteIdentifier('Users', 'mssql')).toBe('Users');
  });

  it('quotes names that are not plain identifiers, or reserved, in each dialect’s style', () => {
    expect(quoteIdentifier('order items', 'mysql')).toBe('`order items`');
    expect(quoteIdentifier('user', 'mssql')).toBe('[user]');
    expect(quoteIdentifier('a"b', 'sqlite')).toBe('"a""b"');
    expect(quoteIdentifier('user', 'postgresql')).toBe('"user"');
  });
});

describe('toCompletionSchema', () => {
  const schema = {
    source: 'db',
    tables: [
      { name: 'Users', type: 'table', columns: [{ name: 'Id', type: 'int', nullable: false, primaryKey: true }, { name: 'email', type: 'text', nullable: true, primaryKey: false }] },
      { name: 'sales.Orders', type: 'view', columns: [] },
    ],
  };

  it('completes tables and columns, inserting them quoted for the dialect', () => {
    const ns = toCompletionSchema(schema, 'postgresql') as Record<string, { self: { apply: string }; children: unknown }>;
    expect(ns.Users.self.apply).toBe('"Users"');
    expect(ns.Users.children).toEqual([
      expect.objectContaining({ label: 'Id', apply: '"Id"', type: 'property' }),
      expect.objectContaining({ label: 'email', apply: 'email', detail: 'text?' }),
    ]);
    const sales = ns.sales as unknown as { children: Record<string, { self: { apply: string } }> };
    expect(sales.children.Orders.self.apply).toBe('"Orders"');
  });

  it('is empty without a schema', () => {
    expect(toCompletionSchema(null, 'sqlite')).toEqual({});
  });
});

describe('tableQuery by dialect', () => {
  it('quotes and limits as the dialect needs', () => {
    expect(tableQuery('sql', 'Users', 'postgresql')).toBe('SELECT * FROM "Users" LIMIT 100;');
    expect(tableQuery('sql', 'Users', 'mssql')).toBe('SELECT TOP 100 * FROM Users;');
    expect(tableQuery('sql', 'order items', 'mysql')).toBe('SELECT * FROM `order items` LIMIT 100;');
    expect(tableQuery('sql', 'users')).toBe('SELECT * FROM users LIMIT 100;');
  });
});
