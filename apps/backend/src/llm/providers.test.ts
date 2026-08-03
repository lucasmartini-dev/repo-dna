import { providers, getProvider } from './index';

describe('providers', () => {
  it('exposes exactly the five providers', () => {
    expect(providers.map((p) => p.id).sort()).toEqual(['gemini', 'groq', 'nvcf', 'opencode', 'openrouter']);
  });
  it('getProvider returns a provider by id', () => {
    expect(getProvider('gemini').id).toBe('gemini');
    expect(() => getProvider('x' as never)).toThrow();
  });
});
