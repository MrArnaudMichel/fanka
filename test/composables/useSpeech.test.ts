import { describe, expect, it, vi } from 'vitest';
import { type SpeechEngine, useSpeech } from '~/composables/useSpeech';

function fakeEngine(languages: string[], overrides: Partial<SpeechEngine> = {}) {
  const calls: string[] = [];
  const engine: SpeechEngine = {
    languages: async () => languages,
    speak: vi.fn(async (text: string, lang: string, rate: number) => {
      calls.push(`speak:${text}:${lang}:${rate}`);
    }),
    cancel: vi.fn(async () => {
      calls.push('cancel');
    }),
    ...overrides,
  };
  return { engine, calls };
}

describe('useSpeech', () => {
  it('prefers zh-TW over zh-CN', async () => {
    const { engine, calls } = fakeEngine(['en-US', 'zh-CN', 'zh-TW']);
    const s = useSpeech(engine);
    await s.ready;
    expect(s.supported.value).toBe(true);
    await s.speak('你好');
    expect(calls).toEqual(['cancel', 'speak:你好:zh-TW:0.9']);
  });

  it('falls back to any other Chinese voice', async () => {
    const { engine, calls } = fakeEngine(['en-US', 'zh-CN']);
    const s = useSpeech(engine);
    await s.speak('好');
    expect(calls).toEqual(['cancel', 'speak:好:zh-CN:0.9']);
  });

  it('is unsupported without a Chinese voice, and stays silent', async () => {
    const { engine, calls } = fakeEngine(['en-US', 'fr-FR']);
    const s = useSpeech(engine);
    await s.ready;
    expect(s.supported.value).toBe(false);
    await s.speak('好');
    expect(calls).toEqual([]);
  });

  it('does not throw when the engine fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { engine } = fakeEngine(['zh-TW'], {
      speak: async () => {
        throw new Error('boom');
      },
    });
    const s = useSpeech(engine);
    await expect(s.speak('好')).resolves.toBeUndefined();
    expect(s.speaking.value).toBe(false);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('is unsupported, not thrown, when listing voices fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { engine } = fakeEngine([], {
      languages: async () => {
        throw new Error('no tts');
      },
    });
    const s = useSpeech(engine);
    await s.ready;
    expect(s.supported.value).toBe(false);
    error.mockRestore();
  });
});
