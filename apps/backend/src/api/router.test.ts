import { wsHub } from '../ws/hub';
import type { WebSocket } from 'ws';
import { startAnalysisAsync } from './router';

jest.mock('../analysis/runner', () => ({
  runAnalysis: jest.fn(),
}));

const { runAnalysis } = jest.requireMock('../analysis/runner') as { runAnalysis: jest.Mock };

describe('startAnalysisAsync', () => {
  it('calls runAnalysis with a sink that publishes provider-update to hub', () => {
    runAnalysis.mockImplementation(
      (_id: string, _user: string, _models: Record<string, string>, sink: (e: unknown) => void) => {
        sink({
          type: 'provider-update',
          analysisId: 'a1',
          provider: 'gemini',
          status: 'running',
          progress: 50,
          lastUpdated: '2026-01-01T00:00:00.000Z',
        });
      }
    );
    const received: unknown[] = [];
    const ws = { readyState: 1, send: (m: string) => received.push(JSON.parse(m)) } as unknown as WebSocket;
    wsHub.subscribe('a1', ws);
    startAnalysisAsync('a1', 'test', { gemini: 'g1', groq: 'g2', openrouter: 'g3', nvcf: 'g4', opencode: 'g5' });
    expect(runAnalysis).toHaveBeenCalledWith('a1', 'test', expect.any(Object), expect.any(Function));
    expect(received).toHaveLength(1);
    expect((received[0] as { progress: number }).progress).toBe(50);
  });

  it('publishes final event to hub', () => {
    runAnalysis.mockImplementation(
      (_id: string, _user: string, _models: Record<string, string>, sink: (e: unknown) => void) => {
        sink({ type: 'final', analysisId: 'a2', status: 'succeeded' });
      }
    );
    const received: unknown[] = [];
    const ws = { readyState: 1, send: (m: string) => received.push(JSON.parse(m)) } as unknown as WebSocket;
    wsHub.subscribe('a2', ws);
    startAnalysisAsync('a2', 'test', {});
    expect(received).toHaveLength(1);
    expect((received[0] as { status: string }).status).toBe('succeeded');
  });

  it('passes models map through to runAnalysis', () => {
    runAnalysis.mockImplementation(() => {});
    const models = {
      gemini: 'gemini-2.0-flash',
      groq: 'llama-3.1-8b-instant',
      openrouter: 'm3',
      nvcf: 'm4',
      opencode: 'm5',
    };
    startAnalysisAsync('a3', 'user', models);
    expect(runAnalysis).toHaveBeenCalledWith('a3', 'user', models, expect.any(Function));
  });
});
