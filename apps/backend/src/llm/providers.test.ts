import { providers, getProvider } from './index';

describe('providers', () => {
  it('exposes exactly the three providers', () => {
    expect(providers.map((p) => p.id).sort()).toEqual(['gemini', 'groq', 'openrouter']);
  });
  it('getProvider returns a provider by id', () => {
    expect(getProvider('gemini').id).toBe('gemini');
    expect(() => getProvider('x' as never)).toThrow();
  });
});
