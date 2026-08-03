import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { AnalysisSummary } from '@repo/shared';
import { startAnalysis, retryProvider, fetchLatestAnalysis, fetchAnalysis } from '../api/client';
import { useSessionStore } from './session';

export const useAnalysisStore = defineStore('analysis', () => {
  const analysis = ref<AnalysisSummary | null>(null);
  const username = ref<string | null>(null);
  const analysisId = ref<string | null>(null);
  const shared = ref(false);
  const banner = ref<string | null>(null);
  const loading = ref(false);
  const cooldowns = ref<Record<string, number>>({});

  const isRunning = computed(() => analysis.value?.status === 'running');

  function setCooldown(provider: string, seconds: number): void {
    cooldowns.value[provider] = seconds;
    const timer = setInterval(() => {
      cooldowns.value[provider] = Math.max(0, (cooldowns.value[provider] ?? 0) - 1);
      if (cooldowns.value[provider] <= 0) clearInterval(timer);
    }, 1000);
  }

  function cooldownRemaining(provider: string): number {
    return cooldowns.value[provider] ?? 0;
  }

  async function start(
    input: string,
    models: Record<string, string> = {}
  ): Promise<'started' | 'shared' | 'conflict' | 'error'> {
    const session = useSessionStore();
    const sessionId = session.ensureSession();
    const result = await startAnalysis(input, sessionId, models);
    if (result.status === 409) return 'conflict';
    if (result.status === 401) return 'error';
    if (result.status === 200 && result.shared) {
      username.value = result.username ?? input;
      analysisId.value = result.analysisId ?? null;
      shared.value = true;
      banner.value = "This GitHub profile is already being analyzed right now — you're watching the live session.";
      if (analysisId.value) await loadAnalysis(analysisId.value);
      return 'shared';
    }
    username.value = result.username ?? input;
    analysisId.value = result.analysisId ?? null;
    shared.value = false;
    banner.value = null;
    if (analysisId.value) await loadAnalysis(analysisId.value);
    return 'started';
  }

  async function restore(): Promise<boolean> {
    const session = useSessionStore();
    const sessionId = session.ensureSession();
    const latest = await fetchLatestAnalysis(sessionId);
    if (!latest) return false;
    analysis.value = latest;
    username.value = latest.username;
    analysisId.value = latest.id;
    return true;
  }

  async function loadAnalysis(id: string): Promise<void> {
    const a = await fetchAnalysis(id);
    if (a) {
      analysis.value = a;
      username.value = a.username;
      analysisId.value = a.id;
    }
  }

  async function retry(provider: string): Promise<void> {
    const session = useSessionStore();
    if (!analysisId.value) return;
    const result = await retryProvider(analysisId.value, session.sessionId ?? '', provider);
    if (result.status === 429 && result.retryAfterSeconds) {
      setCooldown(provider, result.retryAfterSeconds);
      banner.value = `Please wait ${result.retryAfterSeconds}s before retrying ${provider}.`;
      return;
    }
    if (result.status === 200 && result.shared) {
      banner.value = "Another user already retried this provider — you're watching the same retry in progress.";
      return;
    }
    banner.value = null;
    await loadAnalysis(analysisId.value);
  }

  function onProviderUpdate(payload: {
    analysisId: string;
    provider: string;
    status: string;
    progress: number;
    lastUpdated: string;
  }): void {
    if (!analysis.value) return;
    const p = analysis.value.providers.find((x) => x.provider === payload.provider);
    if (p) {
      p.status = payload.status as never;
      p.progress = payload.progress;
      p.lastUpdated = payload.lastUpdated;
    }
  }

  function onFinal(payload: { status: string; error?: string }): void {
    if (analysis.value) {
      analysis.value.status = payload.status as never;
      if (payload.error) analysis.value.error = payload.error;
    }
  }

  return {
    analysis,
    username,
    analysisId,
    shared,
    banner,
    loading,
    isRunning,
    start,
    restore,
    loadAnalysis,
    retry,
    onProviderUpdate,
    onFinal,
    setCooldown,
    cooldownRemaining,
  };
});
