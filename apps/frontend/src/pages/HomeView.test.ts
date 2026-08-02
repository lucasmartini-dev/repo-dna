import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { faker } from '@faker-js/faker';
import HomeView from './HomeView.vue';
import { useAnalysisStore } from '../stores/analysis';
import * as client from '../api/client';

faker.seed(0);

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const sessionId = faker.string.uuid();
const analysisId = faker.string.uuid();
const username = faker.internet.userName().replace(/[^A-Za-z0-9-]/g, '');

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  vi.restoreAllMocks();
});

describe('HomeView', () => {
  it('rejects an invalid link with an error', async () => {
    const wrapper = mount(HomeView);
    await wrapper.find('input').setValue('not a url');
    await wrapper.find('button.primary').trigger('click');
    expect(wrapper.text()).toContain('invalid');
  });

  it('shows the confirmation modal for a valid link', async () => {
    const wrapper = mount(HomeView);
    await wrapper.find('input').setValue(`https://github.com/${username}`);
    await wrapper.find('button.primary').trigger('click');
    expect(wrapper.text()).toContain(username);
  });

  it('starts analysis on confirm', async () => {
    vi.spyOn(client, 'startAnalysis').mockResolvedValue({ status: 201, analysisId, username, shared: false });
    vi.spyOn(client, 'fetchAnalysis').mockResolvedValue({
      id: analysisId,
      sessionId,
      username,
      status: 'running',
      error: null,
      createdAt: new Date().toISOString(),
      providers: [],
    } as never);
    const store = useAnalysisStore();
    const wrapper = mount(HomeView);
    await wrapper.find('input').setValue(`https://github.com/${username}`);
    await wrapper.find('button.primary').trigger('click');
    await wrapper.find('button.confirm').trigger('click');
    await vi.waitFor(() => expect(store.analysisId).toBe(analysisId));
  });
});
