import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { faker } from '@faker-js/faker';
import type { RepoScorecard } from '@repo/shared';
import RepoReportView from './RepoReportView.vue';
import * as client from '../api/client';

const analysisId = faker.string.uuid();
const repoName = faker.internet.domainWord();

const scorecard: RepoScorecard = {
  id: faker.string.uuid(),
  repoName,
  provider: 'gemini',
  model: 'gemini-2.0-flash',
  status: 'succeeded',
  error: null,
  dimensions: [
    { key: 'code_quality', label: 'Code Quality & Technical Skill', score: 8 },
    { key: 'documentation', label: 'Documentation & Communication', score: 7 },
    { key: 'workflow', label: 'Development Workflow & Practices', score: 6 },
    { key: 'collaboration', label: 'Open Source & Collaboration', score: 9 },
    { key: 'activity', label: 'Activity & Consistency', score: 5 },
  ],
  strengths: [faker.lorem.words(2)],
  gaps: [faker.lorem.words(2)],
  verdict: { leaning: 'strong', summary: faker.lorem.sentence() },
  startedAt: null,
  completedAt: new Date().toISOString(),
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('RepoReportView', () => {
  it('renders repo name and dimension scores', async () => {
    vi.spyOn(client, 'fetchRepoAnalysis').mockResolvedValue(scorecard);
    const wrapper = mount(RepoReportView, { props: { analysisId, repoName } });
    await flushPromises();
    expect(wrapper.text()).toContain(repoName);
    expect(wrapper.text()).toContain('8/10');
    expect(wrapper.text()).toContain('Verdict: strong');
    expect(wrapper.text()).toContain(scorecard.verdict.summary);
  });

  it('shows error when fetch returns null', async () => {
    vi.spyOn(client, 'fetchRepoAnalysis').mockResolvedValue(null);
    const wrapper = mount(RepoReportView, { props: { analysisId, repoName } });
    await flushPromises();
    expect(wrapper.find('[data-test="error"]').text()).toContain('Failed to load');
  });

  it('shows no-data when fetch throws', async () => {
    vi.spyOn(client, 'fetchRepoAnalysis').mockRejectedValue(new Error('fail'));
    const wrapper = mount(RepoReportView, { props: { analysisId, repoName } });
    await flushPromises();
    expect(wrapper.find('[data-test="error"]').exists()).toBe(true);
  });
});
