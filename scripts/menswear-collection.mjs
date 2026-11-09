// 准备男装图片清单、接收内置生图结果，并更新本地浏览页。
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, readdirSync, renameSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'output/menswear-1200');
const PLAN = join(OUT, 'plan.json');
const CATEGORIES = [
  ['春', '春', 'SPR'], ['夏', '夏', 'SUM'], ['秋', '秋', 'AUT'], ['冬', '冬', 'WIN'],
  ['内衣', 'ランジェリー', 'LNG'], ['派对', 'パーティ', 'PTY'], ['泳装', '水着', 'SWM'], ['性感', 'セクシー', 'SXY'],
];
const PALETTES = [
  ['海军蓝', '米白', '浅卡其', '深棕'], ['燕麦米', '浅蓝', '藏青', '棕'],
  ['鼠尾草绿', '白', '沙米', '米白'], ['烟草棕', '奶油白', '深靛蓝', '黑'],
  ['炭灰', '浅灰', '黑', '黑'], ['酒红', '象牙白', '中灰', '深棕'],
  ['奶油白', '浅灰蓝', '石灰', '白'], ['深橄榄绿', '米白', '咖啡棕', '棕'],
  ['雾霾蓝', '白', '深灰', '黑'], ['沙褐', '墨绿', '米白', '烟草棕'],
  ['黑', '深灰', '浅灰', '黑'], ['焦糖棕', '浅蓝', '深褐', '棕'],
  ['灰紫', '奶油白', '藏青', '黑'], ['深蓝绿', '浅米', '灰褐', '深棕'],
  ['陶土红', '米白', '深蓝', '米白'], ['银灰', '黑', '炭灰', '黑'],
];
const catalog = {
  '春': {
    tops: ['棉质哈灵顿短夹克', 'V领羊毛针织开衫', '无结构棉麻单西', '轻薄单排扣风衣', '牛仔布卡车司机夹克', '短款麂皮翻领夹克', '棒球领薄款飞行夹克', '圆领绞花针织衫', '棉质工装衬衫外套', '薄款教练夹克', '立领细灯芯绒夹克', '半拉链薄针织衫', '无领粗花呢男士短外套', '细针织翻领Polo衫', '轻薄尼龙防风夹克', '斜纹棉短款猎装', '轻薄连帽拉链卫衣', '青果领针织开衫', '衬衫领棉质马甲', '薄款菱格绗缝背心'],
    layers: ['{b}牛津纺衬衫', '{b}纯棉圆领T恤', '{b}细横条纹长袖T恤', '{b}亨利领薄款打底衫', '{b}立领棉麻衬衫'],
    bottoms: ['{c}有褶直筒休闲长裤', '{c}宽松锥形棉裤', '{c}直筒牛仔裤', '{c}棉麻阔腿长裤', '{c}单褶九分西裤', '{c}简洁直筒工装裤', '{c}窄直筒斜纹棉裤'],
    shoes: ['{d}皮质便士乐福鞋', '{d}低帮皮质板鞋', '{d}麂皮德比鞋', '{d}帆布运动鞋', '{d}沙漠靴', '{d}拼接复古慢跑鞋'],
  },
  '夏': {
    tops: ['古巴领亚麻短袖衬衫', '珠地棉短袖Polo衫', '粗细针撞纹短袖针织衫', '纯棉厚磅落肩T恤', '泡泡纱短袖衬衫', '立领棉麻短袖衬衫', '镂空组织短袖针织开衫', '竹节棉亨利领短袖衫', '天丝垂感短袖衬衫', '薄牛仔布短袖衬衫', '棉质拉链翻领短袖衫', '简洁双口袋短袖工装衬衫', '轻薄运动网眼短袖上衣', '度假植物印花短袖衬衫', '拼接撞色复古棒球衫', '法式细条纹船领短袖衫', '丝棉混纺短袖针织Polo衫', '纯棉无袖宽肩背心', '细条纹棉质短袖衬衫', '无领盘扣亚麻短袖衫'],
    layers: ['只穿上装，领口和袖口自然中空', '内搭{b}薄棉圆领T恤，外层自然打开', '内搭{b}宽肩罗纹背心，外层自然打开', '上装单穿，领口保持整齐'],
    bottoms: ['{c}百慕大棉质短裤', '{c}亚麻直筒长裤', '{c}轻薄宽松九分裤', '{c}轻薄尼龙工装短裤', '{c}有褶西装短裤', '{c}宽直筒薄牛仔裤', '{c}抽绳棉麻休闲长裤', '{c}泡泡纱短裤'],
    shoes: ['{d}低帮帆布鞋配短袜', '{d}编织皮质凉鞋', '{d}麂皮乐福鞋配同色隐形袜', '{d}低帮皮质板鞋配短袜', '{d}双搭扣皮质凉拖', '{d}轻便帆船鞋配隐形袜'],
  },
  '秋': {
    tops: ['斜纹棉三口袋工装夹克', '灯芯绒翻领短夹克', '麂皮拉链飞行夹克', '植鞣皮翻领短夹克', '格纹羊毛衬衫外套', '粗针绞花圆领毛衣', '宽罗纹针织开衫', '斜纹呢单排扣休闲西装', '棉质长款风衣', '毛圈布半拉链卫衣', '厚牛仔布拼接夹克', '复古棒球领夹克', '山系连帽软壳夹克', '无领羊毛混纺马甲', '翻领麂皮猎装', '翻领纽扣粗针针织衫', '条纹罗纹立领针织衫', '绗缝轻薄棉夹克', '中式立领棉麻外套', '翻领宽松开襟针织背心'],
    layers: ['{b}厚磅圆领T恤', '{b}牛津纺衬衫', '{b}细针织圆领毛衣', '{b}亨利领长袖衫', '{b}薄款高领针织衫', '{b}纯色套头连帽卫衣'],
    bottoms: ['{c}直筒原色牛仔裤', '{c}宽松斜纹棉工装裤', '{c}有褶羊毛西裤', '{c}细灯芯绒直筒裤', '{c}厚棉锥形休闲长裤', '{c}宽腿粗花呢长裤', '{c}直筒重磅棉休闲裤'],
    shoes: ['{d}系带工装皮靴', '{d}麂皮切尔西靴', '{d}厚底德比鞋', '{d}皮质低帮板鞋', '{d}复古慢跑鞋', '{d}麂皮沙漠靴'],
  },
  '冬': {
    tops: ['中长款单排扣羊毛大衣', '双排扣粗花呢海军大衣', '短款剪羊毛翻领夹克', '有帽中长羽绒外套', '立领短款羽绒夹克', '连帽厚棉派克大衣', '牛角扣毛呢大衣', '羊羔绒衬里牛仔夹克', '羊毛混纺绗缝外套', '长款羊毛浴袍领系带大衣', '皮毛一体飞行夹克', '厚实绞花青果领开衫', '羊毛格纹厚衬衫夹克', '复古灯芯绒夹棉夹克', '挺括厚呢立领短大衣', '带帽羊毛混纺达夫外套', '绒面保暖拉链夹克', '极简防风保暖机能外套', '毛呢长款无袖叠穿马甲', '拼接羊羔绒保暖摇粒绒夹克'],
    layers: ['{b}厚实高领羊毛针织衫', '{b}粗针圆领毛衣搭配同色衬衫领', '{b}厚棉连帽卫衣', '{b}半拉链羊毛针织衫', '{b}费尔岛几何纹针织衫', '{b}绞花羊毛毛衣搭配棉质衬衫'],
    bottoms: ['{c}直筒羊毛西裤', '{c}厚灯芯绒宽腿裤', '{c}厚牛仔布直筒裤', '{c}加厚斜纹棉工装裤', '{c}毛呢有褶阔腿长裤', '{c}厚针织锥形长裤', '{c}细格纹厚羊毛西裤'],
    shoes: ['{d}皮质切尔西短靴', '{d}系带厚底皮靴', '{d}翻毛皮保暖短靴', '{d}厚底牛津皮鞋', '{d}防水拼接户外短靴', '{d}皮质高帮运动鞋'],
  },
  '内衣': {
    tops: ['纯棉圆领短袖贴身内衣', '细罗纹宽肩男士内衣背心', '棉莫代尔亨利领内衣上装', '无袖运动压缩内衣上装', '长袖圆领保暖内衣上装', '长袖V领羊毛保暖内衣上装', '丝质翻领短袖睡衣上装', '缎面滚边长袖睡衣上装', '亚麻立领长袖家居上装', '棉质短袖开襟睡衣上装', '轻薄华夫格浴袍', '纯棉长款家居晨袍', '天丝短款系带睡袍', '棉质长袖亨利领家居上衣', '无缝短袖速干运动内衣', '粗罗纹半袖男士内衣', '绒面长袖家居上装', '细条纹棉质长袖睡衣上装'],
    layers: ['领口、袖口和衣摆自然中空，保持柔软立体体积', '上装与下装构成完整配套家居套装，版型为成年男性', '各件服装保持正常穿着位置，仅展示纺织品'],
    bottoms: ['{c}纯棉平角内裤', '{c}莫代尔中腰四角内裤', '{c}宽松平角睡眠短裤', '{c}细棉针织家居长裤', '{c}抽绳睡眠七分裤', '{c}棉质睡衣长裤', '{c}轻薄家居短裤'],
    shoes: [],
  },
  '派对': {
    tops: ['缎面披肩领单排扣礼服西装', '丝绒尖驳领晚宴西装', '缎面拼领双排扣礼服外套', '提花暗纹修身派对西装', '流畅无领晚宴西装外套', '微光泽丝棉古巴领长袖衬衫', '复古绣花晚宴衬衫', '极简金属扣立领晚宴夹克', '挺括短款双排扣礼服夹克', '细密亮片装饰的男士晚宴夹克', '暗花锦缎立领礼服外套', '丝绒青果领男士礼服外套', '丝棉提花开领长袖衬衫', '复古高腰马甲礼服上装', '长款燕尾式男士晚宴礼服', '简洁白金纹理晚宴西装外套'],
    layers: ['{b}正式礼服衬衫配小号同色领结', '{b}细针织高领衫', '{b}丝质立领衬衫', '{b}打褶礼服衬衫搭配细领带', '{b}简洁缎面衬衫'],
    bottoms: ['{c}缎面侧条纹直筒礼服长裤', '{c}高腰有褶西装长裤', '{c}修身锥形礼服长裤', '{c}羊毛混纺阔腿西裤', '{c}无褶直筒礼服长裤'],
    shoes: ['{d}漆皮牛津礼鞋', '{d}丝绒乐福礼鞋', '{d}抛光双搭扣礼鞋', '{d}皮质切尔西靴'],
  },
  '泳装': {
    tops: ['简洁圆领短袖男士防晒泳衣', '立领长袖拉链防晒泳衣', '无袖运动泳衣背心', '短袖拉链冲浪泳衣', '长袖拼接男士防晒泳衣', '轻薄宽松海滩短袖罩衫', '古巴领透气度假罩衫', '无领长袖防晒罩衫', '前开襟薄款防晒外套', '拉链立领无袖泳衣', '翻领纽扣复古短袖防晒泳衣', '连帽长袖拉链防晒泳衣'],
    layers: ['仅展示泳装和度假服装，衣料保持自然空心形态', '泳装表面为真实弹力织物和细密车线', '完整成年男性泳装搭配，无人体或人台'],
    bottoms: ['{c}中长款抽绳沙滩泳裤', '{c}短款运动平角泳裤', '{c}及膝冲浪板裤', '{c}贴合型及膝竞技泳裤', '{c}侧条纹速干沙滩短裤', '{c}宽松复古短泳裤'],
    shoes: [],
  },
  '性感': {
    tops: ['半透明网眼长袖衬衫，里面叠穿不透的同色男士背心', '开领丝质男士长袖衬衫', '贴身短袖罗纹男士针织衫', '镂空针织短袖男士衬衫，里面叠穿不透的同色背心', '无袖皮质男士马甲', '金属拉链短款皮质夹克', '缎面青果领男士短外套', '金属环扣装饰修身长袖衬衫', '细蕾丝拼接男士衬衫，主要躯干区域使用不透面料', '拼接网眼短袖男士上衣，里面叠穿不透的同色背心', '深V开领丝绒男士衬衫', '不透面料的宽肩无袖丝棉背心', '不透缎面男士背心外搭简洁皮质肩带配饰', '光泽皮质男士无领马甲', '修身立领半拉链男士针织衫', '垂感缎面男士交叉领上衣'],
    layers: ['仅展示夜生活风格的服装设计，不展示身体', '上衣、裤装和鞋履保持连贯完整的成年男性穿搭', '面料褶皱自然，服装内部没有人体'],
    bottoms: ['{c}高腰修身直筒西裤', '{c}柔软皮质长裤', '{c}侧扣装饰直筒长裤', '{c}丝绒宽腿长裤', '{c}缎面垂感阔腿裤', '{c}简洁涂层牛仔长裤', '{c}金属侧链装饰西裤'],
    shoes: ['{d}尖头切尔西靴', '{d}抛光高帮皮靴', '{d}简洁系带皮鞋', '{d}金属搭扣皮质短靴', '{d}尖头乐福鞋'],
  },
};

const textures = ['纯色细纹面料', '克制的同色细条纹', '低对比细小几何暗纹', '细腻的人字纹肌理', '边缘小范围撞色包边', '低对比微型方格纹', '同色纵向组织纹理', '平整纯色与局部纹理拼接'];
const fill = (s, p) => s.replace(/\{([abcd])\}/g, (_, k) => p['abcd'.indexOf(k)]);
const hash = s => createHash('sha256').update(s).digest('hex');
const relativeImage = item => `images/${item.category}/${item.id}.png`;

function matchingBottoms(category, top, defaults) {
  if (category !== '内衣') return defaults;
  if (/睡衣|家居|浴袍|晨袍|睡袍/.test(top)) return ['{c}棉质睡衣长裤', '{c}宽松平角睡眠短裤', '{c}抽绳家居长裤', '{c}七分家居裤', '{c}柔软针织睡眠短裤'];
  if (/保暖/.test(top)) return ['{c}配套保暖内衣长裤', '{c}及膝保暖内衣裤', '{c}罗纹针织保暖长裤', '{c}羊毛混纺贴身长裤', '{c}中长款保暖内裤'];
  return defaults;
}

function prepare() {
  if (existsSync(PLAN)) throw new Error('清单已存在，请使用 status 或 next 继续。');
  const source = JSON.parse(readFileSync(join(ROOT, 'upstream/items.json'), 'utf8'));
  const categories = CATEGORIES.map(([name, upstream, code]) => {
    const sourceCount = source.filter(i => i['カテゴリ'] === upstream).length;
    const exact = sourceCount / source.length * 1200;
    return { name, code, sourceCount, target: Math.floor(exact), remainder: exact % 1 };
  });
  const left = 1200 - categories.reduce((sum, c) => sum + c.target, 0);
  [...categories].sort((a, b) => b.remainder - a.remainder).slice(0, left).forEach(c => c.target++);
  const items = [];
  for (const cat of categories) {
    const deck = catalog[cat.name];
    for (let i = 0; i < cat.target; i++) {
      const style = i % deck.tops.length;
      const round = Math.floor(i / deck.tops.length);
      const palette = PALETTES[(style * 3 + round) % PALETTES.length];
      const top = `${palette[0]}${deck.tops[style]}`;
      const layer = fill(deck.layers[(style + round) % deck.layers.length], palette);
      const bottoms = matchingBottoms(cat.name, top, deck.bottoms);
      const bottom = fill(bottoms[(style + round * 3) % bottoms.length], palette);
      const shoes = deck.shoes.length ? fill(deck.shoes[(style + round * 2) % deck.shoes.length], palette) : '';
      const texture = textures[(style + round) % textures.length];
      const description = [top, layer, bottom, shoes].filter(Boolean).join('；');
      const id = `MEN-${cat.code}-${String(i + 1).padStart(4, '0')}`;
      const prompt = [
        '用途：product-mockup，原创男士服饰集，逼真的高质量服装目录摄影。',
        `分类：${cat.name}。只生成一张独立图片，只有以下一套搭配：${description}。`,
        `上装表面细节：${texture}，保留该服装本身的合理材质。每件单品的剪裁、织纹、纽扣和接缝清晰真实。`,
        '场景与画面：1024×1536像素，2:3竖版，统一浅灰白无缝摄影棚背景，柔和棚拍光与很轻的接触阴影。正面居中，全部服装从顶部到鞋底完整呈现，主体占画面高度约85%。',
        '展示方式：隐形模特摄影。服装呈自然成年男性宽肩、平直腰线的三维穿着形态，完全没有人物或可见人台。领口袖口自然中空，只有衣料，没有头、脸、脖子、皮肤、手、腿、脚或人体局部。手臂自然下垂的位置只有衣袖。短裤和短袖露出位置保留空白，不能填入身体或人台。',
        ['内衣', '泳装'].includes(cat.name) ? '内衣、睡衣或泳装按合理比例完整展示，服装表面平顺，无人体轮廓细节。若为连体泳衣，下装结构融入连体设计，不能再叠穿一件裤子。没有指定鞋子时只展示这套衣服。' : '上衣、下装、鞋履在同一正常站姿的位置，组成一套完整穿搭，不要拆成多套或平铺单品。',
        '全部为原创无品牌男装。无文字、数字、标签、商标、水印、边框、衣架、支架，无额外道具，无拼图。',
      ].join('\n');
      items.push({ id, category: cat.name, name: `${cat.name}·${deck.tops[style].split('，')[0]} ${i + 1}`, description, keywords: `男装 ${cat.name} ${description.replaceAll('；', ' ')} ${texture}`, prompt, promptHash: hash(prompt), plannedImage: relativeImage({ id, category: cat.name }), order: i * categories.length + categories.indexOf(cat) });
    }
  }
  if (items.length !== 1200 || new Set(items.map(i => i.promptHash)).size !== 1200 || new Set(items.map(i => i.description)).size !== 1200) throw new Error('数量或搭配去重校验失败。');
  mkdirSync(join(OUT, 'results'), { recursive: true });
  mkdirSync(join(OUT, 'prompts'), { recursive: true });
  for (const item of items) {
    mkdirSync(join(OUT, 'images', item.category), { recursive: true });
    mkdirSync(join(OUT, 'thumbs', item.category), { recursive: true });
    writeFileSync(join(OUT, 'prompts', `${item.id}.txt`), item.prompt + '\n');
  }
  const plan = { version: 1, total: 1200, createdAt: new Date().toISOString(), engine: '内置 imagegen', sourceTotal: source.length, categories: categories.map(({ remainder, ...c }) => c), items: items.sort((a, b) => a.order - b.order) };
  writeFileSync(PLAN, JSON.stringify(plan, null, 2) + '\n');
  writeFileSync(join(OUT, 'README.md'), '# 男装服饰集 1200 张\n\n按女版现有分类与数量占比分配。新生成 1200 张，之前的五张预览单独保留。\n\n生成方式：内置 imagegen，每个编号调用一次。清单和提示词不等于生成完成，只有 results 中已保存的图片才计入完成数。\n\nplan.json 为完整计划，prompts 为逐图提示词，images 为分类原图，thumbs 为浏览缩略图，results 为逐图结果，failures 为生成失败的记录。index.html 为本地浏览页。\n\n命令：\n\n```sh\nnode scripts/menswear-collection.mjs status\nnode scripts/menswear-collection.mjs next 8\nnode scripts/menswear-collection.mjs refresh\n```\n');
  refresh();
}

function getPlan() { return JSON.parse(readFileSync(PLAN, 'utf8')); }
function writeAtomic(path, content) {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, content);
  renameSync(temporary, path);
}
function getResult(item) {
  const path = join(OUT, 'results', `${item.id}.json`);
  if (!existsSync(path)) return null;
  const result = JSON.parse(readFileSync(path, 'utf8'));
  return existsSync(join(OUT, result.image)) ? result : null;
}
function status() {
  const plan = getPlan();
  const categories = plan.categories.map(c => ({ category: c.name, target: c.target, completed: plan.items.filter(i => i.category === c.name && getResult(i)).length }));
  const completed = categories.reduce((n, c) => n + c.completed, 0);
  const failures = existsSync(join(OUT, 'failures')) ? readdirSync(join(OUT, 'failures')).filter(file => file.endsWith('.json') && !JSON.parse(readFileSync(join(OUT, 'failures', file), 'utf8')).resolvedAt).length : 0;
  return { target: plan.total, completed, remaining: plan.total - completed, categories, failures };
}

function record(id, source, revision = false) {
  const item = getPlan().items.find(i => i.id === id);
  if (!item) throw new Error('未知的图片编号。');
  if (getResult(item) && !revision) return getResult(item);
  const data = readFileSync(source);
  if (data.subarray(1, 4).toString() !== 'PNG') throw new Error('结果不是 PNG 图片。');
  const width = data.readUInt32BE(16), height = data.readUInt32BE(20);
  if (width * 3 !== height * 2) throw new Error(`图片比例不是 2:3：${width}×${height}`);
  const image = revision ? item.plannedImage.replace(/\.png$/, '-v2.png') : item.plannedImage;
  const file = join(OUT, image);
  if (revision && existsSync(file)) throw new Error('修订图片已存在，不能覆盖。');
  copyFileSync(source, file);
  writeFileSync(file.replace(/\.png$/, '.txt'), item.keywords + '\n');
  const thumb = `thumbs/${item.category}/${id}${revision ? '-v2' : ''}.webp`;
  execFileSync('cwebp', ['-quiet', '-q', '82', '-resize', '320', '0', '-metadata', 'none', file, '-o', join(OUT, thumb)]);
  const result = { id, category: item.category, image, thumbnail: thumb, source, width, height, sha256: hash(data), promptHash: item.promptHash, completedAt: new Date().toISOString(), engine: '内置 imagegen' };
  writeAtomic(join(OUT, 'results', `${id}.json`), JSON.stringify(result, null, 2) + '\n');
  const failurePath = join(OUT, 'failures', `${id}.json`);
  if (existsSync(failurePath)) {
    const failure = JSON.parse(readFileSync(failurePath, 'utf8'));
    failure.resolvedAt = new Date().toISOString();
    writeAtomic(failurePath, JSON.stringify(failure, null, 2) + '\n');
  }
  if (revision && existsSync(join(OUT, 'review.json'))) {
    const review = JSON.parse(readFileSync(join(OUT, 'review.json'), 'utf8'));
    for (const entry of review.items.filter(i => i.id === id)) {
      entry.status = 'completed';
      entry.revision = image;
    }
    writeFileSync(join(OUT, 'review.json'), JSON.stringify(review, null, 2) + '\n');
  }
  return result;
}

function refresh() {
  const plan = getPlan();
  const progress = status();
  const items = plan.items.flatMap(i => { const r = getResult(i); return r ? [{ id: i.id, category: i.category, name: i.name, description: i.description, image: r.image, thumbnail: r.thumbnail, prompt: `prompts/${i.id}.txt` }] : []; });
  if (new Set(items.map(i => getResult(i).sha256)).size !== items.length) throw new Error('发现重复图片文件。');
  writeFileSync(join(OUT, 'progress.json'), JSON.stringify(progress, null, 2) + '\n');
  writeFileSync(join(OUT, 'gallery-data.js'), `window.MENSWEAR = ${JSON.stringify({ progress, items })};\n`);
  writeFileSync(join(OUT, 'index.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>男装服饰集</title><style>body{margin:0;background:#f5f4f1;color:#262626;font:15px system-ui}header,main{max-width:1450px;margin:auto;padding:24px}h1{margin:0;font-size:28px}p{color:#666}nav{display:flex;gap:8px;flex-wrap:wrap}button{border:1px solid #d8d5ce;background:white;padding:9px 17px;border-radius:24px;cursor:pointer}button.active{background:#253b36;color:white}#grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:20px}article{background:white;border-radius:12px;overflow:hidden}article img{width:100%;aspect-ratio:2/3;object-fit:cover;display:block}article div{padding:12px}a{color:#365d51}article p{font-size:12px;margin:8px 0}small{color:#777}</style><header><h1>男装服饰集</h1><p id="status"></p><nav id="filters"></nav></header><main id="grid"></main><script src="gallery-data.js"></script><script>const d=window.MENSWEAR;let category='全部';document.querySelector('#status').textContent='已生成 '+d.progress.completed+' / '+d.progress.target+' 张。仅展示实际生成并保存的图片。';const nav=document.querySelector('#filters'),grid=document.querySelector('#grid');function render(){nav.replaceChildren();for(const c of ['全部',...d.progress.categories.map(c=>c.category)]){const b=document.createElement('button');b.textContent=c;b.className=category===c?'active':'';b.onclick=()=>{category=c;render()};nav.append(b)}grid.replaceChildren();for(const i of d.items.filter(i=>category==='全部'||i.category===category)){const a=document.createElement('article'),link=document.createElement('a'),img=document.createElement('img'),body=document.createElement('div'),label=document.createElement('strong'),desc=document.createElement('p'),prompt=document.createElement('a');link.href=i.image;link.target='_blank';img.src=i.thumbnail;img.alt=i.name;img.loading='lazy';link.append(img);label.textContent=i.id+' · '+i.category;desc.textContent=i.description;prompt.href=i.prompt;prompt.textContent='提示词';prompt.target='_blank';body.append(label,desc,prompt);a.append(link,body);grid.append(a)}}render();</script></html>`);
  return progress;
}

const [command = 'status', arg, source] = process.argv.slice(2);
if (command === 'prepare') prepare();
else if (command === 'status') console.log(JSON.stringify(status()));
else if (command === 'next') console.log(JSON.stringify(existsSync(join(OUT, 'stop-after-batch.flag')) ? [] : getPlan().items.filter(i => !getResult(i)).slice(0, Number(arg || 8)).map(({ id, category, prompt }) => ({ id, category, prompt }))));
else if (command === 'record') console.log(JSON.stringify(record(arg, source)));
else if (command === 'record-revision') console.log(JSON.stringify(record(arg, source, true)));
else if (command === 'align-swimwear') {
  const plan = getPlan();
  const reviewPath = join(OUT, 'review.json');
  const review = existsSync(reviewPath) ? JSON.parse(readFileSync(reviewPath, 'utf8')) : { items: [] };
  let revised = 0;
  for (const item of plan.items.filter(i => i.category === '泳装' && /连体泳衣/.test(i.description))) {
    const index = Number(item.id.split('-').at(-1)) - 1, deck = catalog['泳装'];
    const style = index % deck.tops.length, round = Math.floor(index / deck.tops.length);
    const palette = PALETTES[(style * 3 + round) % PALETTES.length];
    const parts = item.description.split('；');
    const previous = item.description;
    parts[0] = palette[0] + deck.tops[style];
    item.description = parts.join('；');
    item.keywords = item.keywords.replace(previous.replaceAll('；', ' '), item.description.replaceAll('；', ' '));
    item.prompt = item.prompt.replace(previous, item.description).replace('若为连体泳衣，下装结构融入连体设计，不能再叠穿一件裤子。', '');
    item.prompt += '\n这一套只有一件防晒上衣和一件泳裤，按同一正常站姿穿着位置展示，上衣和泳裤自然衔接，不额外补出连体衣或其他裤子。';
    item.promptHash = hash(item.prompt);
    writeFileSync(join(OUT, 'prompts', `${item.id}.txt`), item.prompt + '\n');
    if (getResult(item) && !review.items.some(i => i.id === item.id)) review.items.push({ id: item.id, reason: '连体泳衣和另一件泳裤同时出现，改为清晰的上下装搭配后重做', status: 'pending' });
    revised++;
  }
  if (new Set(plan.items.map(i => i.description)).size !== plan.total) throw new Error('修改后存在重复搭配。');
  writeFileSync(PLAN + '.next', JSON.stringify(plan, null, 2) + '\n');
  renameSync(PLAN + '.next', PLAN);
  writeFileSync(reviewPath, JSON.stringify(review, null, 2) + '\n');
  console.log(JSON.stringify({ revised, review: review.items }));
}
else if (command === 'align-underwear') {
  const plan = getPlan();
  let revised = 0;
  for (const item of plan.items.filter(i => i.category === '内衣')) {
    const number = Number(item.id.split('-').at(-1));
    if (number <= Number(arg || 10) && item.id !== 'MEN-LNG-0008') continue;
    if (getResult(item) && item.id !== 'MEN-LNG-0008') continue;
    const index = number - 1, deck = catalog['内衣'];
    const style = index % deck.tops.length, round = Math.floor(index / deck.tops.length);
    const palette = PALETTES[(style * 3 + round) % PALETTES.length];
    const parts = item.description.split('；');
    const bottoms = matchingBottoms('内衣', parts[0], deck.bottoms);
    const bottom = fill(bottoms[(style + round * 3) % bottoms.length], palette);
    if (bottom === parts[2]) continue;
    const previous = item.description;
    parts[2] = bottom;
    item.description = parts.join('；');
    item.keywords = item.keywords.replace(previous.replaceAll('；', ' '), item.description.replaceAll('；', ' '));
    item.prompt = item.prompt.replace(previous, item.description);
    if (/睡衣|家居|浴袍|晨袍|睡袍/.test(parts[0])) item.prompt += '\n只展示一套睡衣或家居服，上装与一件下装按正常穿着位置连接；不自动添加其他裤子或在旁边摆放内裤。';
    item.promptHash = hash(item.prompt);
    writeFileSync(join(OUT, 'prompts', `${item.id}.txt`), item.prompt + '\n');
    revised++;
  }
  if (new Set(plan.items.map(i => i.description)).size !== plan.total) throw new Error('修改后存在重复搭配。');
  writeFileSync(PLAN + '.next', JSON.stringify(plan, null, 2) + '\n');
  renameSync(PLAN + '.next', PLAN);
  writeFileSync(join(OUT, 'review.json'), JSON.stringify({ items: [{ id: 'MEN-LNG-0008', reason: '睡衣图旁边额外生成了一件内裤，需要重做', status: 'pending' }] }, null, 2) + '\n');
  console.log(JSON.stringify({ revised, review: ['MEN-LNG-0008'] }));
}
else if (command === 'refresh') console.log(JSON.stringify(refresh()));
else if (command === 'failure') {
  mkdirSync(join(OUT, 'failures'), { recursive: true });
  writeAtomic(join(OUT, 'failures', `${arg}.json`), JSON.stringify({ id: arg, error: source, at: new Date().toISOString() }, null, 2) + '\n');
} else throw new Error('未知命令。');
