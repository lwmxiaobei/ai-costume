import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLocale } from '../src/i18n.js';
import { localizeKeywords } from '../scripts/localize-keywords.mjs';

test('已保存的手动选择优先于浏览器语言', () => {
  assert.equal(resolveLocale('ja', ['zh-CN', 'en-US']), 'ja');
  assert.equal(resolveLocale('zh-TW', ['en-US']), 'zh-TW');
});

test('识别中文地区和文字变体，显式文字变体优先于地区', () => {
  for (const language of ['zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant', 'zh-Hant-CN']) {
    assert.equal(resolveLocale(null, [language]), 'zh-TW');
  }
  for (const language of ['zh', 'zh-CN', 'zh-SG', 'zh-Hans', 'zh-Hans-HK']) {
    assert.equal(resolveLocale(null, [language]), 'zh-CN');
  }
});

test('按浏览器偏好选择首个支持的语言，未知选择回退到简体中文', () => {
  assert.equal(resolveLocale(null, ['fr-FR', 'en-GB', 'ja-JP']), 'en');
  assert.equal(resolveLocale('invalid', ['de-DE', 'ja-JP', 'en']), 'ja');
  assert.equal(resolveLocale(null, ['fr-FR']), 'zh-CN');
  assert.equal(resolveLocale(null, []), 'zh-CN');
});

test('颜色、服装和内搭说明翻译完整，不拆散英文短语', () => {
  const result = localizeKeywords('男装 春 海军蓝棉质哈灵顿短夹克 内搭奶油白薄棉圆领T恤，外层自然打开');
  assert.deepEqual(result.en, ['Menswear', 'Spring', 'navy cotton Harrington jacket', 'open outer layer over a cream white lightweight cotton crew neck T shirt']);
  assert.equal(result['zh-TW'][2], '海軍藍棉質哈靈頓短夾克');
  assert.equal(result.ja[2], 'ネイビーのコットンのハリントンジャケット');
  assert(result.ja[3].includes('クリームホワイト'));
});
