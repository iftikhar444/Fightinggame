/* =========================================================================
   RIFTBOUND build — inlines vendor Three.js, CSS and every src module into a
   single offline HTML file. No bundler, no network, no npm install required.
   Usage: node build.mjs
   ========================================================================= */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, p), 'utf8');

const order = fs.readdirSync(path.join(here, 'src'))
  .filter((f) => /^\d\d_.*\.js$/.test(f))
  .sort();

const three = read('vendor/three.min.js');
const css = read('src/styles.css');
const template = read('template.html');

const game = order
  .map((f) => `\n/* ==== ${f} ==== */\n` + read(path.join('src', f)))
  .join('\n');

for (const [name, code] of [['three', three], ['game', game], ['css', css]]) {
  if (code.includes('</script')) {
    console.error(`Build aborted: ${name} contains a </script sequence.`);
    process.exit(1);
  }
}

let out = template
  .replace('/*__STYLES__*/', () => css)
  .replace('/*__THREE__*/', () => three)
  .replace('/*__GAME__*/', () => game);

const banner = `<!-- RIFTBOUND: CLASH PROTOCOL — built ${new Date().toISOString()} | modules: ${order.length} | three r${(three.match(/REVISION="?(\d+)/) || [])[1] || '?'} -->\n`;
out = banner + out;

fs.mkdirSync(path.join(here, 'dist'), { recursive: true });
const target = path.join(here, 'dist', 'riftbound.html');
fs.writeFileSync(target, out, 'utf8');

console.log(`built ${path.relative(process.cwd(), target)}`);
console.log(`  modules : ${order.join(', ')}`);
console.log(`  size    : ${(out.length / 1024).toFixed(0)} KB`);
