<template>
  <div class="repo-analyze-row">
    <span class="repo-info">{{ repo.name }} (⭐{{ repo.stars }}) — {{ repo.description }}</span>
    <div class="repo-actions">
      <select v-model="selectedProvider" class="provider-select">
        <option v-for="p in PROVIDER_IDS" :key="p" :value="p">
          {{ p }}
        </option>
      </select>
      <select v-model="selectedModel" class="model-select">
        <option v-for="m in availableModels" :key="m.id" :value="m.id">
          {{ m.displayName }}
        </option>
      </select>
      <button v-if="!result" class="analyze-btn" :disabled="analyzing" @click="analyze">
        {{ analyzing ? 'Analyzing...' : 'Analyze Repo' }}
      </button>
      <router-link v-else :to="`/report/${analysisId}/repo/${encodeURIComponent(repo.name)}`" class="view-link">
        View report →
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { PROVIDER_IDS, PROVIDER_MODELS, type ProviderId } from '@repo/shared';
import type { TopRepo } from '@repo/shared';
import { startRepoAnalysis } from '../api/client';

const props = defineProps<{ repo: TopRepo; analysisId: string }>();

const selectedProvider = ref<ProviderId>(PROVIDER_IDS[0]);
const selectedModel = ref(PROVIDER_MODELS[PROVIDER_IDS[0]][0]?.id ?? '');
const analyzing = ref(false);
const result = ref<{ status: string } | null>(null);

const availableModels = computed(() => PROVIDER_MODELS[selectedProvider.value] ?? []);

async function analyze(): Promise<void> {
  analyzing.value = true;
  try {
    result.value = await startRepoAnalysis(
      props.analysisId,
      props.repo.name,
      props.repo.description,
      null,
      props.repo.stars,
      [],
      selectedProvider.value,
      selectedModel.value
    );
  } catch {
    result.value = { status: 'error' };
  } finally {
    analyzing.value = false;
  }
}
</script>

<style scoped>
.repo-analyze-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  gap: 8px;
  flex-wrap: wrap;
}
.repo-info {
  flex: 1;
  min-width: 200px;
}
.repo-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.provider-select,
.model-select {
  padding: 4px 8px;
  font-size: 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
}
.analyze-btn {
  padding: 4px 12px;
  font-size: 12px;
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
.analyze-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.view-link {
  padding: 4px 12px;
  font-size: 12px;
  color: var(--color-information);
  text-decoration: none;
}
</style>
