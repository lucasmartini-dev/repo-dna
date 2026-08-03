import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ProviderCard from './ProviderCard.vue';

function makeCard(overrides: Record<string, unknown> = {}) {
  return {
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    status: 'running',
    progress: 50,
    startedAt: '2026-01-15T14:30:22.000Z',
    lastUpdated: '2026-01-15T14:30:30.000Z',
    completedAt: null,
    dimensions: [],
    top_repos: [],
    strengths: [],
    gaps: [],
    verdict: { leaning: 'uncertain', summary: '' },
    ...overrides,
  };
}

describe('ProviderCard', () => {
  it('shows model display name when model is set', () => {
    const wrapper = mount(ProviderCard, { props: { card: makeCard(), cooldownRemaining: 0 } });
    expect(wrapper.text()).toContain('Gemini 2.0 Flash (free)');
  });

  it('shows startedAt formatted', () => {
    const wrapper = mount(ProviderCard, { props: { card: makeCard(), cooldownRemaining: 0 } });
    expect(wrapper.text()).toContain('Jan 15, 2026 at 14:30:22');
  });

  it('hides model and startedAt when null', () => {
    const wrapper = mount(ProviderCard, {
      props: { card: makeCard({ model: null, startedAt: null }), cooldownRemaining: 0 },
    });
    expect(wrapper.text()).not.toContain('Model:');
    expect(wrapper.text()).not.toContain('Started:');
  });

  it('uses pending color for pending status', () => {
    const wrapper = mount(ProviderCard, {
      props: { card: makeCard({ status: 'pending' }), cooldownRemaining: 0 },
    });
    expect(wrapper.find('.provider-card').attributes('data-status')).toBe('pending');
  });

  it('emits retry with selected model on retry button click', async () => {
    const wrapper = mount(ProviderCard, {
      props: { card: makeCard({ status: 'failed' }), cooldownRemaining: 0 },
    });
    await wrapper.find('button.retry').trigger('click');
    expect(wrapper.emitted('retry')).toBeTruthy();
    expect(wrapper.emitted('retry')?.[0]).toEqual(['gemini-2.0-flash']);
  });

  it('shows model dropdown for failed providers', () => {
    const wrapper = mount(ProviderCard, {
      props: { card: makeCard({ status: 'failed' }), cooldownRemaining: 0 },
    });
    const select = wrapper.find('select');
    expect(select.exists()).toBe(true);
    expect(select.findAll('option').length).toBeGreaterThan(0);
  });
});
