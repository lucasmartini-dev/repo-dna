import { defineStore } from 'pinia';
import { ref } from 'vue';

const STORAGE_KEY = 'github-analyzer.session';

export const useSessionStore = defineStore('session', () => {
  const sessionId = ref<string | null>(localStorage.getItem(STORAGE_KEY));

  function ensureSession(): string {
    if (sessionId.value) return sessionId.value;
    const id = crypto.randomUUID();
    sessionId.value = id;
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  }

  function resetSession(): void {
    sessionId.value = null;
    localStorage.removeItem(STORAGE_KEY);
  }

  return { sessionId, ensureSession, resetSession };
});
