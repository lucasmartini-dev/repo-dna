import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { faker } from '@faker-js/faker';
import AnalysisView from './AnalysisView.vue';
import { useAnalysisStore } from '../stores/analysis';
import { useSessionStore } from '../stores/session';
import { connectAnalysisWs } from '../api/ws';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ query: {} }),
}));

vi.mock('../api/ws', () => ({
  connectAnalysisWs: vi.fn(() => vi.fn()),
}));

const sessionId = faker.string.uuid();
const analysisId = faker.string.uuid();
const username = faker.internet.userName();

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  vi.restoreAllMocks();
});

describe('AnalysisView', () => {
  it('shows shared banner when shared', async () => {
    const store = useAnalysisStore();
    store.shared = true;
    store.banner = 'already being analyzed';
    store.analysisId = analysisId;
    const wrapper = mount(AnalysisView);
    await flushPromises();
    expect(wrapper.text()).toContain('already being analyzed');
  });

  it('shows a retry button for a failed provider', async () => {
    const store = useAnalysisStore();
    store.analysisId = analysisId;
    store.analysis = {
      id: analysisId,
      sessionId,
      username,
      status: 'failed',
      error: null,
      createdAt: new Date().toISOString(),
      providers: [
        {
          provider: 'gemini',
          status: 'failed',
          progress: 40,
          startedAt: null,
          lastUpdated: new Date().toISOString(),
          completedAt: null,
          dimensions: [],
          top_repos: [],
          strengths: [],
          gaps: [],
          verdict: { leaning: 'uncertain', summary: '' },
        },
      ],
    } as never;
    const wrapper = mount(AnalysisView);
    await flushPromises();
    expect(wrapper.text()).toContain('Retry');
  });

  it('subscribes to websocket when analysis is running', async () => {
    const session = useSessionStore();
    const activeSessionId = session.ensureSession();
    const store = useAnalysisStore();
    store.analysisId = analysisId;
    store.analysis = {
      id: analysisId,
      sessionId: activeSessionId,
      username,
      status: 'running',
      error: null,
      createdAt: new Date().toISOString(),
      providers: [],
    } as never;
    mount(AnalysisView);
    await flushPromises();
    expect(connectAnalysisWs).toHaveBeenCalledWith(
      analysisId,
      activeSessionId,
      expect.objectContaining({
        onState: expect.any(Function),
        onProviderUpdate: expect.any(Function),
        onFinal: expect.any(Function),
        shouldReconnect: expect.any(Function),
      })
    );
  });

  it('subscribes to websocket when analysis is not yet loaded', async () => {
    const session = useSessionStore();
    const activeSessionId = session.ensureSession();
    const store = useAnalysisStore();
    store.analysisId = analysisId;
    store.analysis = null;
    mount(AnalysisView);
    await flushPromises();
    expect(connectAnalysisWs).toHaveBeenCalledWith(analysisId, activeSessionId, expect.any(Object));
  });

  it('resubscribes to websocket when analysis transitions from failed to running after retry', async () => {
    const session = useSessionStore();
    const activeSessionId = session.ensureSession();
    const store = useAnalysisStore();
    store.analysisId = analysisId;
    store.analysis = {
      id: analysisId,
      sessionId: activeSessionId,
      username,
      status: 'failed',
      error: null,
      createdAt: new Date().toISOString(),
      providers: [],
    } as never;
    mount(AnalysisView);
    await flushPromises();
    const calledAfterMount = (connectAnalysisWs as ReturnType<typeof vi.fn>).mock.calls.length;
    store.analysis = {
      id: analysisId,
      sessionId: activeSessionId,
      username,
      status: 'running',
      error: null,
      createdAt: new Date().toISOString(),
      providers: [],
    } as never;
    await flushPromises();
    expect((connectAnalysisWs as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(calledAfterMount);
  });
});
