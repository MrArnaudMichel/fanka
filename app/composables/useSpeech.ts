import { Capacitor } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import type { Bundle } from '~core/chinese/script';
import { activeBundle } from '~core/db/bundle-scope';

/** The few things the composable needs from a speech engine, so tests can fake it. */
export interface SpeechEngine {
  /** BCP 47 tags of every voice on the device; may wait for the browser to load its voices. */
  languages(): Promise<string[]>;
  /** Resolves when the utterance ends (or is cut off). */
  speak(text: string, lang: string, rate: number): Promise<void>;
  cancel(): Promise<void>;
}

const RATE = 0.9;
/** For listening closely to a long sentence before repeating it. */
const SLOW_RATE = 0.6;

const nativeEngine: SpeechEngine = {
  async languages() {
    return (await TextToSpeech.getSupportedLanguages()).languages;
  },
  async speak(text, lang, rate) {
    await TextToSpeech.speak({ text, lang, rate, queueStrategy: 1 });
  },
  async cancel() {
    await TextToSpeech.stop();
  },
};

/** How long to wait for a browser to report its voices before deciding it has none. */
const VOICES_WAIT_MS = 1500;

const webEngine: SpeechEngine = {
  async languages() {
    const synth = window.speechSynthesis;
    if (!synth) return [];
    let voices = synth.getVoices();
    if (voices.length === 0) {
      // Chromium fills the list in after first use and announces it.
      await new Promise<void>((resolve) => {
        const done = () => {
          synth.removeEventListener('voiceschanged', done);
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(done, VOICES_WAIT_MS);
        synth.addEventListener('voiceschanged', done);
      });
      voices = synth.getVoices();
    }
    return voices.map((v) => v.lang);
  },
  speak(text, lang, rate) {
    return new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = rate;
      // A cancelled utterance reports an error; either way it is over.
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  },
  async cancel() {
    window.speechSynthesis?.cancel();
  },
};

function defaultEngine(): SpeechEngine {
  return Capacitor.isNativePlatform() ? nativeEngine : webEngine;
}

/**
 * The bundle's voice first (zh-CN for Mainland, zh-TW for Taiwan and before
 * onboarding), then any other Chinese voice. Tags are returned as the engine spelled them.
 */
export function pickChineseLanguage(languages: string[], bundle: Bundle | null): string | null {
  const zh = languages.filter((l) => /^zh([-_]|$)/i.test(l));
  const region = bundle === 'mainland' ? 'CN' : 'TW';
  const wanted = new RegExp(`^zh[-_]${region}$`, 'i');
  return zh.find((l) => wanted.test(l)) ?? zh[0] ?? null;
}

/**
 * Pronunciation through the device's text-to-speech. `supported` is true once a
 * Chinese voice has been found; until then (and when there is none) it is false.
 */
export function useSpeech(engine?: SpeechEngine) {
  const tts = engine ?? defaultEngine();
  const supported = ref(false);
  const speaking = ref(false);
  let languages: string[] = [];
  let turn = 0;

  const ready: Promise<void> = (import.meta.client || engine
    ? tts.languages().then((available) => {
        languages = available;
        supported.value = pickChineseLanguage(languages, activeBundle()) !== null;
      })
    : Promise.resolve()
  ).catch((err: unknown) => {
    console.error('useSpeech: could not list voices', err);
  });

  async function speak(text: string, { slow = false }: { slow?: boolean } = {}): Promise<void> {
    await ready;
    const lang = pickChineseLanguage(languages, activeBundle());
    if (!lang || !text) return;
    const mine = ++turn;
    try {
      await tts.cancel();
      speaking.value = true;
      await tts.speak(text, lang, slow ? SLOW_RATE : RATE);
    } catch (err) {
      console.error('useSpeech: could not speak', err);
    } finally {
      // Only the latest call clears the flag; an interrupted one must not.
      if (mine === turn) speaking.value = false;
    }
  }

  async function stop(): Promise<void> {
    ++turn;
    speaking.value = false;
    try {
      await tts.cancel();
    } catch (err) {
      console.error('useSpeech: could not stop', err);
    }
  }

  return { supported, speaking, speak, stop, ready };
}
