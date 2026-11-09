async (page) => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4174');
  await page.locator('.card').first().waitFor();
  const reports = [];
  const cases = [
    ['zh-CN', '男装服饰集', '商用', '重新上传', '海军蓝'],
    ['zh-TW', '男裝服飾集', '商用', '重新上傳', '海軍藍'],
    ['en', 'Menswear Gallery', 'commercial', 'reupload', 'navy'],
    ['ja', 'メンズコーデ集', '商用', '再アップロード', 'ネイビー']
  ];
  let searchCount;
  for (const [locale, title, commercial, reupload, query] of cases) {
    await page.locator('#language').selectOption(locale);
    assert(await page.locator('html').getAttribute('lang') === locale, locale + ': 页面语言');
    assert(await page.title() === title, locale + ': 页面标题');
    await page.locator('.itab').nth(1).click();
    assert((await page.locator('#notes').innerText()).includes(commercial), locale + ': 商用说明');
    assert((await page.locator('#notes').innerText()).includes(reupload), locale + ': 转载限制');
    assert(await page.locator('.author a').getAttribute('href') === 'https://x.com/linxiaobei888', locale + ': 作者链接');
    await page.locator('#ipanel1 .ipclose').click();
    await page.locator('#q').fill(query);
    await page.waitForTimeout(220);
    const count = await page.locator('#count').innerText();
    const number = Number(count.replace(/[^0-9]/g, ''));
    assert(number > 0, locale + ': 搜索结果');
    if (searchCount === undefined) searchCount = number;
    assert(number === searchCount, locale + ': 跨语言搜索结果一致');
    reports.push({ locale, title, searchCount: number });
    await page.locator('#q').fill('');
    await page.waitForTimeout(220);
  }
  await page.locator('#language').selectOption('en');
  await page.locator('.tab[data-v="夏"]').click();
  await page.locator('#q').fill('MEN-SUM-0001');
  await page.waitForTimeout(220);
  await page.locator('#language').selectOption('ja');
  assert(await page.locator('.tab[aria-selected="true"]').getAttribute('data-v') === '夏', '切换语言保留分类');
  assert(await page.locator('#q').inputValue() === 'MEN-SUM-0001', '切换语言保留搜索');
  assert(await page.locator('.card').count() === 1, '切换语言保留结果');
  await page.locator('.card').first().click();
  assert((await page.locator('#mdl').innerText()).includes('元画像'), '下载按钮翻译');
  assert((await page.locator('#mdesc').innerText()).includes('ネイビー'), '弹窗服装描述翻译');
  assert((await page.locator('#mdl').getAttribute('href')).includes('/download/men/orig/MEN-SUM-0001.png'), '高清下载地址');
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#mdl').click();
  const download = await downloadEvent;
  assert(await download.failure() === null, '高清下载成功');
  assert(download.suggestedFilename() === 'MEN-SUM-0001.png', '下载文件名');
  await page.locator('#mclose').click();
  await page.reload();
  await page.locator('.card').first().waitFor();
  assert(await page.locator('html').getAttribute('lang') === 'ja', '刷新后记住选择');
  await page.locator('#language').selectOption('en');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'output/playwright/i18n-desktop-en.png' });
  const layout = [];
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 812 });
    for (const [locale] of cases) {
      await page.locator('#language').selectOption(locale);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert(!overflow, locale + ': 手机横向溢出 ' + width);
      await page.locator('.itab').nth(1).click();
      const box = await page.locator('#ipanel1').boundingBox();
      layout.push({ width, locale, panelBottom: box.y + box.height });
      assert(box.x >= 0 && box.x + box.width <= width, locale + ': 注意事项横向布局');
      await page.locator('#ipanel1 .ipclose').click();
    }
  }
  await page.locator('#language').selectOption('ja');
  await page.locator('.itab').nth(1).click();
  await page.screenshot({ path: 'output/playwright/i18n-mobile-ja.png' });
  await page.locator('#ipanel1 .ipclose').click();
  const browser = page.context().browser();
  const detection = [];
  for (const [locale, expected] of [['en-US', 'en'], ['zh-HK', 'zh-TW'], ['ja-JP', 'ja'], ['fr-FR', 'zh-CN']]) {
    const context = await browser.newContext({ locale });
    const tab = await context.newPage();
    await tab.goto('http://127.0.0.1:4174');
    await tab.locator('.card').first().waitFor();
    const actual = await tab.locator('html').getAttribute('lang');
    assert(actual === expected, '浏览器语言识别 ' + locale);
    detection.push({ locale, actual });
    await context.close();
  }
  const failureContext = await browser.newContext({ locale: 'en-US' });
  const failurePage = await failureContext.newPage();
  await failurePage.route('**/data.json', route => route.fulfill({ status: 503, body: '{}' }));
  await failurePage.goto('http://127.0.0.1:4174');
  await failurePage.getByText('Unable to load images', { exact: true }).waitFor();
  await failurePage.locator('#q').fill('denim');
  await failurePage.waitForTimeout(220);
  assert(await failurePage.getByText('Unable to load images', { exact: true }).isVisible(), '搜索时保留加载错误');
  await failurePage.locator('#language').selectOption('ja');
  assert(await failurePage.getByText('画像を読み込めませんでした', { exact: true }).isVisible(), '加载错误可切换语言');
  assert((await failurePage.locator('#notes').textContent()).includes('再アップロード'), '数据失败时注意事项仍有翻译');
  await failureContext.close();
  const storageContext = await browser.newContext({ locale: 'en-US' });
  await storageContext.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('storage disabled'); };
    Storage.prototype.setItem = () => { throw new Error('storage disabled'); };
  });
  const storagePage = await storageContext.newPage();
  await storagePage.goto('http://127.0.0.1:4174');
  await storagePage.locator('.card').first().waitFor();
  await storagePage.locator('#language').selectOption('ja');
  assert(await storagePage.locator('html').getAttribute('lang') === 'ja', '存储受限时仍可切换语言');
  await storageContext.close();
  assert(errors.length === 0, '页面脚本错误：' + errors.join(', '));
  console.log(JSON.stringify({ reports, detection, layout, download: '通过', persistence: '通过', filterPreservation: '通过', errorLocalization: '通过', restrictedStorage: '通过', scriptErrors: errors }, null, 2));
}
