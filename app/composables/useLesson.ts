import { completeLesson, completeWriting } from '~core/db/curriculum';
import { loadSettings } from '~core/db/settings';
import { writingId } from '~core/curriculum/engine';
import { type Exercise, buildExercises, seededRng } from '~core/curriculum/exercises';
import { writingCharacters } from '~core/curriculum/schedule';
import type { Bundle, LessonRef, LevelRef, UnitRef, Word } from '~core/curriculum/types';
import { schedulerFor } from '~core/srs';
import { useContent } from '~/composables/useContent';
import { refreshDueCounts } from '~/composables/useDueCounts';
import { useSpeech } from '~/composables/useSpeech';
import { useStrokeData } from '~/composables/useStrokeData';

type Target =
  | { kind: 'lesson'; level: LevelRef; lesson: LessonRef; words: Word[] }
  | { kind: 'writing'; level: LevelRef; unit: UnitRef; words: Word[] };

interface Answer {
  wordId: string;
  exercise: Exercise['kind'];
  right: boolean;
  at: number;
  durationMs: number;
}

/**
 * Runs one lesson or one unit's writing session, resolved by id (the bundle
 * follows from its `hsk`/`tbcl` prefix) from the
 * content index. Answers are buffered in memory and written only by
 * `finish()`; leaving without finishing writes nothing.
 */
export function useLesson(id: string) {
  const content = useContent();
  const bundle: Bundle = id.startsWith('tbcl') ? 'taiwan' : 'mainland';
  const strokes = useStrokeData();
  const speech = useSpeech();

  const target = ref<Target | null>(null);
  const exercises = ref<Exercise[]>([]);
  const position = ref(0);
  const answers = ref<Answer[]>([]);
  const loading = ref(true);
  const finished = ref(false);
  const missing = ref(false);
  let startedAt = Date.now();
  let shownAt = Date.now();

  const current = computed(() => exercises.value[position.value] ?? null);
  const done = computed(() => exercises.value.length > 0 && position.value >= exercises.value.length);

  async function strokeSet(words: Word[]): Promise<Set<string>> {
    const chars = [...new Set(words.flatMap((w) => [...w.hanzi]))];
    const loaded = await Promise.all(chars.map(async (ch) => ((await strokes.load(ch)) ? ch : null)));
    return new Set(loaded.filter((ch): ch is string => ch !== null));
  }

  async function start(): Promise<void> {
    loading.value = true;
    missing.value = false;
    try {
      await content.loadIndex(bundle);
      const index = content.index.value;
      const level = index?.levels.find((l) => l.lessons.some((x) => x.id === id) || l.units.some((u) => writingId(u.id) === id));
      if (!level) {
        missing.value = true;
        return;
      }
      const levelWords = await content.levelWords(bundle, level.level);
      const byId = new Map(levelWords.map((w) => [w.id, w]));
      const wordsOf = (ids: string[]) => ids.map((wid) => byId.get(wid)).filter((w): w is Word => w !== undefined);
      startedAt = Date.now();
      const rng = seededRng(id + startedAt);

      const lesson = level.lessons.find((l) => l.id === id);
      if (lesson) {
        const words = wordsOf(lesson.wordIds);
        const withStrokes = await strokeSet(words);
        await speech.ready;
        target.value = { kind: 'lesson', level, lesson, words };
        exercises.value = buildExercises(words, levelWords, rng, {
          listening: speech.supported.value,
          writing: writingCharacters(words, (ch) => withStrokes.has(ch)).length > 0,
        });
      } else {
        const unit = level.units.find((u) => writingId(u.id) === id)!;
        const lessonIds = new Set(unit.lessonIds);
        const words = wordsOf(level.lessons.filter((l) => lessonIds.has(l.id)).flatMap((l) => l.wordIds));
        const withStrokes = await strokeSet(words);
        const writable = new Set(writingCharacters(words, (ch) => withStrokes.has(ch)).map((w) => w.wordId));
        target.value = { kind: 'writing', level, unit, words };
        exercises.value = words
          .filter((w) => writable.has(w.id))
          .map((w) => ({ kind: 'writing' as const, wordId: w.id, prompt: w.readings[0]?.meanings[0] ?? '', answer: w.hanzi }));
      }
      position.value = 0;
      answers.value = [];
      shownAt = Date.now();
    } finally {
      loading.value = false;
    }
  }

  /** Records the answer to the current exercise and moves on. */
  function answer(right: boolean): void {
    const exercise = current.value;
    if (!exercise) return;
    const at = Date.now();
    answers.value.push({ wordId: exercise.wordId, exercise: exercise.kind, right, at, durationMs: at - shownAt });
    position.value += 1;
    shownAt = at;
  }

  /** Writes the cards, reviews and progress in one go, then refreshes the due counts. */
  async function finish(): Promise<void> {
    const t = target.value;
    if (!t || finished.value) return;
    const now = Date.now();
    const settings = await loadSettings();
    const scheduler = schedulerFor(settings.algorithm);
    const schedulerSettings = { desiredRetention: settings.desiredRetention, maxInterval: settings.maxInterval };
    if (t.kind === 'lesson') {
      await completeLesson({
        bundle,
        level: t.level,
        lesson: t.lesson,
        words: t.words,
        results: answers.value,
        durationMs: now - startedAt,
        now,
        scheduler,
        settings: schedulerSettings,
      });
    } else {
      const withStrokes = await strokeSet(t.words);
      await completeWriting({
        bundle,
        level: t.level,
        unit: t.unit,
        words: t.words,
        results: answers.value.map(({ wordId, right, at, durationMs }) => ({ wordId, right, at, durationMs })),
        now,
        scheduler,
        settings: schedulerSettings,
        hasStrokes: (ch) => withStrokes.has(ch),
      });
    }
    finished.value = true;
    await refreshDueCounts();
  }

  return { target, exercises, current, position, answers, loading, missing, done, finished, error: content.error, start, answer, finish };
}

