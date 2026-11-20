const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
app
  .whenReady()
  .then(async () => {
    const root = path.resolve(__dirname, '..');
    const win = new BrowserWindow({
      width: 1024,
      height: 1024,
      show: false,
      useContentSize: true,
      webPreferences: { sandbox: true },
    });
    const svg = fs.readFileSync(path.join(root, 'assets/icon.svg'), 'utf8');
    await win.loadURL(
      'data:text/html;charset=utf-8,' +
        encodeURIComponent(
          `<style>*{margin:0}body{background:transparent}svg{width:1024px;height:1024px}</style>${svg}`,
        ),
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    const png = (await win.webContents.capturePage()).resize({ width: 1024, height: 1024 });
    fs.writeFileSync(path.join(root, 'assets/icon.png'), png.toPNG());
    win.destroy();
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
