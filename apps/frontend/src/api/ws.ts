export interface WsHandlers {
  onState: (snapshot: unknown) => void;
  onProviderUpdate: (payload: unknown) => void;
  onFinal: (payload: { status: string; error?: string }) => void;
  shouldReconnect: () => boolean;
}

export function connectAnalysisWs(analysisId: string, sessionId: string, handlers: WsHandlers): () => void {
  let ws: WebSocket | null = null;
  let closed = false;
  let retryDelay = 500;

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${protocol}://${window.location.host}/ws?sessionId=${encodeURIComponent(sessionId)}&analysisId=${encodeURIComponent(analysisId)}`;

  const connect = () => {
    ws = new WebSocket(url);
    ws.onopen = () => {
      retryDelay = 500;
    };
    ws.onmessage = (e) => {
      const event = JSON.parse(e.data as string);
      if (event.type === 'state') handlers.onState(event);
      else if (event.type === 'provider-update') handlers.onProviderUpdate(event);
      else if (event.type === 'final') {
        handlers.onFinal(event);
        ws?.close();
      }
    };
    ws.onclose = () => {
      if (closed) return;
      if (!handlers.shouldReconnect()) return;
      setTimeout(() => {
        if (!closed && handlers.shouldReconnect()) connect();
      }, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 5000);
    };
  };

  connect();
  return () => {
    closed = true;
    ws?.close();
  };
}
