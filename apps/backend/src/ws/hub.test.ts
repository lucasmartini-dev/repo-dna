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
});
