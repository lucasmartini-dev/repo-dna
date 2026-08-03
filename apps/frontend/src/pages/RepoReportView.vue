<template>
  <div class="repo-report">
    <h2>{{ repoName }}</h2>
    <div v-if="loading" class="loading" data-test="loading">Loading repo analysis...</div>
    <div v-else-if="error" class="error" data-test="error">
      {{ error }}
    </div>
    <template v-else-if="scorecard">
      <p class="meta">Analyzed by {{ scorecard.provider }} &middot; Model: {{ scorecard.model }}</p>
      <h3>Dimensions</h3>
      <div v-for="d in scorecard.dimensions" :key="d.key" class="dimension">
        <span class="dim-label">{{ d.label }}</span>
        <div class="dim-bar">
          <div class="dim-fill" :style="{ width: d.score * 10 + '%' }" />
        </div>
        <span class="dim-score">{{ d.score }}/10</span>
      </div>
      <h3>Strengths</h3>
      <ul>
        <li v-for="s in scorecard.strengths" :key="s">
          {{ s }}
        </li>
      </ul>
      <h3>Gaps</h3>
      <ul>
        <li v-for="g in scorecard.gaps" :key="g">
          {{ g }}
        </li>
      </ul>
      <div v-if="scorecard.verdict" class="verdict" :data-leaning="scorecard.verdict.leaning">
        <h4>Verdict: {{ scorecard.verdict.leaning }}</h4>
        <p>{{ scorecard.verdict.summary }}</p>
      </div>
    </template>
    <div v-else data-test="no-data">No repo analysis found.</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { fetchRepoAnalysis } from '../api/client';
import type { RepoScorecard } from '@repo/shared';

const props = defineProps<{ analysisId: string; repoName: string }>();

const loading = ref(true);
const error = ref<string | null>(null);
const scorecard = ref<RepoScorecard | null>(null);

onMounted(async () => {
  try {
    scorecard.value = await fetchRepoAnalysis(props.analysisId, props.repoName);
    if (!scorecard.value) {
      error.value = 'Failed to load repo analysis.';
    }
  } catch {
    error.value = 'Failed to load repo analysis.';
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.repo-report {
  max-width: 720px;
  margin: 40px auto;
}
.loading {
  color: var(--color-text-muted);
}
.error {
  color: var(--color-destructive);
}
.meta {
  color: var(--color-text-muted);
  font-size: 13px;
  margin-bottom: 16px;
}
.dimension {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 0;
}
.dim-bar {
  flex: 1;
  height: 10px;
  background: #eee;
  border-radius: 5px;
}
.dim-fill {
  height: 100%;
  background: var(--color-primary);
  border-radius: 5px;
}
.dim-score {
  width: 40px;
  text-align: right;
}
.verdict {
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 12px;
  margin-top: 12px;
}
.verdict[data-leaning='strong'] {
  border-color: var(--color-positive);
}
.verdict[data-leaning='weak'] {
  border-color: var(--color-destructive);
}
</style>
