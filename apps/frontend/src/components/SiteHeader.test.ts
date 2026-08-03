import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import SiteHeader from './SiteHeader.vue';
import { useAnalysisStore } from '../stores/analysis';

let mockPath = '/';

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: mockPath }),
  RouterLink: { template: '<a><slot /></a>' },
}));

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  mockPath = '/';
});

describe('SiteHeader', () => {
  it('shows only Home on root path', () => {
    const wrapper = mount(SiteHeader);
    expect(wrapper.text()).toContain('Home');
    expect(wrapper.text()).not.toContain('Analysis');
  });

  it('shows Home > Analysis: username on analysis path', () => {
    mockPath = '/analysis';
    const store = useAnalysisStore();
    store.username = 'octocat';
    const wrapper = mount(SiteHeader);
    expect(wrapper.text()).toContain('Analysis: octocat');
  });

  it('shows Home > Analysis > Report on report path', () => {
    mockPath = '/report/123';
    const store = useAnalysisStore();
    store.username = 'octocat';
    const wrapper = mount(SiteHeader);
    expect(wrapper.text()).toContain('Report');
  });
});
