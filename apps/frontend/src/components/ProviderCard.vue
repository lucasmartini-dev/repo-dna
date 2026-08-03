<template>
  <div class="provider-card" :data-status="card.status">
    <div class="provider-header">
      <div>
        <span class="provider-name">{{ card.provider }}</span>
        <span v-if="card.model" class="model-badge">{{ modelDisplayName }}</span>
      </div>
      <span class="provider-status">{{ card.status }}</span>
    </div>
    <div v-if="card.startedAt" class="meta-row">Started: {{ formattedStartedAt }}</div>
    <template v-if="card.status === 'pending' || card.status === 'running'">
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: card.progress + '%' }" />
      </div>
      <span class="meta">progress: {{ card.progress }}% · updated {{ card.lastUpdated }}</span>
    </template>
    <template v-else-if="card.status === 'failed'">
      <span class="meta">Analysis failed</span>
      <div class="retry-row">
        <select v-model="selectedModel" data-test="retry-model-select" class="retry-model-select">
          <option v-for="m in providerModels" :key="m.id" :value="m.id">
            {{ m.displayName }}
          </option>
        </select>
        <button
          class="retry"
          data-test="retry"
          :disabled="cooldownRemaining > 0"
          @click="$emit('retry', selectedModel)"
        >
          Retry{{ cooldownRemaining > 0 ? ` (${cooldownRemaining}s)` : '' }}
        </button>
      </div>
    </template>
    <template v-else>
      <button class="view-scorecard" data-test="view-scorecard" @click="$emit('view-scorecard')">View scorecard</button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Scorecard, ProviderId } from '@repo/shared';
import { PROVIDER_MODELS } from '@repo/shared';

const props = defineProps<{ card: Scorecard; cooldownRemaining: number }>();
defineEmits<{ (e: 'retry', model: string): void; (e: 'view-scorecard'): void }>();

const providerModels = computed(() => PROVIDER_MODELS[props.card.provider as ProviderId] ?? []);

const selectedModel = ref(props.card.model ?? providerModels.value[0]?.id ?? '');

const modelDisplayName = computed(() => {
  if (!props.card.model || !props.card.provider) return null;
  const models = PROVIDER_MODELS[props.card.provider];
  if (!models) return props.card.model;
  return models.find((m) => m.id === props.card.model)?.displayName ?? props.card.model;
});

const formattedStartedAt = computed(() => {
  if (!props.card.startedAt) return null;
  const d = new Date(props.card.startedAt);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getUTCMonth()];
  const day = String(d.getUTCDate()).padStart(2, '0');
  const year = d.getUTCFullYear();
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const mins = String(d.getUTCMinutes()).padStart(2, '0');
  const secs = String(d.getUTCSeconds()).padStart(2, '0');
  return `${month} ${day}, ${year} at ${hours}:${mins}:${secs}`;
});
</script>

<style scoped>
.provider-card {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 16px;
  margin: 12px 0;
  background: var(--color-surface);
}

.provider-card[data-status='running'] {
  border-color: var(--color-primary);
}

.provider-card[data-status='succeeded'] {
  border-color: var(--color-positive);
}

.provider-card[data-status='failed'] {
  border-color: var(--color-destructive);
}

.provider-card[data-status='pending'] {
  border-color: var(--color-warning);
}

.provider-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.provider-name {
  font-weight: 600;
  text-transform: capitalize;
}

.model-badge {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 8px;
  font-size: 11px;
  background: var(--color-ai);
  color: #fff;
  border-radius: 10px;
}

.meta-row {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-top: 4px;
}

.progress-bar {
  height: 8px;
  background: #eee;
  border-radius: 4px;
  margin: 8px 0;
}

.progress-fill {
  height: 100%;
  background: var(--color-primary);
  border-radius: 4px;
  transition: width 0.3s;
}

.meta {
  color: var(--color-text-muted);
  font-size: 12px;
}

.retry-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.retry-model-select {
  padding: 6px 12px;
  font-size: 13px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: var(--color-surface);
}

.retry {
  margin-top: 8px;
  padding: 6px 16px;
  background: var(--color-destructive);
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.view-scorecard {
  margin-top: 8px;
  padding: 6px 16px;
  background: var(--color-information);
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
</style>
