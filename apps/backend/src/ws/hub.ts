import type { WebSocket } from 'ws';
import type { AnalysisEvent } from '../analysis/types';

class WsHub {
  private subscribers = new Map<string, Set<WebSocket>>();
  private runningChecker: ((analysisId: string) => boolean) | null = null;

  setRunningChecker(fn: (analysisId: string) => boolean): void {
    this.runningChecker = fn;
  }

  subscribe(analysisId: string, ws: WebSocket): () => void {
    const set = this.subscribers.get(analysisId) ?? new Set<WebSocket>();
    set.add(ws);
    this.subscribers.set(analysisId, set);
    ws.on?.('close', () => this.unsubscribe(analysisId, ws));
    return () => this.unsubscribe(analysisId, ws);
  }

  private unsubscribe(analysisId: string, ws: WebSocket): void {
    const set = this.subscribers.get(analysisId);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) this.subscribers.delete(analysisId);
  }

  publish(analysisId: string, event: AnalysisEvent): void {
    const set = this.subscribers.get(analysisId);
    if (!set) return;
    const payload = JSON.stringify(event);
    for (const ws of set) {
      if (ws.readyState === undefined || ws.readyState === 1) ws.send(payload);
    }
  }

  canSubscribe(analysisId: string): boolean {
    return this.runningChecker ? this.runningChecker(analysisId) : true;
  }
}

const globalKey = Symbol.for('repo-dna.wsHub');
const g = globalThis as Record<symbol, WsHub>;
export const wsHub: WsHub = g[globalKey] ?? (g[globalKey] = new WsHub());
