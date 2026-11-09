async (page) => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('http://127.0.0.1:4174');
  await page.locator('.card').first().waitFor();
  const boxes=[];
  for (const language of ['zh-CN','zh-TW','en','ja']) {
    await page.locator('#language').selectOption(language);
    await page.locator('.itab').nth(1).click();
    const box=await page.locator('#ipanel1').boundingBox();
    boxes.push({ language, top:box.y, bottom:box.y+box.height });
    assert(box.y+box.height<=640, language+': 面板超出短屏底部');
    await page.locator('#ipanel1 .ipclose').click();
  }
  await page.locator('#language').selectOption('en');
  await page.locator('#q').fill('no-such-outfit-99999');
  await page.getByText('No matching images',{exact:true}).waitFor();
  await page.locator('#language').selectOption('ja');
  assert(await page.getByText('一致する画像がありません',{exact:true}).isVisible(),'空结果可切换语言');
  await page.locator('#q').fill('');
  await page.locator('.card').first().waitFor();
  await page.locator('#more').click();
  await page.locator('#language').scrollIntoViewIfNeeded();
  const before=await page.locator('.card').count();
  await page.locator('#language').selectOption('en');
  const after=await page.locator('.card').count();
  assert(before===after && after>120,'切换语言保留分页数量');
  return { boxes, emptyTranslation:'通过', retainedCards:after };
}
