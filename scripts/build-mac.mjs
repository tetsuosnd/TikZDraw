import { cp, mkdir, readFile, writeFile, rm, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
if (process.platform !== 'darwin') throw new Error('このビルドは macOS 上で実行してください。');
const require = createRequire(import.meta.url),
  root = fileURLToPath(new URL('../', import.meta.url));
const binary = require('electron'),
  source = path.resolve(binary, '../../..');
const target = path.join(root, 'dist/TikZ Draw.app');
await mkdir(path.join(root, 'dist'), { recursive: true });
await rm(target, { recursive: true, force: true });
console.log('[1/4] Electron ランタイムをコピー');
await cp(source, target, { recursive: true, preserveTimestamps: true, verbatimSymlinks: true });
const resources = path.join(target, 'Contents/Resources'),
  appDir = path.join(resources, 'app');
await rm(path.join(resources, 'default_app.asar'), { force: true });
await mkdir(appDir, { recursive: true });
console.log('[2/4] アプリとローカル数式フォントを配置');
for (const dir of ['core', 'desktop', 'ui'])
  await cp(path.join(root, dir), path.join(appDir, dir), { recursive: true });
await mkdir(path.join(appDir, 'node_modules/katex'), { recursive: true });
await cp(path.join(root, 'node_modules/katex/dist'), path.join(appDir, 'node_modules/katex/dist'), {
  recursive: true,
});
await cp(
  path.join(root, 'node_modules/katex/LICENSE'),
  path.join(appDir, 'node_modules/katex/LICENSE'),
);
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
await writeFile(
  path.join(appDir, 'package.json'),
  JSON.stringify(
    {
      name: pkg.name,
      productName: pkg.productName,
      version: pkg.version,
      type: 'module',
      main: pkg.main,
    },
    null,
    2,
  ),
);
console.log('[3/4] macOS アプリ情報を設定');
const plist = path.join(target, 'Contents/Info.plist');
for (const [key, value] of Object.entries({
  CFBundleDisplayName: 'TikZ Draw',
  CFBundleName: 'TikZ Draw',
  CFBundleIdentifier: 'jp.tetsuosnd.tikzdraw',
  CFBundleShortVersionString: pkg.version,
  CFBundleVersion: pkg.version,
}))
  execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plist]);
// Replace Electron's icon when the locally rendered app icon is available.
const png = path.join(root, 'assets/icon.png');
try {
  await access(png);
  const iconset = path.join(root, 'test-output/TikZDraw.iconset');
  await mkdir(iconset, { recursive: true });
  for (const size of [16, 32, 128, 256, 512])
    for (const scale of [1, 2])
      execFileSync(
        '/usr/bin/sips',
        [
          '-z',
          String(size * scale),
          String(size * scale),
          png,
          '--out',
          path.join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`),
        ],
        { stdio: 'ignore' },
      );
  execFileSync('/usr/bin/iconutil', [
    '-c',
    'icns',
    iconset,
    '-o',
    path.join(resources, 'electron.icns'),
  ]);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
console.log('[4/4] ローカル用 ad-hoc 署名');
execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', target], {
  stdio: 'inherit',
});
execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', target], { stdio: 'inherit' });
console.log(`生成: ${target}`);
