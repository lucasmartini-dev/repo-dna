import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { faker } from '@faker-js/faker';
import type { Scorecard } from '@repo/shared';
import ReportView from './ReportView.vue';
import * as client from '../api/client';

const sessionId = faker.string.uuid();
const analysisId = faker.string.uuid();
const username = faker.internet.userName();

const scorecard: Scorecard = {
  provider: 'gemini',
  status: 'succeeded',
  progress: 100,
  startedAt: null,
  lastUpdated: new Date().toISOString(),
  completedAt: new Date().toISOString(),
  dimensions: [
    { key: 'code_quality', label: 'Code Quality', score: 8 },
    { key: 'languages', label: 'Languages', score: 7 },
    { key: 'contribution', label: 'Contribution Activity', score: 6 },
    { key: 'project_depth', label: 'Project Depth', score: 9 },
    { key: 'oss_experience', label: 'Open Source Experience', score: 7 },
    { key: 'seniority', label: 'Seniority Level', score: 5 },
  ],
  top_repos: [
    {
      name: faker.internet.domainWord(),
      stars: faker.number.int({ min: 1, max: 999 }),
      description: faker.lorem.sentence(),
      reason: faker.lorem.sentence(),
    },
  ],
  strengths: [faker.lorem.words(2)],
  gaps: [faker.lorem.words(2)],
  verdict: { leaning: 'hire', summary: faker.lorem.sentence() },
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('ReportView', () => {
  it('renders a scorecard with verdict', async () => {
    vi.spyOn(client, 'fetchReport').mockResolvedValue({
      analysis: {
        id: analysisId,
        sessionId,
        username,
        status: 'succeeded',
        error: null,
        createdAt: new Date().toISOString(),
        providers: [scorecard],
      },
      scorecards: [scorecard],
    });
    const wrapper = mount(ReportView, { props: { id: analysisId } });
    await flushPromises();
    expect(wrapper.text()).toContain('Code Quality');
    expect(wrapper.text()).toContain(scorecard.verdict.summary);
    expect(wrapper.text()).toContain('Analyze Repo');
  });
});
