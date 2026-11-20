import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron';
import { readFile, writeFile, rename, stat, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { parseDocument, serializeDocument, exportTex, exportTikz } from '../core/document.mjs';

app.setName('TikZ Draw');
let win,
  currentPath = null,
  dirty = false,
  allowClose = false;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function atomicWrite(filePath, source) {
  const temporary = `${filePath}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, source, 'utf8');
    await rename(temporary, filePath);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}
function trusted(event) {
  if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame)
    throw new Error('Unexpected IPC sender');
}
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, args) => {
    trusted(event);
    try {
      return await fn(args);
    } catch (error) {
      return { error: error.message };
    }
  });
}
function question() {
  return dialog.showMessageBoxSync(win, {
    type: 'question',
    message: '変更を保存しますか？',
    detail: '保存していない変更があります。',
    buttons: ['保存', '保存しない', 'キャンセル'],
    defaultId: 0,
    cancelId: 2,
  });
}
export async function createWindow(options = {}) {
  win = new BrowserWindow({
    width: 1420,
    height: 920,
    minWidth: 1060,
    minHeight: 700,
    title: 'TikZ Draw',
    backgroundColor: '#f4f5f2',
    show: options.show ?? true,
    webPreferences: {
      preload: path.join(root, 'desktop/preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  win.on('close', (event) => {
    if (!dirty || allowClose) return;
    event.preventDefault();
    const choice = question();
    if (choice === 0) win.webContents.send('command', 'save-and-close');
    if (choice === 1) {
      dirty = false;
      win.webContents.send('command', 'discard-and-close');
    }
  });
  handle('document:open', async () => {
    const chosen = await dialog.showOpenDialog(win, {
      title: '図を開く',
      properties: ['openFile'],
      filters: [{ name: 'TikZ Draw', extensions: ['tikzdraw', 'json'] }],
    });
    if (chosen.canceled) return { canceled: true };
    const selected = chosen.filePaths[0];
    if ((await stat(selected)).size > 20_000_000)
      throw new Error('20 MB 以下のファイルを選んでください。');
    const doc = parseDocument(await readFile(selected, 'utf8'));
    currentPath = selected;
    win.setRepresentedFilename(selected);
    return { doc, path: selected };
  });
  handle('document:save', async ({ source, saveAs }) => {
    const doc = parseDocument(source);
    let target = saveAs ? null : currentPath;
    if (!target) {
      const chosen = await dialog.showSaveDialog(win, {
        title: '図を保存',
        defaultPath: currentPath || `${doc.name}.tikzdraw`,
        filters: [{ name: 'TikZ Draw', extensions: ['tikzdraw'] }],
      });
      if (chosen.canceled) return { canceled: true };
      target = chosen.filePath;
    }
    await atomicWrite(target, serializeDocument(doc));
    currentPath = target;
    win.setRepresentedFilename(target);
    return { path: target };
  });
  handle('document:export', async ({ source, kind }) => {
    if (!['tikz', 'tex'].includes(kind)) throw new Error('未対応の書き出し形式です。');
    const doc = parseDocument(source),
      chosen = await dialog.showSaveDialog(win, {
        title: kind === 'tex' ? '単体 TeX を書き出す' : 'TikZ を書き出す',
        defaultPath: `${doc.name}.${kind}`,
        filters: [{ name: kind === 'tex' ? 'LaTeX document' : 'TikZ picture', extensions: [kind] }],
      });
    if (chosen.canceled) return { canceled: true };
    await atomicWrite(chosen.filePath, kind === 'tex' ? exportTex(doc) : exportTikz(doc));
    return { path: chosen.filePath };
  });
  handle('document:discard', () => ({ choice: ['save', 'discard', 'cancel'][question()] }));
  ipcMain.on('document:changed', (event, value) => {
    trusted(event);
    dirty = !!value;
    win.setDocumentEdited(dirty);
  });
  ipcMain.on('document:close', (event) => {
    trusted(event);
    allowClose = true;
    win.close();
  });
  ipcMain.on('document:new-path', (event) => {
    trusted(event);
    currentPath = null;
    win.setRepresentedFilename('');
  });
  const send = (command) => () => win.webContents.send('command', command);
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'TikZ Draw',
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      {
        label: 'ファイル',
        submenu: [
          { label: '新規', accelerator: 'CmdOrCtrl+N', click: send('new') },
          { label: '開く…', accelerator: 'CmdOrCtrl+O', click: send('open') },
          { type: 'separator' },
          { label: '保存', accelerator: 'CmdOrCtrl+S', click: send('save') },
          { label: '別名で保存…', accelerator: 'CmdOrCtrl+Shift+S', click: send('save-as') },
          { type: 'separator' },
          { label: 'TikZ を書き出す…', accelerator: 'CmdOrCtrl+E', click: send('export-tikz') },
          {
            label: '単体 TeX を書き出す…',
            accelerator: 'CmdOrCtrl+Shift+E',
            click: send('export-tex'),
          },
          { type: 'separator' },
          { role: 'close' },
        ],
      },
      {
        label: '編集',
        submenu: [
          { label: '元に戻す', accelerator: 'CmdOrCtrl+Z', click: send('undo') },
          { label: 'やり直す', accelerator: 'CmdOrCtrl+Shift+Z', click: send('redo') },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { label: 'すべて選択', accelerator: 'CmdOrCtrl+A', click: send('select-all') },
          { label: '複製', accelerator: 'CmdOrCtrl+D', click: send('duplicate') },
          { label: '削除', click: send('delete') },
        ],
      },
      {
        label: '表示',
        submenu: [
          { label: '拡大', accelerator: 'CmdOrCtrl+Plus', click: send('zoom-in') },
          { label: '縮小', accelerator: 'CmdOrCtrl+-', click: send('zoom-out') },
          { label: '用紙を全体表示', accelerator: 'CmdOrCtrl+0', click: send('zoom-fit') },
          { type: 'separator' },
          { role: 'togglefullscreen' },
          { role: 'toggleDevTools' },
        ],
      },
      { label: 'ヘルプ', submenu: [{ label: '使い方', click: send('help') }] },
    ]),
  );
  await win.loadFile(path.join(root, 'ui/index.html'));
  return win;
}
if (process.env.TIKZDRAW_TEST !== '1') {
  const smoke = process.argv
    .find((arg) => arg.startsWith('--smoke-test='))
    ?.slice('--smoke-test='.length);
  if (smoke) app.setPath('userData', path.join(path.dirname(smoke), 'smoke-profile'));
  app
    .whenReady()
    .then(async () => {
      const window = await createWindow({ show: !smoke });
      if (smoke) {
        await delay(250);
        const state = await window.webContents.executeJavaScript(
          '({loaded:!!window.tikzDrawState,bridge:typeof window.desktop.save,math:typeof window.katex.render,node:typeof require})',
        );
        if (
          !state.loaded ||
          state.bridge !== 'function' ||
          state.math !== 'function' ||
          state.node !== 'undefined'
        )
          throw new Error('Packaged app initialization failed');
        await writeFile(smoke, (await window.webContents.capturePage()).toPNG());
        console.log('PASS: packaged application initialized with local assets and sandbox');
        window.destroy();
        app.exit(0);
      }
    })
    .catch((error) => {
      if (smoke) {
        console.error(error);
        app.exit(1);
      } else {
        dialog.showErrorBox('起動できません', error.message);
        app.quit();
      }
    });
  app.on('window-all-closed', () => app.quit());
}
