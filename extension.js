const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const bookCatalog = require('./bookCatalog');
const { discoverChapters } = require('./chapterUtils');

const BOOK_RUNTIME_FILE = '.knightlab-textbook.json';
const UPDATE_BASE_REF = 'refs/textbook/base';
let currentPanel;

async function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('knightlab.openTextbook', () => openTextbook(context)),
    vscode.commands.registerCommand('knightlab.updateTextbook', () => updateTextbook(context))
  );

  const config = await readBookConfig();
  if (!config || !vscode.workspace.getConfiguration('knightlab.textbook').get('autoOpen', true)) {
    return;
  }

  const root = getWorkspaceRootUri();
  if (root && await hasDevContainer(root) && !isInDevContainer()) {
    if (isDockerRunning()) {
      await vscode.commands.executeCommand('remote-containers.reopenInContainer');
      return;
    }
    vscode.window.showWarningMessage(
      'Docker is not running. Start Docker Desktop, then reopen this textbook in its Dev Container.'
    );
  }

  openTextbookPanel(context);
}

function deactivate() {
  currentPanel = undefined;
}

async function openTextbook(context) {
  const config = await readBookConfig();
  if (config) {
    openTextbookPanel(context);
    return;
  }
  await selectBook(context);
}

function openTextbookPanel(context) {
  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.One);
    void showTableOfContents();
    return;
  }

  currentPanel = vscode.window.createWebviewPanel(
    'knightlabTextbook',
    'Knight Lab Textbook',
    vscode.ViewColumn.One,
    { enableScripts: true }
  );
  currentPanel.webview.html = getTextbookHtml([], 'Knight Lab Textbook');
  currentPanel.webview.onDidReceiveMessage(async (message) => {
    if (message.command === 'openChapter') {
      await openChapter(message.folder);
    } else if (message.command === 'backToToc') {
      await showTableOfContents();
    } else if (message.command === 'updateTextbook') {
      await updateBookContent();
      await showTableOfContents();
    } else if (message.command === 'chooseBook') {
      await selectBook(context);
    }
  });
  currentPanel.onDidDispose(() => {
    currentPanel = undefined;
  });
  void showTableOfContents();
}

async function showTableOfContents() {
  if (!currentPanel) return;
  try {
    const config = await readBookConfig();
    if (!config) {
      currentPanel.webview.html = getTextbookHtml([], 'Knight Lab Textbook');
      return;
    }
    const hostRoot = await getHostBookRoot();
    const chapters = await discoverChapters(hostRoot);
    if (currentPanel) {
      currentPanel.webview.html = getTextbookHtml(chapters, config.title);
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Could not load textbook chapters: ${error.message}`);
    if (currentPanel) currentPanel.webview.html = getTextbookHtml([], 'Knight Lab Textbook');
  }
}

async function openChapter(folderName) {
  try {
    const hostRoot = await getHostBookRoot();
    const chapters = await discoverChapters(hostRoot);
    const chapter = chapters.find((item) => item.folder === folderName);
    if (!chapter) {
      vscode.window.showErrorMessage('That chapter folder is no longer available.');
      return;
    }

    const root = getWorkspaceRootUri();
    if (!root) throw new Error('Open a textbook folder first.');

    const lessonUri = vscode.Uri.joinPath(root, ...chapter.lesson.split('/'));
    try {
      const lesson = await vscode.workspace.fs.readFile(lessonUri);
      if (currentPanel) {
        currentPanel.webview.html = getLessonHtml(
          Buffer.from(lesson).toString('utf-8'),
          chapter.title
        );
      }
    } catch (error) {
      if (!isFileNotFound(error)) throw error;
      vscode.window.showErrorMessage(`Chapter "${chapter.title}" does not have a lesson.html file.`);
      return;
    }

    if (chapter.starter) {
      const starterUri = vscode.Uri.joinPath(root, ...chapter.starter.split('/'));
      const document = await vscode.workspace.openTextDocument(starterUri);
      await vscode.window.showTextDocument(document, {
        viewColumn: vscode.ViewColumn.Two,
        preview: false,
      });
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Could not open chapter: ${error.message}`);
  }
}

async function selectBook(context) {
  const selected = await vscode.window.showQuickPick(
    bookCatalog.map((book) => ({
      label: book.title,
      description: book.description,
      detail: book.repository,
      book,
    })),
    { placeHolder: 'Choose a textbook to download' }
  );
  if (!selected) return;

  const parent = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Choose a folder for this textbook',
  });
  if (!parent?.length) return;

  const destination = path.join(parent[0].fsPath, selected.book.folderName);
  if (fs.existsSync(destination)) {
    vscode.window.showErrorMessage(
      `The folder already exists: ${destination}. Choose a different parent folder.`
    );
    return;
  }

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Downloading ${selected.book.title}…`,
      },
      async () => {
        runGit(parent[0].fsPath, [
          'clone',
          '--branch',
          selected.book.branch,
          '--single-branch',
          selected.book.repository,
          destination,
        ]);
      }
    );

    const configPath = path.join(destination, 'textbook.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (config.id !== selected.book.id) {
      throw new Error('The downloaded textbook ID does not match the framework catalog.');
    }
    if (!fs.statSync(path.join(destination, 'chapters')).isDirectory()) {
      throw new Error('The selected repository does not contain a chapters/ folder.');
    }

    installRuntimeFiles(context.extensionPath, destination);
    runGit(destination, ['update-ref', UPDATE_BASE_REF, `refs/remotes/origin/${selected.book.branch}`]);
    await vscode.commands.executeCommand(
      'vscode.openFolder',
      vscode.Uri.file(destination),
      { forceNewWindow: true }
    );
  } catch (error) {
    vscode.window.showErrorMessage(`Could not open ${selected.book.title}: ${formatProcessError(error)}`);
  }
}

function installRuntimeFiles(extensionPath, bookRoot) {
  const target = path.join(bookRoot, '.devcontainer');
  fs.mkdirSync(target, { recursive: true });
  const resources = path.join(extensionPath, 'resources', 'container');
  fs.copyFileSync(path.join(resources, 'devcontainer.json'), path.join(target, 'devcontainer.json'));
  fs.copyFileSync(path.join(resources, 'Dockerfile'), path.join(target, 'Dockerfile'));

  const runtimeConfig = {
    version: 1,
    hostRoot: bookRoot,
  };
  fs.writeFileSync(
    path.join(bookRoot, BOOK_RUNTIME_FILE),
    `${JSON.stringify(runtimeConfig, null, 2)}\n`,
    'utf8'
  );

  const excludeFile = path.join(bookRoot, '.git', 'info', 'exclude');
  fs.appendFileSync(excludeFile, `\n/.devcontainer/\n/${BOOK_RUNTIME_FILE}\n`, 'utf8');
}

async function updateTextbook(context) {
  if (!(await readBookConfig())) {
    vscode.window.showWarningMessage('Open a downloaded textbook workspace before updating it.');
    return;
  }
  await updateBookContent();
}

async function updateBookContent() {
  try {
    const config = await readBookConfig();
    if (!config) throw new Error('No textbook is open.');
    const book = bookCatalog.find((item) => item.id === config.id);
    if (!book) throw new Error(`The framework catalog has no entry for textbook "${config.id}".`);

    const root = await getHostBookRoot();
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Checking ${config.title} for updates…`,
      },
      async () => {
        runGit(root, [
          'fetch',
          'origin',
          `+refs/heads/${book.branch}:refs/remotes/origin/${book.branch}`,
        ]);
      }
    );

    const base = runGit(root, ['rev-parse', UPDATE_BASE_REF]);
    const remote = runGit(root, ['rev-parse', `refs/remotes/origin/${book.branch}`]);
    if (base === remote) {
      vscode.window.showInformationMessage(`${config.title} is already up to date.`);
      return;
    }

    const changed = runGit(root, [
      'diff',
      '--name-only',
      '-z',
      base,
      remote,
      '--',
      'chapters/',
    ]).split('\0').filter(Boolean);
    if (changed.length === 0) {
      runGit(root, ['update-ref', UPDATE_BASE_REF, remote]);
      vscode.window.showInformationMessage('No chapter changes were found.');
      return;
    }

    const deleted = new Set(runGit(root, [
      'diff',
      '--diff-filter=D',
      '--name-only',
      '-z',
      base,
      remote,
      '--',
      'chapters/',
    ]).split('\0').filter(Boolean));
    const updated = [];
    const preserved = [];

    for (const relativePath of changed) {
      if (deleted.has(relativePath)) continue;
      const absolutePath = resolveBookPath(root, relativePath);
      const localChanges = runGit(root, ['status', '--porcelain', '--', relativePath]);
      const isLesson = path.basename(relativePath) === 'lesson.html';
      const remoteContent = runGit(root, ['show', `${remote}:${relativePath}`], null);

      if (localChanges && !isLesson) {
        const savedPath = findVersionedPath(absolutePath);
        fs.mkdirSync(path.dirname(savedPath), { recursive: true });
        fs.writeFileSync(savedPath, remoteContent);
        preserved.push(path.basename(savedPath));
      } else {
        fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
        fs.writeFileSync(absolutePath, remoteContent);
        updated.push(relativePath);
      }
    }

    runGit(root, ['update-ref', UPDATE_BASE_REF, remote]);
    const messages = [];
    if (updated.length) messages.push(`Updated ${updated.length} file(s).`);
    if (preserved.length) {
      messages.push(`Your edits were preserved; new versions saved as ${preserved.join(', ')}.`);
    }
    if (deleted.size) messages.push(`${deleted.size} remotely deleted file(s) were left in place.`);
    vscode.window.showInformationMessage(messages.join(' ') || 'Textbook updated.');
  } catch (error) {
    vscode.window.showErrorMessage(`Textbook update failed: ${formatProcessError(error)}`);
  }
}

function findVersionedPath(absolutePath) {
  const extension = path.extname(absolutePath);
  const base = absolutePath.slice(0, -extension.length);
  let version = 2;
  let candidate;
  do {
    candidate = `${base}_v${version}${extension}`;
    version += 1;
  } while (fs.existsSync(candidate));
  return candidate;
}

function resolveBookPath(bookRoot, relativePath) {
  if (!relativePath.startsWith('chapters/')) {
    throw new Error(`Refusing to update a file outside chapters/: ${relativePath}`);
  }
  const absolutePath = path.resolve(bookRoot, relativePath);
  const rootPrefix = `${path.resolve(bookRoot)}${path.sep}`;
  if (!absolutePath.startsWith(rootPrefix)) {
    throw new Error(`Invalid textbook path: ${relativePath}`);
  }
  return absolutePath;
}

function runGit(cwd, args, encoding = 'utf8') {
  const result = execFileSync('git', args, {
    cwd,
    encoding,
    maxBuffer: 20 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return encoding === null ? result : result.trim();
}

function formatProcessError(error) {
  const detail = error.stderr ? error.stderr.toString().trim() : error.message;
  return detail || error.message;
}

async function readBookConfig() {
  const root = getWorkspaceRootUri();
  if (!root) return undefined;
  try {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(root, 'textbook.json'));
    const config = JSON.parse(Buffer.from(bytes).toString('utf8'));
    if (!config.id || !config.title) {
      throw new Error('textbook.json must include an id and title.');
    }
    return config;
  } catch (error) {
    if (isFileNotFound(error)) return undefined;
    throw error;
  }
}

async function getHostBookRoot() {
  const root = getWorkspaceRootUri();
  if (!root) throw new Error('Open a textbook folder first.');
  if (root.scheme === 'file') return root.fsPath;

  try {
    const bytes = await vscode.workspace.fs.readFile(
      vscode.Uri.joinPath(root, BOOK_RUNTIME_FILE)
    );
    const runtimeConfig = JSON.parse(Buffer.from(bytes).toString('utf8'));
    if (!runtimeConfig.hostRoot) throw new Error('The textbook runtime file has no hostRoot.');
    return runtimeConfig.hostRoot;
  } catch (error) {
    if (isFileNotFound(error)) {
      throw new Error('This remote textbook workspace was not opened by the textbook framework. Run Open Textbook again.');
    }
    throw error;
  }
}

function getWorkspaceRootUri() {
  return vscode.workspace.workspaceFolders?.[0]?.uri;
}

async function hasDevContainer(root) {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.joinPath(root, '.devcontainer', 'devcontainer.json'));
    return true;
  } catch (error) {
    if (isFileNotFound(error)) return false;
    throw error;
  }
}

function isFileNotFound(error) {
  return error.code === 'FileNotFound' || error.code === 'ENOENT';
}

function isInDevContainer() {
  return vscode.env.remoteName === 'dev-container';
}

function isDockerRunning() {
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore', timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function getTextbookHtml(chapters, title) {
  const items = chapters.map((chapter) => `
    <li data-folder="${escapeHtml(chapter.folder)}">
      <span class="chapter-title">${escapeHtml(chapter.title)}</span>
      ${chapter.language ? `<span class="lang-tag">${escapeHtml(chapter.language)}</span>` : ''}
    </li>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      max-width: 720px;
      margin: 0 auto;
      padding: 3rem 2rem;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    h1 { color: #fbfbfb; margin-bottom: 1.5rem; }
    ul { list-style: none; padding: 0; }
    li {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 1rem 1.25rem;
      margin: 0.75rem 0;
      cursor: pointer;
    }
    li:hover { background: var(--vscode-list-hoverBackground); }
    .chapter-title { font-weight: 600; font-size: 1.05rem; }
    .lang-tag {
      display: inline-block;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 0.1rem 0.5rem;
      border-radius: 3px;
      font-size: 0.75rem;
      margin-left: 0.5rem;
    }
    .header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 1rem;
    }
    button {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border: 0;
      border-radius: 4px;
      padding: 0.45rem 0.75rem;
      cursor: pointer;
      white-space: nowrap;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .back {
      display: inline-block;
      color: var(--vscode-textLink-foreground);
      margin-bottom: 1rem;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(title)}</h1>
    <button id="update">Update Textbook</button>
  </div>
  <ul id="chapters">${items}</ul>
  ${chapters.length ? '' : '<p>No folders found inside chapters/.</p>'}
  <script>
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('#chapters li').forEach((item) => {
      item.addEventListener('click', () => {
        vscode.postMessage({ command: 'openChapter', folder: item.dataset.folder });
      });
    });
    document.getElementById('update').addEventListener('click', () => {
      vscode.postMessage({ command: 'updateTextbook' });
    });
  </script>
</body>
</html>`;
}

function getLessonHtml(content, title) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      max-width: 720px;
      margin: 0 auto;
      padding: 2rem 2rem 4rem;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.55;
    }
    .back {
      display: inline-block;
      margin-bottom: 1.5rem;
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
    }
    .lesson h1 { margin-top: 0; }
    .lesson pre, .lesson code {
      background: var(--vscode-textCodeBlock-background);
      border-radius: 4px;
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
    }
    .lesson code { padding: 0.1rem 0.35rem; }
    .lesson pre { padding: 1rem; overflow-x: auto; }
    .lesson pre code { padding: 0; }
  </style>
</head>
<body>
  <a class="back" id="back">← Back to chapters</a>
  <div class="lesson" aria-label="${escapeHtml(title)}">${content}</div>
  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('back').addEventListener('click', () => {
      vscode.postMessage({ command: 'backToToc' });
    });
  </script>
</body>
</html>`;
}

module.exports = { activate, deactivate };
