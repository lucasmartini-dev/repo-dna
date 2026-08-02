import { config } from 'dotenv';
import { resolve } from 'path';
import next from 'next';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { wsHub } from './src/ws/hub';
import { getAnalysis } from './src/db/analyses';
import { getProviderRows } from './src/db/providers';
import { ScorecardSchema } from '@repo/shared';

config({ path: resolve(__dirname, '..', '..', '.env') });

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res);
  });

  wsHub.setRunningChecker((analysisId) => getAnalysis(analysisId)?.status === 'running');

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '', 'http://localhost');
    if (url.pathname !== '/ws') return;
    const sessionId = url.searchParams.get('sessionId');
    if (!sessionId) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const analysisId = url.searchParams.get('analysisId');
      const analysis = analysisId ? getAnalysis(analysisId) : undefined;
      if (!analysisId || analysis?.sessionId !== sessionId || !wsHub.canSubscribe(analysisId)) {
        ws.close(4001, 'no running analysis');
        return;
      }
      wsHub.subscribe(analysisId, ws);
      const snapshot = buildStateSnapshot(analysisId);
      ws.send(JSON.stringify({ type: 'state', analysisId, ...snapshot }));
    });
  });

  server.listen(3000, () => console.log('backend on http://localhost:3000'));
});

function buildStateSnapshot(analysisId: string) {
  const analysis = getAnalysis(analysisId);
  if (!analysis) return { providers: [], status: 'failed' };
  const providers = getProviderRows(analysisId).map((row) => {
    const scorecard = row.scorecard ? JSON.parse(row.scorecard) : null;
    return {
      provider: row.provider,
      status: row.status,
      progress: row.progress,
      lastUpdated: new Date(row.lastUpdated).toISOString(),
      scorecard: scorecard ? ScorecardSchema.parse(scorecard) : null,
    };
  });
  return { status: analysis.status, error: analysis.error, username: analysis.username, providers };
}
