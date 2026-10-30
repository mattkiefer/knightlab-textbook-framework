const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { isLocalFileModified } = require('../contentUpdate');

test('compares local chapter files to the previously published content', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'knightlab-update-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const relativePath = 'chapters/1-intro/hello.py';
  const absolutePath = path.join(root, relativePath);
  const baseline = Buffer.from('print("hello")\n');

  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, baseline);
  execFileSync('git', ['add', relativePath], { cwd: root });
  execFileSync('git', ['commit', '-qm', 'initial'], { cwd: root });
  const baseRef = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();

  assert.equal(isLocalFileModified(root, baseRef, relativePath, absolutePath), false);
  await fs.writeFile(absolutePath, 'print("student edit")\n');
  assert.equal(isLocalFileModified(root, baseRef, relativePath, absolutePath), true);
  await fs.rm(absolutePath);
  assert.equal(isLocalFileModified(root, baseRef, relativePath, absolutePath), true);

  const newPath = 'chapters/2-new/new.py';
  const newAbsolutePath = path.join(root, newPath);
  assert.equal(isLocalFileModified(root, baseRef, newPath, newAbsolutePath), false);
  await fs.mkdir(path.dirname(newAbsolutePath), { recursive: true });
  await fs.writeFile(newAbsolutePath, 'print("student file")\n');
  assert.equal(isLocalFileModified(root, baseRef, newPath, newAbsolutePath), true);
});
