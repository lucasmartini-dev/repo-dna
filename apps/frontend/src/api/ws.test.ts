import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { connectAnalysisWs } from './ws';

describe('connectAnalysisWs', () => {
  let mockWs: {
    onopen: (() => void) | null;
    onmessage: ((e: { data: string }) => void) | null;
    onclose: ((e?: { code: number; reason: string }) => void) | null;
    close: () => void;
    send: (data: string) => void;
    readyState: number;
  };
  let instances: (typeof mockWs)[] = [];

  beforeEach(() => {
    instances = [];
    mockWs = {
      onopen: null,
      onmessage: null,
      onclose: null,
      close: vi.fn(),
      send: vi.fn(),
      readyState: 0,
    };
    global.WebSocket = vi.fn((url: string) => {
      const instance = { ...mockWs, url };
      instances.push(instance);
      return instance;
    }) as unknown as typeof WebSocket;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('connects to the websocket URL with session and analysis IDs', () => {
    connectAnalysisWs('analysis-1', 'session-1', {
      onState: vi.fn(),
      onProviderUpdate: vi.fn(),
      onFinal: vi.fn(),
      shouldReconnect: () => false,
    });
    expect(WebSocket).toHaveBeenCalledWith(expect.stringContaining('/ws?sessionId=session-1&analysisId=analysis-1'));
  });

  it('dispatches state events to onState', () => {
    const onState = vi.fn();
    connectAnalysisWs('analysis-1', 'session-1', {
      onState,
      onProviderUpdate: vi.fn(),
      onFinal: vi.fn(),
      shouldReconnect: () => false,
    });
    instances[0].onmessage?.({ data: JSON.stringify({ type: 'state', analysisId: 'analysis-1' }) });
    expect(onState).toHaveBeenCalledWith({ type: 'state', analysisId: 'analysis-1' });
  });

  it('dispatches provider-update events to onProviderUpdate', () => {
    const onProviderUpdate = vi.fn();
    connectAnalysisWs('analysis-1', 'session-1', {
      onState: vi.fn(),
      onProviderUpdate,
      onFinal: vi.fn(),
      shouldReconnect: () => false,
    });
    const event = {
      type: 'provider-update',
      analysisId: 'analysis-1',
      provider: 'gemini',
      status: 'running',
      progress: 50,
      lastUpdated: '2026-01-01T00:00:00.000Z',
    };
    instances[0].onmessage?.({ data: JSON.stringify(event) });
    expect(onProviderUpdate).toHaveBeenCalledWith(event);
  });

  it('dispatches final events and closes the websocket', () => {
    const onFinal = vi.fn();
    connectAnalysisWs('analysis-1', 'session-1', {
      onState: vi.fn(),
      onProviderUpdate: vi.fn(),
      onFinal,
      shouldReconnect: () => false,
    });
    const event = { type: 'final', status: 'succeeded' };
    instances[0].onmessage?.({ data: JSON.stringify(event) });
    expect(onFinal).toHaveBeenCalledWith(event);
    expect(instances[0].close).toHaveBeenCalled();
  });

  it('reconnects when shouldReconnect returns true', () => {
    connectAnalysisWs('analysis-1', 'session-1', {
      onState: vi.fn(),
      onProviderUpdate: vi.fn(),
      onFinal: vi.fn(),
      shouldReconnect: () => true,
    });
    instances[0].onclose?.({ code: 1000, reason: 'test' });
    expect(instances).toHaveLength(1);
    vi.advanceTimersByTime(500);
    expect(instances).toHaveLength(2);
  });

  it('does not reconnect after close is called', () => {
    const close = connectAnalysisWs('analysis-1', 'session-1', {
      onState: vi.fn(),
      onProviderUpdate: vi.fn(),
      onFinal: vi.fn(),
      shouldReconnect: () => true,
    });
    close();
    instances[0].onclose?.({ code: 1000, reason: 'test' });
    vi.advanceTimersByTime(500);
    expect(instances).toHaveLength(1);
  });
});
