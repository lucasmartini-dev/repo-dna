<template>
  <header class="site-header">
    <div class="header-inner">
      <span class="logo">GH Analyzer</span>
      <nav class="breadcrumbs">
        <router-link to="/"> Home </router-link>
        <template v-if="showAnalysis">
          <span class="sep">></span>
          <router-link to="/analysis"> Analysis: {{ username }} </router-link>
        </template>
        <template v-if="showReport">
          <span class="sep">></span>
          <span class="current">Report</span>
        </template>
      </nav>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAnalysisStore } from '../stores/analysis';

const route = useRoute();
const store = useAnalysisStore();

const showAnalysis = computed(() => route.path.startsWith('/analysis') || route.path.startsWith('/report'));
const showReport = computed(() => route.path.startsWith('/report'));
const username = computed(() => store.username ?? '');
</script>

<style scoped>
.site-header {
  background: var(--color-primary);
  color: #fff;
  padding: 12px 24px;
}

.header-inner {
  max-width: 960px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 16px;
}

.logo {
  font-weight: 700;
  font-size: 16px;
}

.breadcrumbs {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.breadcrumbs a {
  color: var(--color-ai);
  text-decoration: none;
}

.breadcrumbs a:hover {
  text-decoration: underline;
}

.sep {
  color: rgba(255, 255, 255, 0.5);
}

.current {
  color: rgba(255, 255, 255, 0.7);
}
</style>
