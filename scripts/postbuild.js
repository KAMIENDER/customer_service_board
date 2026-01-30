import fs from 'node:fs';
import path from 'node:path';

function ensureCleanUrlEntry({ distDir, htmlFile, routeDir }) {
  const sourcePath = path.join(distDir, htmlFile);
  if (!fs.existsSync(sourcePath)) {
    console.warn(`[postbuild] skip: ${path.relative(process.cwd(), sourcePath)} not found`);
    return;
  }

  const targetDir = path.join(distDir, routeDir);
  const targetPath = path.join(targetDir, 'index.html');

  const sourceHtml = fs.readFileSync(sourcePath, 'utf8');
  let targetHtml = sourceHtml;

  if (!/<base\s/i.test(sourceHtml)) {
    const baseTag = '  <base href="/">\n';
    targetHtml = sourceHtml.replace(/<head(\s[^>]*)?>/i, match => `${match}\n${baseTag}`);
  }

  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(targetPath, targetHtml);
  console.log(`[postbuild] wrote ${path.relative(process.cwd(), targetPath)}`);
}

const distDir = path.resolve('dist');
if (!fs.existsSync(distDir)) {
  console.warn('[postbuild] skip: dist/ not found');
  process.exit(0);
}

// `serve` 可能会把 `coverage.html` 清理成 `/coverage`，这里补一个 `dist/coverage/index.html`
// 以确保 `/coverage` 能正确落到“回复内容”页面，而不是回退到 `index.html`。
ensureCleanUrlEntry({ distDir, htmlFile: 'coverage.html', routeDir: 'coverage' });

