import { describe, expect, it } from 'vitest';
import { wsClientsOf } from './events';

const client = { id: 'c1', connectedAt: '2026-11-06T18:34:19.571Z', remoteAddress: '::1', type: 'events' };

describe('wsClientsOf', () => {
  it('reads the list (Node, Python) and the .NET object alike', () => {
    expect(wsClientsOf([client])).toEqual([client]);
    expect(wsClientsOf({ clients: [client], total: 1 } as never)).toEqual([client]);
  });

  it('reads anything else as no clients', () => {
    expect(wsClientsOf(null)).toEqual([]);
    expect(wsClientsOf({} as never)).toEqual([]);
  });
});
