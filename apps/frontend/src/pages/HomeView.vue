<template>
  <div class="home">
    <h1>GitHub Profile Analyzer</h1>
    <input v-model="link" data-test="link-input" placeholder="https://github.com/username" @keyup.enter="onAnalyze" />
    <button class="primary" data-test="analyze" :disabled="busy" @click="onAnalyze">Analyze</button>

    <div v-if="candidate" class="model-select">
      <h3>Choose models for {{ candidate }}</h3>
      <div v-for="pid in providerIds" :key="pid" class="model-row">
        <label>{{ pid }}</label>
        <select v-model="selectedModels[pid]" data-test="model-select">
          <option v-for="m in PROVIDER_MODELS[pid]" :key="m.id" :value="m.id">
            {{ m.displayName }}
          </option>
        </select>
      </div>
      <button class="primary" data-test="confirm-models" @click="onConfirm">Start Analysis</button>
    </div>

    <p v-if="error" class="error" data-test="error">
      {{ error }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { parseGithubUrl } from '../utils/githubUrl';
import { useAnalysisStore } from '../stores/analysis';
import { PROVIDER_MODELS, PROVIDER_IDS, type ProviderId } from '@repo/shared';

const router = useRouter();
const store = useAnalysisStore();
const link = ref('');
const candidate = ref<string | null>(null);
const error = ref<string | null>(null);
const busy = ref(false);
const providerIds = PROVIDER_IDS as unknown as ProviderId[];
const selectedModels = reactive<Record<string, string>>(
  Object.fromEntries(providerIds.map((pid) => [pid, PROVIDER_MODELS[pid][0]?.id ?? '']))
);

function onAnalyze(): void {
  const parsed = parseGithubUrl(link.value);
  if (!parsed) {
    error.value = 'That link looks invalid. Enter a GitHub profile URL like https://github.com/username';
    candidate.value = null;
    return;
  }
  error.value = null;
  candidate.value = parsed.username;
}

async function onConfirm(): Promise<void> {
  const username = candidate.value;
  candidate.value = null;
  if (!username) return;
  busy.value = true;
  const result = await store.start(username, { ...selectedModels });
  busy.value = false;
  if (result === 'conflict') {
    error.value = 'An analysis is already running — wait for it to finish before starting another.';
    return;
  }
  if (result === 'error') {
    error.value = 'Your session expired. Please reload the page.';
    return;
  }
  router.push('/analysis');
}
</script>

<style scoped>
.home {
  max-width: 640px;
  margin: 80px auto;
  text-align: center;
}
input {
  width: 100%;
  padding: 12px;
  font-size: 16px;
}
button.primary {
  margin-top: 12px;
  padding: 12px 24px;
}
.error {
  color: var(--color-destructive);
}
.model-select {
  margin-top: 24px;
}
.model-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 8px 0;
}
.model-row select {
  padding: 6px 12px;
  font-size: 14px;
}
</style>
