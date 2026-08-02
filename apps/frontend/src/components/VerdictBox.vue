<template>
  <div class="verdict" :data-leaning="card.verdict.leaning">
    <h4>Verdict: {{ card.verdict.leaning }}</h4>
    <p>{{ card.verdict.summary }}</p>
  </div>
</template>

<script setup lang="ts">
import type { Scorecard } from '@repo/shared';
defineProps<{ card: Scorecard }>();
</script>

<style scoped>
.verdict {
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 12px;
  margin-top: 12px;
}
.verdict[data-leaning='hire'] {
  border-color: #4caf50;
}
.verdict[data-leaning='no_hire'] {
  border-color: #f44336;
}
</style>
