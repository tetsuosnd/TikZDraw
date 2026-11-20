import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
await import('./examples.mjs');
const cache = path.join(root, 'test-output/tex-cache');
await mkdir(cache, { recursive: true });
const env = { ...process.env, TEXMFVAR: cache, TEXMFCACHE: cache };
await writeFile(
  'test-output/fragment.tex',
  '\\documentclass{article}\n\\usepackage[a4paper,margin=20mm]{geometry}\n\\usepackage{tikz,amsmath,amssymb}\n\\usetikzlibrary{arrows.meta}\n\\pagestyle{empty}\n\\begin{document}\n\\centering\\input{examples/circle-tangent.tikz}\n\\end{document}\n',
);
const jobs = [
  ['pdflatex', 'examples/circle-tangent.tex', 'examples'],
  ['pdflatex', 'examples/all-shapes.tex', 'examples'],
  ['lualatex', 'examples/japanese.tex', 'examples'],
  ['pdflatex', 'test-output/fragment.tex', 'test-output'],
];
for (const [engine, file, out] of jobs) {
  const start = performance.now();
  try {
    execFileSync(
      engine,
      [
        '-interaction=nonstopmode',
        '-halt-on-error',
        '-no-shell-escape',
        `-output-directory=${out}`,
        file,
      ],
      { env, stdio: 'pipe', timeout: 120000 },
    );
  } catch (error) {
    console.error(error.stdout?.toString(), error.stderr?.toString());
    throw error;
  }
  const stem = path.basename(file, '.tex'),
    log = await readFile(`${out}/${stem}.log`, 'utf8');
  const issues = log.split('\n').filter((line) => /^!|Overfull|Missing character:/.test(line));
  if (issues.length) throw new Error(`${file}: ${issues.join('\n')}`);
  execFileSync(
    'pdftoppm',
    ['-scale-to', '1100', '-singlefile', '-png', `${out}/${stem}.pdf`, `test-output/${stem}`],
    { stdio: 'pipe' },
  );
  console.log(
    `PASS ${file}: compiled, no TeX errors/overflow/missing glyphs; rendered (${((performance.now() - start) / 1000).toFixed(2)} s)`,
  );
}
