// Prepara le due cartelle da impacchettare: dist/webos (LG) e dist/tizen (Samsung). Nessuna dipendenza: node build.mjs
// Poi, sul tuo computer:
//   LG:      ares-package dist/webos dist/webos-service -o dist   → com.kairos.player_<versione>_all.ipk (webOS CLI di LG)
//   Samsung: tizen package -t wgt -s <profilo> -- dist/tizen   → Kairos Player.wgt           (Tizen Studio, con il tuo certificato)
import fs from 'node:fs'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const copy = (from, to) => { fs.mkdirSync(to, { recursive: true }); for (const e of fs.readdirSync(from, { withFileTypes: true })) { const a = path.join(from, e.name), b = path.join(to, e.name); if (e.isDirectory()) copy(a, b); else fs.copyFileSync(a, b); } };
fs.rmSync(path.join(here, 'dist'), { recursive: true, force: true });
for (const t of ['webos', 'tizen']) { copy(path.join(here, 'app'), path.join(here, 'dist', t)); copy(path.join(here, t), path.join(here, 'dist', t)); }
// TV LG: il servizio interno che scarica la lista va impacchettato insieme all'app (ares-package dist/webos dist/webos-service)
copy(path.join(here, 'webos-service'), path.join(here, 'dist', 'webos-service'));
const v = JSON.parse(fs.readFileSync(path.join(here, 'webos', 'appinfo.json'), 'utf8')).version;
const sv = JSON.parse(fs.readFileSync(path.join(here, 'webos-service', 'package.json'), 'utf8')).version;
const js = fs.readFileSync(path.join(here, 'app', 'js', 'core.js'), 'utf8'), xml = fs.readFileSync(path.join(here, 'tizen', 'config.xml'), 'utf8');
if (!js.includes(`version: '${v}'`) || !xml.includes(`version="${v}"`) || sv !== v) { console.error('ATTENZIONE: il numero di versione non è lo stesso in appinfo.json, config.xml, core.js e nel servizio (package.json)'); process.exit(1); }
// il servizio deve chiamarsi come l'app più «.service» (regola di webOS)
const app = JSON.parse(fs.readFileSync(path.join(here, 'webos', 'appinfo.json'), 'utf8')).id, svc = JSON.parse(fs.readFileSync(path.join(here, 'webos-service', 'services.json'), 'utf8')).id;
if (svc.indexOf(app + '.') !== 0) { console.error('ATTENZIONE: il nome del servizio deve iniziare con l\'id dell\'app'); process.exit(1); }
// la libreria webOSTV.js e il servizio esistono solo nel pacchetto LG
fs.rmSync(path.join(here, 'dist', 'tizen', 'webOSTVjs-1.2.13'), { recursive: true, force: true });
// server della pagina «Dal telefono»: si può cambiare senza toccare il codice → node build.mjs --pair https://dominio
const ai = process.argv.findIndex((a) => a === '--pair' || a.startsWith('--pair='));
let pair = 'https://store-k.download';
if (ai >= 0) {
  pair = process.argv[ai].includes('=') ? process.argv[ai].split('=').slice(1).join('=') : process.argv[ai + 1] || '';
  pair = pair.replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}$/i.test(pair)) { console.error('ATTENZIONE: --pair vuole un indirizzo https senza percorso, es. https://esempio.com'); process.exit(1); }
  for (const t of ['webos', 'tizen']) {
    const f = path.join(here, 'dist', t, 'js', 'core.js'), c = fs.readFileSync(f, 'utf8'), n = c.replace(/KP\.PAIR = '[^']*';/, `KP.PAIR = '${pair}';`);
    if (n === c && !c.includes(`KP.PAIR = '${pair}';`)) { console.error('ATTENZIONE: KP.PAIR non trovato in core.js'); process.exit(1); }
    fs.writeFileSync(f, n);
  }
}
console.log('Pronte: dist/webos + dist/webos-service (LG) e dist/tizen (Samsung), versione ' + v + ' · pagina «Dal telefono»: ' + pair + '/tv');
