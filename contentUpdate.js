const fs = require('fs');
const { execFileSync } = require('child_process');

function isLocalFileModified(repositoryRoot, baseRef, relativePath, absolutePath) {
  const treeFiles = execFileSync(
    'git',
    ['ls-tree', '-r', '--name-only', '-z', baseRef, '--', relativePath],
    { cwd: repositoryRoot, encoding: 'utf8' }
  ).split('\0');
  const existedAtBase = treeFiles.includes(relativePath);
  const existsLocally = fs.existsSync(absolutePath);

  if (!existsLocally) return existedAtBase;
  if (!existedAtBase) return true;

  const baseContent = execFileSync(
    'git',
    ['show', `${baseRef}:${relativePath}`],
    { cwd: repositoryRoot, encoding: null, maxBuffer: 20 * 1024 * 1024 }
  );
  return !fs.readFileSync(absolutePath).equals(baseContent);
}

module.exports = { isLocalFileModified };
