import { describe, expect, it } from 'vitest';
import { simplifiedCharactersIn } from '~core/chinese/script';
import { SPEAKING_LESSONS, answerText, speakingLessonFor } from '~core/speaking';

const lines = SPEAKING_LESSONS.flatMap((lesson) => [lesson.title, ...lesson.questions.flatMap((q) => [q.prompt, ...q.answer])]);

describe('speaking lessons', () => {
  it('are traditional only', () => {
    expect(lines.flatMap((line) => simplifiedCharactersIn(line.hanzi))).toEqual([]);
  });

  it('give every line its pinyin and translation', () => {
    expect(lines.filter((line) => !line.hanzi.trim() || !line.pinyin.trim() || !line.translation.trim())).toEqual([]);
  });

  it('give every question a model answer', () => {
    expect(SPEAKING_LESSONS.flatMap((l) => l.questions).filter((q) => q.answer.length === 0)).toEqual([]);
  });

  it('have unique ids', () => {
    const ids = SPEAKING_LESSONS.flatMap((l) => [l.id, ...l.questions.map((q) => q.id)]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('answerText', () => {
  it('runs the sentences together', () => {
    expect(answerText({ answer: [{ hanzi: '我很好。', pinyin: '', translation: '' }, { hanzi: '你呢？', pinyin: '', translation: '' }] })).toBe('我很好。你呢？');
  });
});

describe('speakingLessonFor', () => {
  it('matches a deck lesson by name, ignoring case and spaces', () => {
    expect(speakingLessonFor(' lesson 5 ')?.id).toBe('lesson-5');
    expect(speakingLessonFor('Lesson 9')).toBeUndefined();
  });
});
