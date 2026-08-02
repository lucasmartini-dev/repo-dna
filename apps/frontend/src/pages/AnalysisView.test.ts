import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { faker } from '@faker-js/faker';
import AnalysisView from './AnalysisView.vue';
import { useAnalysisStore } from '../stores/analysis';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ query: {} }),
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
});
