<template>
  <div class="home">
    <h1>GitHub Profile Analyzer</h1>
    <input v-model="link" data-test="link-input" placeholder="https://github.com/username" @keyup.enter="onAnalyze" />
    <button class="primary" data-test="analyze" :disabled="busy" @click="onAnalyze">Analyze</button>
    <p v-if="error" class="error" data-test="error">
      {{ error }}
    </p>
    <ConfirmModal v-if="candidate" :username="candidate" @confirm="onConfirm" @cancel="candidate = null" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { parseGithubUrl } from '../utils/githubUrl';
import { useAnalysisStore } from '../stores/analysis';
import ConfirmModal from '../components/ConfirmModal.vue';

const router = useRouter();
const store = useAnalysisStore();
const link = ref('');
const candidate = ref<string | null>(null);
const error = ref<string | null>(null);
const busy = ref(false);

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
  const result = await store.start(username);
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
  color: #b00020;
}
</style>
