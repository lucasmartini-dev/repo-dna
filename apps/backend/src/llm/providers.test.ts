import { providers, getProvider } from './index';

describe('providers', () => {
  it('exposes exactly the four providers', () => {
    expect(providers.map((p) => p.id).sort()).toEqual(['gemini', 'groq', 'nvcf', 'openrouter']);
  });
  it('getProvider returns a provider by id', () => {
    expect(getProvider('gemini').id).toBe('gemini');
    expect(() => getProvider('x' as never)).toThrow();
  });
  it('each provider has analyzeCustomPrompt method', () => {
    for (const p of providers) {
      expect(typeof p.analyzeCustomPrompt).toBe('function');
    }
  });
});
