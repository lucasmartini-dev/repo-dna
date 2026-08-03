<template>
  <div class="analysis">
    <h2 data-test="username">
      {{ store.username }}
    </h2>
    <p v-if="store.banner" class="banner" data-test="banner">
      {{ store.banner }}
    </p>
    <div v-if="!store.analysis" class="empty">No analysis yet.</div>
    <template v-else>
      <p v-if="store.analysis.error" class="error" data-test="analysis-error">
        {{ store.analysis.error }}
      </p>
      <ProviderCard
        v-for="card in store.analysis.providers"
        :key="card.provider"
        :card="card"
        :cooldown-remaining="store.cooldownRemaining(card.provider)"
        @retry="(model: string) => store.retry(card.provider, model)"
        @view-scorecard="showReport"
      />
      <button v-if="store.analysis.status !== 'running'" class="primary" data-test="view-report" @click="showReport">
        View report
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAnalysisStore } from '../stores/analysis';
import { useSessionStore } from '../stores/session';
import { connectAnalysisWs } from '../api/ws';
import ProviderCard from '../components/ProviderCard.vue';

const router = useRouter();
const store = useAnalysisStore();
const session = useSessionStore();

let closeWs: (() => void) | null = null;

function subscribe(): void {
  if (!store.analysisId || !session.sessionId) return;
  closeWs?.();
  closeWs = connectAnalysisWs(store.analysisId, session.sessionId, {
    onState: (snapshot) => {
      store.loadAnalysis(store.analysisId!);
      void snapshot;
    },
    onProviderUpdate: store.onProviderUpdate,
    onFinal: (payload) => {
      store.onFinal(payload);
      closeWs?.();
    },
    shouldReconnect: () => store.isRunning,
  });
}

function showReport(): void {
  if (store.analysisId) router.push(`/report/${store.analysisId}`);
}

onMounted(async () => {
  if (!store.analysisId) {
    const restored = await store.restore();
    if (!restored) {
      router.push('/');
      return;
    }
  }
  if (store.analysisId && (!store.analysis || store.isRunning)) {
    subscribe();
  }
});

watch(
  () => store.isRunning,
  (running) => {
    if (running && store.analysisId) subscribe();
  }
);

onUnmounted(() => closeWs?.());
</script>

<style scoped>
.analysis {
  max-width: 720px;
  margin: 40px auto;
}
.banner {
  background: #fff8e1;
  padding: 12px;
  border-radius: 6px;
}
.error {
  color: #b00020;
}
</style>
