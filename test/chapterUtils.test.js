const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { discoverChapters, getChapterTitle } = require('../chapterUtils');

test('removes optional integer and decimal numbering from chapter titles', () => {
  assert.equal(getChapterTitle('1-intro-to-data'), 'intro to data');
  assert.equal(getChapterTitle('1.2_data-cleaning'), 'data cleaning');
  assert.equal(getChapterTitle('un-numbered-chapter'), 'un numbered chapter');
  assert.equal(getChapterTitle('1.2'), '1.2');
});

test('discovers immediate chapter folders and naturally sorts decimal names', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'knightlab-book-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const chapters = path.join(root, 'chapters');
  for (const folder of ['2.1-analysis', '1.10-wrap-up', '1.2-data', 'un-numbered']) {
    await fs.mkdir(path.join(chapters, folder), { recursive: true });
  }
  await fs.writeFile(path.join(chapters, '1.2-data', 'lesson.html'), '<h1>Data</h1>');
  await fs.writeFile(path.join(chapters, '1.2-data', 'load.py'), 'print("data")');
  await fs.writeFile(path.join(chapters, '2.1-analysis', 'analyze.R'), 'summary(1)');

  const results = await discoverChapters(root);
  assert.deepEqual(results.map((chapter) => chapter.folder), [
    '1.2-data',
    '1.10-wrap-up',
    '2.1-analysis',
    'un-numbered',
  ]);
  assert.equal(results[0].title, 'data');
  assert.equal(results[0].starter, 'chapters/1.2-data/load.py');
  assert.equal(results[0].language, 'Python');
  assert.equal(results[1].starter, undefined);
  assert.equal(results[2].language, 'R');
});
