/**
 * The radicals (部首) a beginner meets most, in their traditional forms, each
 * with the forms it takes inside a character and a few characters filed
 * under it in a dictionary. Numbers are the Kangxi radical numbers.
 */

export type RadicalGroup = 'basics' | 'people' | 'nature' | 'living' | 'home' | 'actions';

/** Where a component form sits in the characters that carry it. */
export type RadicalPosition = 'left' | 'right' | 'top' | 'bottom' | 'wrap';

export interface RadicalVariant {
  form: string;
  position: RadicalPosition;
}

export interface RadicalExample {
  hanzi: string;
  pinyin: string;
  meaning: string;
}

export interface Radical {
  /** Kangxi number, 1 to 214. */
  number: number;
  radical: string;
  variants: RadicalVariant[];
  strokes: number;
  pinyin: string;
  meaning: string;
  group: RadicalGroup;
  examples: RadicalExample[];
}

export const RADICAL_GROUPS: { id: RadicalGroup; label: string }[] = [
  { id: 'basics', label: 'Basics' },
  { id: 'people', label: 'People and body' },
  { id: 'nature', label: 'Nature' },
  { id: 'living', label: 'Plants and animals' },
  { id: 'home', label: 'Home and objects' },
  { id: 'actions', label: 'Actions and places' },
];

type ExampleRow = [hanzi: string, pinyin: string, meaning: string];

function r(
  number: number,
  radical: string,
  strokes: number,
  pinyin: string,
  meaning: string,
  group: RadicalGroup,
  examples: ExampleRow[],
  variants: RadicalVariant[] = [],
): Radical {
  return { number, radical, variants, strokes, pinyin, meaning, group, examples: examples.map(([hanzi, pinyin, meaning]) => ({ hanzi, pinyin, meaning })) };
}

const left = (form: string): RadicalVariant => ({ form, position: 'left' });
const right = (form: string): RadicalVariant => ({ form, position: 'right' });
const top = (form: string): RadicalVariant => ({ form, position: 'top' });
const bottom = (form: string): RadicalVariant => ({ form, position: 'bottom' });

export const RADICALS: Radical[] = [
  // Basics
  r(1, '一', 1, 'yī', 'one', 'basics', [['三', 'sān', 'three'], ['上', 'shàng', 'up, on'], ['下', 'xià', 'down, under']]),
  r(24, '十', 2, 'shí', 'ten', 'basics', [['千', 'qiān', 'thousand'], ['午', 'wǔ', 'noon'], ['半', 'bàn', 'half']]),
  r(29, '又', 2, 'yòu', 'right hand, again', 'basics', [['友', 'yǒu', 'friend'], ['取', 'qǔ', 'to take'], ['受', 'shòu', 'to receive']]),
  r(30, '口', 3, 'kǒu', 'mouth', 'basics', [['吃', 'chī', 'to eat'], ['喝', 'hē', 'to drink'], ['叫', 'jiào', 'to call']]),
  r(31, '囗', 3, 'wéi', 'enclosure', 'basics', [['國', 'guó', 'country'], ['回', 'huí', 'to return'], ['園', 'yuán', 'garden']]),
  r(37, '大', 3, 'dà', 'big', 'basics', [['天', 'tiān', 'sky, day'], ['太', 'tài', 'too, very'], ['夫', 'fū', 'man, husband']]),
  r(42, '小', 3, 'xiǎo', 'small', 'basics', [['少', 'shǎo', 'few, little'], ['尖', 'jiān', 'pointed']]),
  r(41, '寸', 3, 'cùn', 'inch, hand', 'basics', [['對', 'duì', 'correct, towards'], ['封', 'fēng', 'measure word for letters'], ['射', 'shè', 'to shoot']]),
  r(48, '工', 3, 'gōng', 'work', 'basics', [['左', 'zuǒ', 'left'], ['差', 'chà', 'poor, lacking'], ['巧', 'qiǎo', 'skilful']]),
  r(70, '方', 4, 'fāng', 'square, direction', 'basics', [['旅', 'lǚ', 'to travel'], ['旁', 'páng', 'side'], ['族', 'zú', 'clan, group']]),

  // People and body
  r(9, '人', 2, 'rén', 'person', 'people', [['你', 'nǐ', 'you'], ['他', 'tā', 'he'], ['住', 'zhù', 'to live']], [left('亻')]),
  r(38, '女', 3, 'nǚ', 'woman', 'people', [['媽', 'mā', 'mum'], ['好', 'hǎo', 'good'], ['姐', 'jiě', 'older sister']]),
  r(39, '子', 3, 'zǐ', 'child', 'people', [['字', 'zì', 'character'], ['學', 'xué', 'to study'], ['孩', 'hái', 'child']]),
  r(61, '心', 4, 'xīn', 'heart', 'people', [['想', 'xiǎng', 'to think, to want'], ['忙', 'máng', 'busy'], ['快', 'kuài', 'fast']], [left('忄')]),
  r(64, '手', 4, 'shǒu', 'hand', 'people', [['打', 'dǎ', 'to hit, to play'], ['找', 'zhǎo', 'to look for'], ['拿', 'ná', 'to take']], [left('扌')]),
  r(19, '力', 2, 'lì', 'strength', 'people', [['動', 'dòng', 'to move'], ['助', 'zhù', 'to help'], ['加', 'jiā', 'to add']]),
  r(109, '目', 5, 'mù', 'eye', 'people', [['看', 'kàn', 'to look'], ['眼', 'yǎn', 'eye'], ['睡', 'shuì', 'to sleep']]),
  r(128, '耳', 6, 'ěr', 'ear', 'people', [['聽', 'tīng', 'to listen'], ['聞', 'wén', 'to smell, to hear'], ['職', 'zhí', 'job, duty']]),
  r(130, '肉', 6, 'ròu', 'meat, flesh', 'people', [['腳', 'jiǎo', 'foot'], ['胖', 'pàng', 'fat'], ['能', 'néng', 'can, able']], [left('月')]),
  r(157, '足', 7, 'zú', 'foot', 'people', [['跑', 'pǎo', 'to run'], ['跳', 'tiào', 'to jump'], ['路', 'lù', 'road']], [left('⻊')]),
  r(158, '身', 7, 'shēn', 'body', 'people', [['躺', 'tǎng', 'to lie down'], ['躲', 'duǒ', 'to hide']]),
  r(181, '頁', 9, 'yè', 'head, page', 'people', [['題', 'tí', 'topic, question'], ['顏', 'yán', 'colour, face'], ['頭', 'tóu', 'head']]),
  r(147, '見', 7, 'jiàn', 'to see', 'people', [['視', 'shì', 'to look at'], ['覺', 'jué', 'to feel'], ['親', 'qīn', 'relative, close']]),
  r(149, '言', 7, 'yán', 'speech, words', 'people', [['說', 'shuō', 'to speak'], ['話', 'huà', 'words, speech'], ['謝', 'xiè', 'to thank']]),
  r(156, '走', 7, 'zǒu', 'to walk', 'people', [['起', 'qǐ', 'to rise'], ['趣', 'qù', 'interest'], ['超', 'chāo', 'to exceed']]),

  // Nature
  r(72, '日', 4, 'rì', 'sun, day', 'nature', [['明', 'míng', 'bright'], ['時', 'shí', 'time'], ['早', 'zǎo', 'early, morning']]),
  r(74, '月', 4, 'yuè', 'moon, month', 'nature', [['朋', 'péng', 'friend'], ['有', 'yǒu', 'to have'], ['期', 'qī', 'period']]),
  r(85, '水', 4, 'shuǐ', 'water', 'nature', [['河', 'hé', 'river'], ['海', 'hǎi', 'sea'], ['洗', 'xǐ', 'to wash']], [left('氵')]),
  r(15, '冫', 2, 'bīng', 'ice', 'nature', [['冷', 'lěng', 'cold'], ['冰', 'bīng', 'ice'], ['凍', 'dòng', 'to freeze']]),
  r(86, '火', 4, 'huǒ', 'fire', 'nature', [['熱', 'rè', 'hot'], ['燈', 'dēng', 'lamp'], ['煮', 'zhǔ', 'to boil']], [bottom('灬')]),
  r(32, '土', 3, 'tǔ', 'earth, soil', 'nature', [['地', 'dì', 'ground'], ['在', 'zài', 'at, in'], ['坐', 'zuò', 'to sit']]),
  r(46, '山', 3, 'shān', 'mountain', 'nature', [['島', 'dǎo', 'island'], ['岸', 'àn', 'shore'], ['峰', 'fēng', 'peak']]),
  r(112, '石', 5, 'shí', 'stone', 'nature', [['碗', 'wǎn', 'bowl'], ['破', 'pò', 'broken'], ['研', 'yán', 'to research']]),
  r(173, '雨', 8, 'yǔ', 'rain', 'nature', [['雪', 'xuě', 'snow'], ['電', 'diàn', 'electricity'], ['雲', 'yún', 'cloud']], [top('⻗')]),
  r(182, '風', 9, 'fēng', 'wind', 'nature', [['颱', 'tái', 'typhoon'], ['飄', 'piāo', 'to float, to flutter']]),
  r(102, '田', 5, 'tián', 'field', 'nature', [['男', 'nán', 'male'], ['界', 'jiè', 'boundary, world'], ['畫', 'huà', 'to draw']]),
  r(167, '金', 8, 'jīn', 'metal, gold', 'nature', [['錢', 'qián', 'money'], ['銀', 'yín', 'silver'], ['鐘', 'zhōng', 'clock, bell']]),
  r(96, '玉', 5, 'yù', 'jade', 'nature', [['玩', 'wán', 'to play'], ['球', 'qiú', 'ball'], ['現', 'xiàn', 'now, to appear']], [left('王')]),

  // Plants and animals
  r(75, '木', 4, 'mù', 'tree, wood', 'living', [['樹', 'shù', 'tree'], ['林', 'lín', 'forest'], ['桌', 'zhuō', 'table']]),
  r(140, '艸', 6, 'cǎo', 'grass, plant', 'living', [['茶', 'chá', 'tea'], ['花', 'huā', 'flower'], ['草', 'cǎo', 'grass']], [top('艹')]),
  r(118, '竹', 6, 'zhú', 'bamboo', 'living', [['筆', 'bǐ', 'pen'], ['第', 'dì', 'ordinal prefix'], ['答', 'dá', 'to answer']], [top('⺮')]),
  r(115, '禾', 5, 'hé', 'grain', 'living', [['秋', 'qiū', 'autumn'], ['種', 'zhǒng', 'kind, type'], ['科', 'kē', 'subject']]),
  r(119, '米', 6, 'mǐ', 'rice', 'living', [['糖', 'táng', 'sugar'], ['粉', 'fěn', 'powder'], ['精', 'jīng', 'refined, essence']]),
  r(93, '牛', 4, 'niú', 'cow', 'living', [['物', 'wù', 'thing'], ['特', 'tè', 'special'], ['牧', 'mù', 'to herd']], [left('牜')]),
  r(94, '犬', 4, 'quǎn', 'dog', 'living', [['狗', 'gǒu', 'dog'], ['獨', 'dú', 'alone'], ['猜', 'cāi', 'to guess']], [left('犭')]),
  r(123, '羊', 6, 'yáng', 'sheep', 'living', [['美', 'měi', 'beautiful'], ['群', 'qún', 'group, crowd'], ['義', 'yì', 'justice, meaning']]),
  r(187, '馬', 10, 'mǎ', 'horse', 'living', [['騎', 'qí', 'to ride'], ['驗', 'yàn', 'to test'], ['驚', 'jīng', 'to startle']]),
  r(195, '魚', 11, 'yú', 'fish', 'living', [['鮮', 'xiān', 'fresh'], ['鯨', 'jīng', 'whale']]),
  r(196, '鳥', 11, 'niǎo', 'bird', 'living', [['鴨', 'yā', 'duck'], ['鵝', 'é', 'goose'], ['鳳', 'fèng', 'phoenix']]),
  r(172, '隹', 8, 'zhuī', 'short-tailed bird', 'living', [['雞', 'jī', 'chicken'], ['難', 'nán', 'difficult'], ['雖', 'suī', 'although']]),
  r(142, '虫', 6, 'chóng', 'insect', 'living', [['蛋', 'dàn', 'egg'], ['蝦', 'xiā', 'shrimp'], ['蚊', 'wén', 'mosquito']]),

  // Home and objects
  r(40, '宀', 3, 'mián', 'roof', 'home', [['家', 'jiā', 'home, family'], ['室', 'shì', 'room'], ['安', 'ān', 'peaceful']]),
  r(53, '广', 3, 'yǎn', 'shelter', 'home', [['店', 'diàn', 'shop'], ['床', 'chuáng', 'bed'], ['廁', 'cè', 'toilet']]),
  r(169, '門', 8, 'mén', 'door, gate', 'home', [['開', 'kāi', 'to open'], ['間', 'jiān', 'room, between'], ['關', 'guān', 'to close']]),
  r(44, '尸', 3, 'shī', 'corpse, body', 'home', [['屋', 'wū', 'house'], ['尾', 'wěi', 'tail'], ['局', 'jú', 'office, bureau']]),
  r(116, '穴', 5, 'xuè', 'cave, hole', 'home', [['空', 'kōng', 'empty, sky'], ['窗', 'chuāng', 'window'], ['穿', 'chuān', 'to wear']]),
  r(50, '巾', 3, 'jīn', 'cloth', 'home', [['帽', 'mào', 'hat'], ['師', 'shī', 'teacher'], ['帶', 'dài', 'to bring, belt']]),
  r(120, '糸', 6, 'mì', 'silk, thread', 'home', [['紅', 'hóng', 'red'], ['給', 'gěi', 'to give'], ['紙', 'zhǐ', 'paper']], [left('糹')]),
  r(145, '衣', 6, 'yī', 'clothing', 'home', [['褲', 'kù', 'trousers'], ['襪', 'wà', 'socks'], ['表', 'biǎo', 'surface, watch']], [left('衤')]),
  r(108, '皿', 5, 'mǐn', 'dish, vessel', 'home', [['盤', 'pán', 'plate'], ['盒', 'hé', 'box'], ['盡', 'jìn', 'to exhaust']]),
  r(184, '食', 9, 'shí', 'food, to eat', 'home', [['飯', 'fàn', 'meal, rice'], ['餓', 'è', 'hungry'], ['館', 'guǎn', 'hall, restaurant']], [left('飠')]),
  r(164, '酉', 7, 'yǒu', 'wine jar', 'home', [['酒', 'jiǔ', 'alcohol'], ['醫', 'yī', 'medicine'], ['醒', 'xǐng', 'to wake up']]),
  r(154, '貝', 7, 'bèi', 'shell, money', 'home', [['買', 'mǎi', 'to buy'], ['賣', 'mài', 'to sell'], ['貴', 'guì', 'expensive']]),
  r(159, '車', 7, 'chē', 'vehicle', 'home', [['輛', 'liàng', 'measure word for vehicles'], ['輕', 'qīng', 'light'], ['較', 'jiào', 'to compare']]),
  r(137, '舟', 6, 'zhōu', 'boat', 'home', [['船', 'chuán', 'boat'], ['航', 'háng', 'to navigate'], ['般', 'bān', 'sort, kind']]),
  r(57, '弓', 3, 'gōng', 'bow', 'home', [['張', 'zhāng', 'measure word for flat things'], ['弟', 'dì', 'younger brother'], ['強', 'qiáng', 'strong']]),
  r(18, '刀', 2, 'dāo', 'knife', 'home', [['到', 'dào', 'to arrive'], ['別', 'bié', 'other, do not'], ['前', 'qián', 'front, before']], [right('刂')]),
  r(62, '戈', 4, 'gē', 'spear', 'home', [['我', 'wǒ', 'I, me'], ['或', 'huò', 'or'], ['戰', 'zhàn', 'war']]),

  // Actions and places
  r(162, '辵', 7, 'chuò', 'walk, movement', 'actions', [['這', 'zhè', 'this'], ['還', 'hái', 'still, also'], ['週', 'zhōu', 'week']], [{ form: '辶', position: 'wrap' }]),
  r(60, '彳', 3, 'chì', 'step', 'actions', [['很', 'hěn', 'very'], ['往', 'wǎng', 'towards'], ['後', 'hòu', 'after, behind']]),
  r(144, '行', 6, 'xíng', 'to go, crossroads', 'actions', [['街', 'jiē', 'street'], ['術', 'shù', 'skill, art'], ['衛', 'wèi', 'to guard']]),
  r(77, '止', 4, 'zhǐ', 'to stop', 'actions', [['正', 'zhèng', 'straight, correct'], ['步', 'bù', 'step'], ['歲', 'suì', 'years of age']]),
  r(66, '攴', 4, 'pū', 'to tap, action', 'actions', [['教', 'jiāo', 'to teach'], ['數', 'shù', 'number'], ['收', 'shōu', 'to receive']], [right('攵')]),
  r(76, '欠', 4, 'qiàn', 'to yawn, lack', 'actions', [['歌', 'gē', 'song'], ['歡', 'huān', 'joyful'], ['次', 'cì', 'time, occurrence']]),
  r(117, '立', 5, 'lì', 'to stand', 'actions', [['站', 'zhàn', 'to stand, station'], ['童', 'tóng', 'child'], ['競', 'jìng', 'to compete']]),
  r(113, '示', 5, 'shì', 'altar, spirit', 'actions', [['禮', 'lǐ', 'ceremony, gift'], ['祝', 'zhù', 'to wish'], ['福', 'fú', 'good fortune']], [left('礻')]),
  r(104, '疒', 5, 'nè', 'sickness', 'actions', [['病', 'bìng', 'illness'], ['痛', 'tòng', 'pain'], ['瘦', 'shòu', 'thin']]),
  r(106, '白', 5, 'bái', 'white', 'actions', [['百', 'bǎi', 'hundred'], ['的', 'de', 'possessive particle'], ['皇', 'huáng', 'emperor']]),
  r(163, '邑', 7, 'yì', 'city', 'actions', [['都', 'dōu', 'all'], ['部', 'bù', 'part'], ['郵', 'yóu', 'post, mail']], [right('阝')]),
  r(170, '阜', 8, 'fù', 'mound, hill', 'actions', [['院', 'yuàn', 'courtyard'], ['附', 'fù', 'to attach'], ['陽', 'yáng', 'sun']], [left('阝')]),
];
