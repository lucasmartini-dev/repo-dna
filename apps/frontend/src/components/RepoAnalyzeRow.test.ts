import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import RepoAnalyzeRow from './RepoAnalyzeRow.vue';
import * as client from '../api/client';

vi.mock('vue-router', () => ({
  RouterLink: { template: '<a><slot /></a>' },
}));

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('RepoAnalyzeRow', () => {
  it('renders repo info and analyze button', () => {
    const wrapper = mount(RepoAnalyzeRow, {
      props: { repo: { name: 'test', stars: 5, description: 'desc', reason: '' }, analysisId: 'a1' },
    });
    expect(wrapper.text()).toContain('test');
    expect(wrapper.text()).toContain('Analyze Repo');
  });

  it('calls startRepoAnalysis on button click', async () => {
    vi.spyOn(client, 'startRepoAnalysis').mockResolvedValue({ status: 'started' });
    const wrapper = mount(RepoAnalyzeRow, {
      props: { repo: { name: 'test', stars: 5, description: 'desc', reason: '' }, analysisId: 'a1' },
    });
    await wrapper.find('button').trigger('click');
    expect(client.startRepoAnalysis).toHaveBeenCalled();
  });
});
