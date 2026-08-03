<template>
  <div class="scorecard" data-test="scorecard">
    <h3>{{ card.provider }}</h3>
    <div v-for="d in card.dimensions" :key="d.key" class="dimension">
      <span class="dim-label">{{ d.label }}</span>
      <div class="dim-bar">
        <div class="dim-fill" :style="{ width: d.score * 10 + '%' }" />
      </div>
      <span class="dim-score">{{ d.score }}/10</span>
    </div>
    <h4>Top repos</h4>
    <div class="repo-list">
      <div v-for="r in card.top_repos" :key="r.name" class="repo-item">
        <RepoAnalyzeRow :repo="r" :analysis-id="analysisId" />
        <em class="repo-reason">{{ r.reason }}</em>
      </div>
    </div>
    <h4>Strengths</h4>
    <ul>
      <li v-for="s in card.strengths" :key="s">
        {{ s }}
      </li>
    </ul>
    <h4>Gaps</h4>
    <ul>
      <li v-for="g in card.gaps" :key="g">
        {{ g }}
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import type { Scorecard } from '@repo/shared';
import RepoAnalyzeRow from './RepoAnalyzeRow.vue';

defineProps<{ card: Scorecard; analysisId: string }>();
</script>

<style scoped>
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
  background: #2196f3;
  border-radius: 5px;
}
.dim-score {
  width: 40px;
  text-align: right;
}
.repo-item {
  padding: 6px 0;
  border-bottom: 1px solid #eee;
}
.repo-reason {
  color: var(--color-text-muted);
  font-size: 12px;
}
</style>
