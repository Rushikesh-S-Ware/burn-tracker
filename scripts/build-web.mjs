// Builds the installable web version: `node scripts/build-web.mjs`
// Set WEB_BASE_URL=/repo-name when hosting under a sub-path (GitHub Pages).
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const base = (process.env.WEB_BASE_URL || '').replace(/\/$/, '');
const dist = 'dist';

execSync('npx expo export -p web --output-dir dist --clear', { stdio: 'inherit', env: { ...process.env, WEB_BASE_URL: base } });

// Collect every file for the offline cache.
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(relative(dist, p).split(sep).join('/'));
  }
};
walk(dist);
const assets = files.filter((f) => f !== 'sw.js' && !f.endsWith('.map')).map((f) => `${base}/${f}`);
if (!assets.includes(`${base}/`)) assets.push(`${base}/`);

// Service worker: fill in the asset list and a version hash.
const version = createHash('md5').update(assets.join('|') + Date.now()).digest('hex').slice(0, 10);
const swPath = join(dist, 'sw.js');
writeFileSync(swPath, readFileSync(swPath, 'utf8').replaceAll('__ASSETS__', JSON.stringify(assets)).replaceAll('__VERSION__', version));

// index.html: manifest, iOS home-screen tags, theme colour, service worker registration.
const indexPath = join(dist, 'index.html');
let html = readFileSync(indexPath, 'utf8');
const head = `
    <link rel="manifest" href="${base}/manifest.json" />
    <meta name="theme-color" content="#FF6B2C" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Burn Tracker" />
    <link rel="apple-touch-icon" href="${base}/icon-192.png" />
    <meta name="description" content="Offline workout, step and calorie tracker. Your data stays on your phone." />`;
html = html.replace('</head>', `${head}\n  </head>`);
const sw = `
    <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => navigator.serviceWorker.register('${base}/sw.js').catch(() => {}));
        // A new version was installed in the background: reload once so the user sees it now, not next time.
        let reloaded = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (navigator.serviceWorker.controller && !reloaded) { reloaded = true; location.reload(); }
        });
      }
    </script>`;
html = html.replace('</body>', `${sw}\n  </body>`);
writeFileSync(indexPath, html);

// GitHub Pages: no Jekyll processing, and serve index.html for unknown paths.
writeFileSync(join(dist, '.nojekyll'), '');
if (!existsSync(join(dist, '404.html'))) writeFileSync(join(dist, '404.html'), html);

console.log(`\nWeb build ready in ${dist}/ (base "${base || '/'}", ${assets.length} files cached offline)`);
