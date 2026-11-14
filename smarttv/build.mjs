// Prepara le due cartelle da impacchettare: dist/webos (LG) e dist/tizen (Samsung). Nessuna dipendenza: node build.mjs
// Poi, sul tuo computer:
//   LG:      ares-package dist/webos -o dist            → com.kairos.player_0.1.0_all.ipk   (webOS CLI di LG)
//   Samsung: tizen package -t wgt -s <profilo> -- dist/tizen   → Kairos Player.wgt           (Tizen Studio, con il tuo certificato)
import fs from 'node:fs'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const copy = (from, to) => { fs.mkdirSync(to, { recursive: true }); for (const e of fs.readdirSync(from, { withFileTypes: true })) { const a = path.join(from, e.name), b = path.join(to, e.name); if (e.isDirectory()) copy(a, b); else fs.copyFileSync(a, b); } };
fs.rmSync(path.join(here, 'dist'), { recursive: true, force: true });
for (const t of ['webos', 'tizen']) { copy(path.join(here, 'app'), path.join(here, 'dist', t)); copy(path.join(here, t), path.join(here, 'dist', t)); }
const v = JSON.parse(fs.readFileSync(path.join(here, 'webos', 'appinfo.json'), 'utf8')).version;
const js = fs.readFileSync(path.join(here, 'app', 'js', 'core.js'), 'utf8'), xml = fs.readFileSync(path.join(here, 'tizen', 'config.xml'), 'utf8');
if (!js.includes(`version: '${v}'`) || !xml.includes(`version="${v}"`)) { console.error('ATTENZIONE: il numero di versione non è lo stesso in appinfo.json, config.xml e core.js'); process.exit(1); }
console.log('Pronte: dist/webos e dist/tizen, versione ' + v);
