const fs = require('fs/promises');
const path = require('path');

const chapterNameCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

const starterLanguage = {
  '.js': 'Node',
  '.py': 'Python',
  '.r': 'R',
};

function getChapterTitle(folderName) {
  return folderName
    .replace(/^\d+(?:\.\d+)*(?=[-_\s]|$)[-_\s]*/, '')
    .replace(/[-_]/g, ' ')
    .trim() || folderName;
}

async function discoverChapters(bookRoot) {
  const chaptersRoot = path.join(bookRoot, 'chapters');
  const entries = await fs.readdir(chaptersRoot, { withFileTypes: true });
  const folders = entries
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => chapterNameCollator.compare(a.name, b.name));

  return Promise.all(folders.map(async (folder) => {
    const folderPath = path.join(chaptersRoot, folder.name);
    const files = await fs.readdir(folderPath, { withFileTypes: true });
    const starterFile = files
      .filter((entry) =>
        entry.isFile() && Object.hasOwn(starterLanguage, path.extname(entry.name).toLowerCase())
      )
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))[0];

    return {
      folder: folder.name,
      title: getChapterTitle(folder.name),
      lesson: path.posix.join('chapters', folder.name, 'lesson.html'),
      starter: starterFile
        ? path.posix.join('chapters', folder.name, starterFile)
        : undefined,
      language: starterFile
        ? starterLanguage[path.extname(starterFile).toLowerCase()]
        : undefined,
    };
  }));
}

module.exports = { discoverChapters, getChapterTitle };
