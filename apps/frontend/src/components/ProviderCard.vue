<template>
  <div class="provider-card" :data-status="card.status">
    <div class="provider-header">
      <span class="provider-name">{{ card.provider }}</span>
      <span class="provider-status">{{ card.status }}</span>
    </div>
    <template v-if="card.status === 'pending' || card.status === 'running'">
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: card.progress + '%' }" />
      </div>
      <span class="meta">progress: {{ card.progress }}% · updated {{ card.lastUpdated }}</span>
    </template>
    <template v-else-if="card.status === 'failed'">
      <span class="meta">Analysis failed</span>
      <button class="retry" data-test="retry" :disabled="cooldownRemaining > 0" @click="$emit('retry')">
        Retry{{ cooldownRemaining > 0 ? ` (${cooldownRemaining}s)` : '' }}
      </button>
    </template>
    <template v-else>
      <button class="view-scorecard" data-test="view-scorecard" @click="$emit('view-scorecard')">View scorecard</button>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { Scorecard } from '@repo/shared';

defineProps<{ card: Scorecard; cooldownRemaining: number }>();
defineEmits<{ (e: 'retry'): void; (e: 'view-scorecard'): void }>();
</script>

<style scoped>
.provider-card {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 16px;
  margin: 12px 0;
}
.provider-header {
  display: flex;
  justify-content: space-between;
}
.progress-bar {
  height: 8px;
  background: #eee;
  border-radius: 4px;
  margin: 8px 0;
}
.progress-fill {
  height: 100%;
  background: #4caf50;
  border-radius: 4px;
  transition: width 0.3s;
}
.meta {
  color: #666;
  font-size: 12px;
}
</style>
