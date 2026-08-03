import { wsHub } from './hub';
import type { WebSocket } from 'ws';

describe('wsHub', () => {
  it('publishes only to subscribers of that analysis', () => {
    const receivedA: unknown[] = [];
    const receivedB: unknown[] = [];
    const fakeA = { send: (m: string) => receivedA.push(JSON.parse(m)) } as unknown as WebSocket;
    const fakeB = { send: (m: string) => receivedB.push(JSON.parse(m)) } as unknown as WebSocket;

    wsHub.subscribe('a1', fakeA);
    wsHub.subscribe('a2', fakeB);
    wsHub.publish('a1', { type: 'final', analysisId: 'a1', status: 'succeeded' });

    expect(receivedA).toHaveLength(1);
    expect(receivedB).toHaveLength(0);
  });

  it('stops publishing after unsubscribe', () => {
    const received: unknown[] = [];
    const fake = { send: (m: string) => received.push(JSON.parse(m)) } as unknown as WebSocket;
    const unsubscribe = wsHub.subscribe('a1', fake);
    unsubscribe();
    wsHub.publish('a1', { type: 'final', analysisId: 'a1', status: 'succeeded' });
    expect(received).toHaveLength(0);
  });

  it('uses running checker for canSubscribe', () => {
    wsHub.setRunningChecker((id) => id === 'running-analysis');
    expect(wsHub.canSubscribe('running-analysis')).toBe(true);
    expect(wsHub.canSubscribe('completed-analysis')).toBe(false);
  });

  it('skips sockets that are not open', () => {
    const received: unknown[] = [];
    const open = { readyState: 1, send: (m: string) => received.push(JSON.parse(m)) } as unknown as WebSocket;
    const closed = { readyState: 3, send: (m: string) => received.push(JSON.parse(m)) } as unknown as WebSocket;
    wsHub.subscribe('a1', open);
    wsHub.subscribe('a1', closed);
    wsHub.publish('a1', { type: 'final', analysisId: 'a1', status: 'succeeded' });
    expect(received).toHaveLength(1);
  });

  it('delivers provider-update events to multiple subscribers of same analysis', () => {
    const sub1: unknown[] = [];
    const sub2: unknown[] = [];
    const ws1 = { readyState: 1, send: (m: string) => sub1.push(JSON.parse(m)) } as unknown as WebSocket;
    const ws2 = { readyState: 1, send: (m: string) => sub2.push(JSON.parse(m)) } as unknown as WebSocket;
    wsHub.subscribe('a1', ws1);
    wsHub.subscribe('a1', ws2);
    wsHub.publish('a1', {
      type: 'provider-update',
      analysisId: 'a1',
      provider: 'gemini',
      status: 'running',
      progress: 50,
      lastUpdated: '2026-01-01T00:00:00.000Z',
    });
    expect(sub1).toHaveLength(1);
    expect(sub2).toHaveLength(1);
    expect((sub1[0] as { progress: number }).progress).toBe(50);
  });

  it('cleans up subscriber on ws close event', () => {
    const received: unknown[] = [];
    let closeHandler: (() => void) | null = null;
    const ws = {
      readyState: 1,
      send: (m: string) => received.push(JSON.parse(m)),
      on: (event: string, fn: () => void) => {
        if (event === 'close') closeHandler = fn;
      },
    } as unknown as WebSocket;
    wsHub.subscribe('a1', ws);
    closeHandler?.();
    wsHub.publish('a1', { type: 'final', analysisId: 'a1', status: 'succeeded' });
    expect(received).toHaveLength(0);
  });
});
