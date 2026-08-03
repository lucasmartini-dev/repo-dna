<template>
  <div class="report">
    <h2>{{ report?.analysis.username }}</h2>
    <div class="tabs">
      <button
        v-for="(card, i) in report?.scorecards ?? []"
        :key="card.provider"
        :class="{ active: activeTab === i }"
        @click="activeTab = i"
      >
        {{ card.provider }}
      </button>
    </div>
    <template v-if="activeCard">
      <VerdictBox :card="activeCard" />
      <ScorecardTable :card="activeCard" :analysis-id="id" />
    </template>
    <p v-else-if="report && report.scorecards.length === 0" data-test="no-scorecards">
      No provider succeeded. Please retry a failed provider.
    </p>
    <button class="primary" data-test="copy" @click="copyReport">Copy report</button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { fetchReport } from '../api/client';
import type { AnalysisSummary, Scorecard } from '@repo/shared';
import ScorecardTable from '../components/ScorecardTable.vue';
import VerdictBox from '../components/VerdictBox.vue';

const props = defineProps<{ id: string }>();
const report = ref<{ analysis: AnalysisSummary; scorecards: Scorecard[] } | null>(null);
const activeTab = ref(0);

const activeCard = computed(() => report.value?.scorecards[activeTab.value] ?? null);

onMounted(async () => {
  try {
    report.value = await fetchReport(props.id);
  } catch {
    report.value = null;
  }
});

function copyReport(): void {
  if (!report.value) return;
  const text = JSON.stringify(report.value.scorecards, null, 2);
  navigator.clipboard.writeText(text);
}
</script>

<style scoped>
.report {
  max-width: 720px;
  margin: 40px auto;
}
.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.tabs button.active {
  font-weight: bold;
  border-bottom: 2px solid #2196f3;
}
</style>
