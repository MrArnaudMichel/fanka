/**
 * Speaking practice: a lesson's discussion questions, each with a model answer
 * to say aloud and compare against. Answers are split into sentences so each
 * one can be played and repeated on its own (shadowing).
 */

export interface SpokenLine {
  hanzi: string;
  /** Diacritic pinyin, read as written. */
  pinyin: string;
  translation: string;
}

export interface SpeakingQuestion {
  id: string;
  prompt: SpokenLine;
  answer: SpokenLine[];
}

export interface SpeakingLesson {
  id: string;
  /** The lesson as the textbook numbers it, e.g. "Lesson 5". */
  label: string;
  title: SpokenLine;
  questions: SpeakingQuestion[];
}

export const SPEAKING_LESSONS: SpeakingLesson[] = [
  {
    id: 'lesson-5',
    label: 'Lesson 5',
    title: { hanzi: '我的錢包在哪裡？', pinyin: 'Wǒ de qiánbāo zài nǎlǐ?', translation: 'Where is my wallet?' },
    questions: [
      {
        id: 'lesson-5-1',
        prompt: {
          hanzi: '你家有沒有貓還是狗？牠們喜歡在哪裡？做什麼？',
          pinyin: 'Nǐ jiā yǒu méiyǒu māo háishì gǒu? Tāmen xǐhuān zài nǎlǐ? Zuò shénme?',
          translation: 'Do you have a cat or a dog at home? Where do they like to be? What do they do?',
        },
        answer: [
          { hanzi: '我家沒有貓，也沒有狗。', pinyin: 'Wǒ jiā méiyǒu māo, yě méiyǒu gǒu.', translation: 'We have no cat and no dog at home.' },
          {
            hanzi: '我很喜歡動物，可是我常常不在家。',
            pinyin: 'Wǒ hěn xǐhuān dòngwù, kěshì wǒ chángcháng bú zài jiā.',
            translation: 'I really like animals, but I am often not at home.',
          },
          {
            hanzi: '我朋友家有一隻狗，牠常常在沙發上睡覺。',
            pinyin: 'Wǒ péngyǒu jiā yǒu yì zhī gǒu, tā chángcháng zài shāfā shàng shuìjiào.',
            translation: 'My friend has a dog; it often sleeps on the sofa.',
          },
        ],
      },
      {
        id: 'lesson-5-2',
        prompt: { hanzi: '你的錢包在哪裡？', pinyin: 'Nǐ de qiánbāo zài nǎlǐ?', translation: 'Where is your wallet?' },
        answer: [
          { hanzi: '我的錢包在我的背包裡面。', pinyin: 'Wǒ de qiánbāo zài wǒ de bēibāo lǐmiàn.', translation: 'My wallet is in my backpack.' },
          {
            hanzi: '我在家的時候，錢包在桌子上，手機在錢包旁邊。',
            pinyin: 'Wǒ zài jiā de shíhòu, qiánbāo zài zhuōzi shàng, shǒujī zài qiánbāo pángbiān.',
            translation: 'When I am at home, my wallet is on the table, and my phone is next to it.',
          },
        ],
      },
      {
        id: 'lesson-5-3',
        prompt: {
          hanzi: '你的房間裡面有什麼東西？這些東西在什麼地方？',
          pinyin: 'Nǐ de fángjiān lǐmiàn yǒu shénme dōngxi? Zhèxiē dōngxi zài shénme dìfāng?',
          translation: 'What is in your room? Where are these things?',
        },
        answer: [
          { hanzi: '我的房間不大，可是很舒服。', pinyin: 'Wǒ de fángjiān bú dà, kěshì hěn shūfú.', translation: 'My room is not big, but it is comfortable.' },
          {
            hanzi: '裡面有一張床、一張桌子、一把椅子和一個書架。',
            pinyin: 'Lǐmiàn yǒu yì zhāng chuáng, yì zhāng zhuōzi, yì bǎ yǐzi hé yí ge shūjià.',
            translation: 'In it there is a bed, a desk, a chair and a bookshelf.',
          },
          {
            hanzi: '床在窗戶旁邊，桌子在床的前面。',
            pinyin: 'Chuáng zài chuānghù pángbiān, zhuōzi zài chuáng de qiánmiàn.',
            translation: 'The bed is next to the window, and the desk is in front of the bed.',
          },
          {
            hanzi: '書架上面有很多中文書。',
            pinyin: 'Shūjià shàngmiàn yǒu hěn duō Zhōngwén shū.',
            translation: 'There are lots of Chinese books on the bookshelf.',
          },
          { hanzi: '我的電腦在桌子上。', pinyin: 'Wǒ de diànnǎo zài zhuōzi shàng.', translation: 'My computer is on the desk.' },
        ],
      },
    ],
  },
  {
    id: 'lesson-6',
    label: 'Lesson 6',
    title: { hanzi: '週末去打網球吧！', pinyin: 'Zhōumò qù dǎ wǎngqiú ba!', translation: "Let's play tennis at the weekend!" },
    questions: [
      {
        id: 'lesson-6-1',
        prompt: {
          hanzi: '你運動嗎？喜歡做什麼運動？（為什麼不喜歡運動？）你覺得你做得怎麼樣？',
          pinyin: 'Nǐ yùndòng ma? Xǐhuān zuò shénme yùndòng? (Wèishénme bù xǐhuān yùndòng?) Nǐ juéde nǐ zuò de zěnmeyàng?',
          translation: 'Do you exercise? What sport do you like? (If not, why not?) How well do you think you do it?',
        },
        answer: [
          { hanzi: '我很喜歡運動，我最喜歡跑步。', pinyin: 'Wǒ hěn xǐhuān yùndòng, wǒ zuì xǐhuān pǎobù.', translation: 'I really like sport; running is my favourite.' },
          {
            hanzi: '我常常早上去公園跑步，週末也跟朋友一起跑。',
            pinyin: 'Wǒ chángcháng zǎoshàng qù gōngyuán pǎobù, zhōumò yě gēn péngyǒu yìqǐ pǎo.',
            translation: 'I often go running in the park in the morning, and at the weekend I run with friends too.',
          },
          {
            hanzi: '我覺得我跑得不錯，可是跑得不太快。',
            pinyin: 'Wǒ juéde wǒ pǎo de búcuò, kěshì pǎo de bú tài kuài.',
            translation: 'I think I run quite well, but not very fast.',
          },
          { hanzi: '我還在練習！', pinyin: 'Wǒ hái zài liànxí!', translation: 'I am still practising!' },
        ],
      },
      {
        id: 'lesson-6-2',
        prompt: { hanzi: '你覺得人應該運動嗎？為什麼？', pinyin: 'Nǐ juéde rén yīnggāi yùndòng ma? Wèishénme?', translation: 'Do you think people should exercise? Why?' },
        answer: [
          {
            hanzi: '我覺得人應該運動，因為運動對身體很好。',
            pinyin: 'Wǒ juéde rén yīnggāi yùndòng, yīnwèi yùndòng duì shēntǐ hěn hǎo.',
            translation: 'I think people should exercise, because exercise is good for the body.',
          },
          {
            hanzi: '常常運動的人比較健康，也比較快樂。',
            pinyin: 'Chángcháng yùndòng de rén bǐjiào jiànkāng, yě bǐjiào kuàilè.',
            translation: 'People who exercise often are healthier, and happier too.',
          },
          {
            hanzi: '工作很忙的時候，去跑步或是打球，心情會比較好。',
            pinyin: 'Gōngzuò hěn máng de shíhòu, qù pǎobù huòshì dǎ qiú, xīnqíng huì bǐjiào hǎo.',
            translation: 'When work is busy, going for a run or playing ball puts you in a better mood.',
          },
        ],
      },
      {
        id: 'lesson-6-3',
        prompt: { hanzi: '你的興趣是什麼？你做得怎麼樣？', pinyin: 'Nǐ de xìngqù shì shénme? Nǐ zuò de zěnmeyàng?', translation: 'What are your hobbies? How good are you at them?' },
        answer: [
          { hanzi: '我的興趣是跑步和看電影。', pinyin: 'Wǒ de xìngqù shì pǎobù hé kàn diànyǐng.', translation: 'My hobbies are running and watching films.' },
          {
            hanzi: '週末我常常去電影院看電影，也喜歡在家看。',
            pinyin: 'Zhōumò wǒ chángcháng qù diànyǐngyuàn kàn diànyǐng, yě xǐhuān zài jiā kàn.',
            translation: 'At the weekend I often go to the cinema, and I also like watching films at home.',
          },
          {
            hanzi: '我跑步跑得還不錯，可是看電影看得太多了！',
            pinyin: 'Wǒ pǎobù pǎo de hái búcuò, kěshì kàn diànyǐng kàn de tài duō le!',
            translation: 'I run fairly well, but I watch far too many films!',
          },
        ],
      },
    ],
  },
];

/** The whole model answer as one utterance, for playing it through. */
export function answerText(question: Pick<SpeakingQuestion, 'answer'>): string {
  return question.answer.map((line) => line.hanzi).join('');
}
