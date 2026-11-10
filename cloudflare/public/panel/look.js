/* KAIROS Control — aspetto del pannello: «Futuro», «Misto» o «Classico» (10 novembre 2026).
   Solo grafica: nessuna chiamata nuova al server, nessun dato o impostazione toccati.
   · Classico = il pannello com'era: nessuna regola di questo file si applica e non aggiunge niente alla pagina.
   · Futuro   = barra a icone, scritte spaziate, sfondo con griglia e stelle, console animata in Home.
   · Misto    = gli stessi colori e la stessa console, con il menu a scritte e un aspetto più calmo.
   La scelta vale per questo dispositivo (localStorage «kxLook»), predefinita «Futuro»: si cambia toccando il cerchio
   con l'iniziale in alto a destra. La console in Home apre la stessa attivazione di «Nuovo cliente» e scrive il codice
   nel suo campo, come se lo scrivessi tu: la ricerca della linea collegata ai pannelli resta quella di sempre.
   Classi proprie con il prefisso «x-» (niente scontri con le classi del pannello). Va caricato per ultimo. */
(() => {
  if (window.KXLook) return;
  const KEY = 'kxLook', LOOKS = ['futuro', 'misto', 'classico'];
  const root = document.documentElement;
  const read = () => { try { const v = localStorage.getItem(KEY); return LOOKS.includes(v) ? v : 'futuro'; } catch { return 'futuro'; } };
  let look = read();
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const q = (s, r = document) => r.querySelector(s), qa = (s, r = document) => [...r.querySelectorAll(s)];
  const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const BOLT = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M13 2 4 14h7l-1 8 9-12h-7z' fill='none' stroke='%23000' stroke-width='2.4' stroke-linejoin='round' stroke-linecap='round'/%3E%3C/svg%3E\")";
  const MONO = "'JetBrains Mono',ui-monospace,monospace", SANS = 'Inter,system-ui,sans-serif';

  /* ---------------- stile ---------------- */
  const css = document.createElement('style');
  css.id = 'kxLookCss';
  css.textContent = `
/* scelta dell'aspetto (si apre dal cerchio con l'iniziale; uguale in tutti e tre gli aspetti) */
#av{cursor:pointer}
#lxPick{position:fixed;z-index:80;width:min(330px,calc(100vw - 24px));padding:14px;border-radius:18px;background:#0b1424;border:1px solid #22344f;box-shadow:0 26px 70px rgba(0,0,0,.6);display:none;font:14px ${SANS};color:#e8eef8;text-align:left}
#lxPick.on{display:block}
#lxPick h4{font-size:12.5px;font-weight:600;color:#8b9bb4;margin:2px 6px 10px;letter-spacing:.02em}
#lxPick button{all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:12px;width:100%;padding:9px 10px;border-radius:13px;border:1px solid transparent;margin-top:4px}
#lxPick button:hover{background:rgba(255,255,255,.045)}
#lxPick button:focus-visible{outline:2px solid #22d3ee;outline-offset:1px}
#lxPick button.on{border-color:rgba(45,212,191,.7);background:rgba(45,212,191,.08)}
#lxPick button b{display:block;font-size:14.5px;font-weight:700}
#lxPick button small{display:block;color:#8b9bb4;font-size:12px;margin-top:2px;line-height:1.3}
#lxPick .x-rad{margin-left:auto;width:20px;height:20px;border-radius:50%;border:2px solid #33475f;flex:none;box-sizing:border-box}
#lxPick button.on .x-rad{border-color:#2dd4bf;background:radial-gradient(circle,#2dd4bf 45%,transparent 50%)}
#lxPick .x-sw{position:relative;width:62px;height:42px;border-radius:10px;flex:none;overflow:hidden;border:1px solid #22344f}
#lxPick .x-sw-f{background:radial-gradient(60px 30px at 70% 0,rgba(139,92,246,.45),transparent),linear-gradient(rgba(34,211,238,.35) 1px,transparent 1px) 0 0/10px 10px,linear-gradient(90deg,rgba(34,211,238,.3) 1px,transparent 1px) 0 0/10px 10px,#03050c}
#lxPick .x-sw-f::before{content:'';position:absolute;left:0;top:0;bottom:0;width:11px;background:rgba(5,9,20,.92);border-right:1px solid rgba(34,211,238,.4)}
#lxPick .x-sw-f::after{content:'';position:absolute;left:17px;top:9px;width:36px;height:22px;border-radius:5px;border:1px solid #67e8f9;box-shadow:0 0 8px #22d3ee}
#lxPick .x-sw-m{background:radial-gradient(50px 30px at 80% 0,rgba(34,211,238,.25),transparent),#070d19}
#lxPick .x-sw-m::before{content:'';position:absolute;left:0;top:0;bottom:0;width:20px;background:#0b1527;border-right:1px solid #1d2b42}
#lxPick .x-sw-m::after{content:'';position:absolute;left:26px;top:9px;width:30px;height:22px;border-radius:5px;border:1px solid rgba(34,211,238,.6)}
#lxPick .x-sw-c{background:#0a111e}
#lxPick .x-sw-c::before{content:'';position:absolute;left:0;top:0;bottom:0;width:20px;background:#0c172a;border-right:1px solid #1d2b42}
#lxPick .x-sw-c::after{content:'';position:absolute;left:26px;top:9px;width:30px;height:22px;border-radius:4px;background:#101c30;border:1px solid #1d2b42;box-shadow:inset 3px 0 0 #2dd4bf}
#lxPick p{font-size:12px;color:#8b9bb4;margin:10px 6px 2px;line-height:1.4}

/* elementi propri: nascosti finché l'aspetto non è Futuro o Misto */
#lxSky,#lxBrand,#lxHome{display:none}
#lxHome [hidden]{display:none!important}

/* ======== comune a Futuro e Misto ======== */
html.lx{--lx-c1:#0a1328;--lx-c2:#060b18;--lx-line:rgba(125,211,252,.14);--lx-line2:rgba(125,211,252,.22);--lx-cy:#22d3ee;--lx-cy2:#67e8f9;--lx-vi:#a78bfa;
  --bg:#03050c!important;--pane:#050914!important;--glass:#0a1328!important;--line:#14233b!important;--txt:#eaf2ff!important;--mut:#93a4c3!important;--hov:rgba(34,211,238,.08)!important;
  --a1:#0e7490!important;--a2:#22d3ee!important;--a3:#2dd4bf!important;--ok:#34d399!important;--warn:#fbbf24!important;--bad:#fb7185!important;--kx-hi:#22d3ee}
html.lx-m{--lx-c1:#0d182c;--lx-c2:#0a1322;--bg:#070d19!important;--pane:#08101e!important;--glass:#0d182c!important;--line:#1a2a42!important}
html.lx,html.lx body{background:var(--bg)!important}
html.lx main{background:transparent!important}
html.lx #lxSky{display:block;position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}
#lxSky .x-au{position:absolute;border-radius:50%;animation:lxAu 22s ease-in-out infinite}
#lxSky .x-au1{left:-15%;top:-38%;width:75vw;height:780px;background:radial-gradient(closest-side,rgba(34,211,238,.2),transparent)}
#lxSky .x-au2{right:-22%;top:-12%;width:66vw;height:720px;background:radial-gradient(closest-side,rgba(139,92,246,.17),transparent);animation-delay:-8s}
#lxSky .x-au3{left:22%;bottom:-34%;width:60vw;height:640px;background:radial-gradient(closest-side,rgba(45,212,191,.11),transparent);animation-delay:-15s}
#lxSky .x-floor{position:absolute;left:-25%;right:-25%;bottom:-6%;height:520px;perspective:720px;-webkit-mask-image:linear-gradient(to top,#000 15%,transparent 88%);mask-image:linear-gradient(to top,#000 15%,transparent 88%)}
#lxSky .x-plane{position:absolute;inset:0;transform:rotateX(66deg);transform-origin:center bottom;overflow:hidden;opacity:.42}
#lxSky .x-lines{position:absolute;left:0;right:0;top:-56px;bottom:0;background-image:linear-gradient(rgba(34,211,238,.24) 1px,transparent 1px),linear-gradient(90deg,rgba(34,211,238,.2) 1px,transparent 1px);background-size:56px 56px;animation:lxGrid 3.2s linear infinite}
#lxSky .x-star{position:absolute;display:block;border-radius:50%;background:#cffafe;box-shadow:0 0 6px #67e8f9;opacity:.15;animation:lxTw 3.6s ease-in-out infinite}
@keyframes lxAu{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(6%,5%) scale(1.15)}}
@keyframes lxGrid{to{transform:translateY(56px)}}
@keyframes lxTw{0%,100%{opacity:.12}50%{opacity:.85}}
html.lx-m #lxSky .x-floor,html.lx-m #lxSky .x-star{display:none}
html.lx-m #lxSky .x-au{animation:none;opacity:.55}

/* riquadri, pulsanti, campi */
html.lx .glass{background:linear-gradient(160deg,var(--lx-c1),var(--lx-c2))!important;border:1px solid var(--lx-line)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 24px 60px -42px rgba(0,0,0,.9)!important}
html.lx .card.glass{border-radius:18px}
html.lx .btn{background:rgba(10,19,40,.85);border:1px solid var(--lx-line2);color:#dbe7f7}
html.lx .btn:hover{background:rgba(34,211,238,.1);border-color:rgba(34,211,238,.45)}
html.lx .btn.pri{background:linear-gradient(135deg,#22d3ee,#2dd4bf)!important;color:#021018!important;border:0!important;box-shadow:0 14px 32px -16px rgba(34,211,238,.95)!important}
html.lx .btn.pri:hover{filter:brightness(1.1)}
html.lx .btn.pri svg{color:#021018}
html.lx .icb{border-radius:12px;border:1px solid var(--lx-line2);background:rgba(8,14,30,.75)}
html.lx .icb:hover{border-color:rgba(34,211,238,.45);background:rgba(34,211,238,.08)}
html.lx .inp{background:rgba(3,8,20,.78)!important;border:1px solid var(--lx-line2)!important;border-radius:12px}
html.lx .inp:focus{border-color:var(--lx-cy)!important;box-shadow:0 0 0 3px rgba(34,211,238,.16)!important}
html.lx .inp::placeholder{color:#6f84a6}
html.lx .code{background:rgba(34,211,238,.08);color:#a5f3fc;border:1px solid rgba(34,211,238,.18)}
html.lx .fchip.on,html.lx .seg button.on{background:linear-gradient(135deg,#0e7490,#0f766e)!important;color:#fff!important}
html.lx .seg{background:rgba(3,8,20,.7);border:1px solid var(--lx-line)}
html.lx .tbl tbody tr:hover td{background:rgba(34,211,238,.06)}
html.lx .tog{background:rgba(6,11,24,.8);border-color:var(--lx-line)}
html.lx .pl,html.lx .dsec{background:rgba(6,11,24,.8)!important}
html.lx #drawer{background:linear-gradient(180deg,#081127,#050b18)!important;border-left:1px solid var(--lx-line2)}
html.lx #modal .glass{background:linear-gradient(170deg,#0b1730,#060c1a)!important;border-color:var(--lx-line2)!important}
html.lx ::-webkit-scrollbar-thumb{background:rgba(103,232,249,.18)}
html.lx .dv-tile{background:linear-gradient(150deg,color-mix(in srgb,var(--c) 14%,var(--lx-c1)),var(--lx-c2))!important}

/* barra in alto */
html.lx .topbar .search{border-radius:14px!important;background:rgba(8,14,30,.75)!important;border:1px solid rgba(125,211,252,.18)!important;box-shadow:inset 0 0 20px rgba(34,211,238,.05)!important}
html.lx .topbar .search svg{color:var(--lx-cy2)}
html.lx #newDev{position:relative;overflow:hidden;letter-spacing:.02em}
html.lx #newDev>svg{display:none}
html.lx #newDev::before{content:'';flex:none;width:17px;height:17px;background:currentColor;-webkit-mask:${BOLT} center/contain no-repeat;mask:${BOLT} center/contain no-repeat}
html.lx .avatar{background:linear-gradient(#060a16,#060a16) padding-box,conic-gradient(from 180deg,#22d3ee,#8b5cf6,#2dd4bf,#22d3ee) border-box!important;border:2px solid transparent!important;color:#e0faff!important;font-weight:800}
html.lx .ag-lim{border-radius:10px;border:1px solid var(--lx-line2);background:rgba(8,14,30,.75)}
html.lx .topbar h2{border-left-color:var(--lx-cy)!important}

/* schede dei gruppi (Home · Panoramica · …) e codici Downloader */
html.lx .hubbar button{background:rgba(10,19,40,.72);border:1px solid var(--lx-line);color:#c7d5ea}
html.lx .hubbar button:hover{background:rgba(34,211,238,.1)}
html.lx .hubbar button.on{background:linear-gradient(135deg,rgba(34,211,238,.26),rgba(139,92,246,.18));border-color:rgba(34,211,238,.6);color:#f0fdff;box-shadow:0 0 0 1px rgba(34,211,238,.18),0 10px 26px -14px rgba(34,211,238,.9)}
html.lx .hubbar button.on::before{background:#67e8f9;box-shadow:0 0 10px #22d3ee}
html.lx .dlbar .dl{border-radius:14px;background:linear-gradient(160deg,var(--lx-c1),var(--lx-c2));border:1px solid var(--lx-line)}
html.lx .dlbar .dl i{background:rgba(34,211,238,.12);color:#67e8f9;border:1px solid rgba(34,211,238,.25)}
html.lx .dlbar .dl b{color:#f0fdff}

/* menu laterale (computer e tablet) */
html.lx #side .brand svg.kx-logo{filter:drop-shadow(0 0 14px rgba(34,211,238,.45))!important}
html.lx #hub4side .nav .h4n{background:#fbbf24;color:#1c1300}
@media (min-width:701px){html.lx aside{background:rgba(5,9,20,.66)!important;border-right:1px solid rgba(125,211,252,.12)!important;-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}}
@media (min-width:701px) and (max-width:1180px){
  html.lx #hub4side .nav{border-radius:14px}
  html.lx #hub4side .nav.on{background:linear-gradient(145deg,rgba(34,211,238,.24),rgba(139,92,246,.14))!important;box-shadow:0 0 0 1px rgba(34,211,238,.45),0 10px 26px -12px rgba(34,211,238,.6);color:#e0faff}
  html.lx #hub4side .nav.on svg{color:#e0faff!important}
  html.lx #hub4side .nav.on::before{display:none}
}

/* telefono: menu a scomparsa scuro e barra in basso con il pulsante luminoso */
@media (max-width:700px){
  html.lx aside{background:#060b18!important}
  html.lx .topbar{background:rgba(3,6,14,.86)!important;border-bottom-color:var(--lx-line)!important}
  html.lx #kcTab{background:rgba(5,9,20,.88)!important;border-top:1px solid rgba(125,211,252,.14)!important}
  html.lx #kcTab button.on{color:#e0faff}
  html.lx #kcTab button.on svg{filter:drop-shadow(0 0 7px rgba(34,211,238,.75))}
  html.lx #kcTab button.plus span.p{width:56px;height:56px;margin-top:-26px;background:radial-gradient(circle at 50% 30%,#0e3a4d,#050b18 72%) padding-box,conic-gradient(from 180deg,#22d3ee,#8b5cf6,#2dd4bf,#22d3ee) border-box!important;border:2px solid transparent;box-sizing:border-box;box-shadow:0 0 0 4px rgba(34,211,238,.08),0 12px 30px -6px rgba(34,211,238,.75)!important}
  html.lx #kcTab button.plus span.p svg{display:none}
  html.lx #kcTab button.plus span.p::before{content:'';width:24px;height:24px;background:#a5f3fc;-webkit-mask:${BOLT} center/contain no-repeat;mask:${BOLT} center/contain no-repeat;filter:drop-shadow(0 0 6px #22d3ee)}
  html.lx #hub4{background:rgba(3,6,14,.9)}
}

/* accesso */
html.lx .lcard{background:linear-gradient(160deg,rgba(10,19,40,.94),rgba(6,11,24,.94))!important;border:1px solid rgba(125,211,252,.22)!important;box-shadow:0 40px 90px -40px rgba(34,211,238,.5)!important}

/* riquadri statistiche dei pannelli IPTV (KXStats.strip): vetro scuro con l'accento del colore e numeri chiari
   (contrasto da 7:1 in su, prima il bianco su azzurro, verde acqua e arancio stava fra 2,7:1 e 4:1).
   Il colore dice cosa significa il numero: verde attivi, ambra in scadenza, rosa scadute, ciano in diretta. */
html.lx .ks-tile{--kc:#22d3ee;--kv:#f1f5fb;position:relative;overflow:hidden;background:linear-gradient(155deg,color-mix(in srgb,var(--kc) 17%,#0a1328),#060b18 80%)!important;color:#e6eefb!important;border:1px solid color-mix(in srgb,var(--kc) 36%,transparent);border-radius:14px!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 18px 40px -30px color-mix(in srgb,var(--kc) 80%,transparent)!important;transition:transform .2s,border-color .2s,box-shadow .2s}
html.lx .ks-tile::before{content:'';position:absolute;left:14px;right:14px;top:0;height:2px;border-radius:0 0 2px 2px;background:linear-gradient(90deg,transparent,var(--kc),transparent);opacity:.9}
html.lx .ks-tile>div:first-child{color:var(--kv)!important;text-shadow:0 0 18px color-mix(in srgb,var(--kc) 45%,transparent)}
html.lx .ks-tile>div:last-child{color:#b6c3d9!important;opacity:1!important;font-weight:500}
html.lx .ks-tile.ks-act:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--kc) 72%,transparent);box-shadow:0 22px 46px -24px color-mix(in srgb,var(--kc) 90%,transparent)!important}
html.lx .ks-tile.ks-act:focus-visible{outline:2px solid var(--kv);outline-offset:2px}
html.lx .ks-tile[style*="background:#2f7fd6"]{--kc:#3b82f6;--kv:#93c5fd}
html.lx .ks-tile[style*="background:#1fa0b6"]{--kc:#22d3ee;--kv:#67e8f9}
html.lx .ks-tile[style*="background:#e08a1e"]{--kc:#f59e0b;--kv:#fcd34d}
html.lx .ks-tile[style*="background:#e0524f"]{--kc:#fb7185;--kv:#fda4af}
html.lx .ks-tile[style*="background:#2a9d5c"]{--kc:#34d399;--kv:#6ee7b7}
html.lx .ks-tile[style*="background:#7c4dff"]{--kc:#8b5cf6;--kv:#c4b5fd}
html.lx .ks-tile[style*="background:#d6336c"]{--kc:#ec4899;--kv:#f9a8d4}
html.lx .ks-tile[style*="background:#6f42c1"]{--kc:#8b5cf6;--kv:#c4b5fd}
html.lx .ks-tile[style*="background:#0ca678"]{--kc:#10b981;--kv:#6ee7b7}
html.lx .ks-tile[style*="background:#0d1117"]{--kc:#64748b;--kv:#f1f5fb}
html.lx .ks-tile[data-x="online"]{--kc:#22d3ee;--kv:#67e8f9}
html.lx .ks-tile[data-x="today"]{--kc:#2dd4bf;--kv:#5eead4}
html.lx .ks-tile[data-x="month"]{--kc:#818cf8;--kv:#a5b4fc}
html.lx .ks-tile[data-x="active"]{--kc:#34d399;--kv:#6ee7b7}
html.lx .ks-tile[data-x="conns"]{--kc:#38bdf8;--kv:#7dd3fc}
html.lx .ks-tile[data-x="total"]{--kc:#94a3b8;--kv:#f1f5fb}
html.lx .ks-tile[data-x="soon"]{--kc:#f59e0b;--kv:#fcd34d}
html.lx .ks-tile[data-x="expired"]{--kc:#fb7185;--kv:#fda4af}
html.lx .ks-tile[data-x="off"]{--kc:#64748b;--kv:#cbd5e1}
html.lx .ks-tile[data-x="trial"]{--kc:#c084fc;--kv:#e9d5ff}
/* «💰 da pagare» dei pannelli: ambra (soldi), grigio quando è 0; «Nuova attivazione» rosso più profondo (testo bianco 4,7:1 e più) */
html.lx .pay-panel-tile{background:rgba(251,191,36,.08)!important;border:1px solid rgba(251,191,36,.42)!important;color:#fde68a!important;border-radius:12px}
html.lx .pay-panel-tile:hover{background:rgba(251,191,36,.15)!important}
html.lx .pay-panel-tile.zero{background:rgba(148,163,184,.06)!important;border-color:rgba(148,163,184,.26)!important;color:#b6c3d9!important}
html.lx .btn.qa-red{background:linear-gradient(100deg,#e11d48,#9f1239)!important;box-shadow:0 12px 30px -14px rgba(244,63,94,.9)!important}

html.lx .kxpay-tile-wrap{margin-top:12px!important}
html.lx .ks-strip+.pay-panel-tile{margin-top:12px}
/* WOLF: sotto i 1920 px i pulsanti della linea vanno su una riga sotto i dati, così utente, scadenza e stato non si accavallano */
@media (min-width:1001px) and (max-width:1919px){
  html.lx .wf-row{grid-template-columns:72px minmax(150px,1.2fr) minmax(120px,1fr) minmax(140px,.9fr) minmax(140px,1fr);row-gap:10px}
  html.lx .wf-row>.wf-act{grid-column:1/-1;justify-content:flex-start;padding-left:82px}
}

/* Home: riquadri dei gruppi */
html.lx #v-home .h4-home-head{display:none}
html.lx .h4-home-tile{background:linear-gradient(160deg,var(--lx-c1),var(--lx-c2))!important;border:1px solid var(--lx-line)!important;border-radius:20px;transition:transform .3s cubic-bezier(.16,1,.3,1),box-shadow .3s,border-color .3s}
html.lx .h4-home-tile:hover{transform:translateY(-3px);border-color:rgba(34,211,238,.4)!important;box-shadow:0 30px 70px -36px rgba(34,211,238,.55),0 0 0 1px rgba(34,211,238,.3)!important}
html.lx .h4-home-icon{background:color-mix(in srgb,var(--hc) 14%,transparent);border:1px solid color-mix(in srgb,var(--hc) 40%,transparent);box-shadow:0 0 18px -6px var(--hc)}
html.lx .h4-home-metric{background:rgba(3,8,20,.55)!important;border:1px solid rgba(125,211,252,.08)}
html.lx .h4-home-metric b{font-weight:800;font-size:21px}
html.lx .h4-home-panels span{background:rgba(34,211,238,.07);border:1px solid rgba(34,211,238,.16);color:#a9bbd6}

/* Home: saluto, console di attivazione e stato del servizio */
html.lx #lxHome.on{display:block;max-width:1500px;margin:0 auto 18px}
#lxHome .x-gr{margin:0 0 16px}
#lxHome .x-gr h2{margin:0;font-size:clamp(22px,2.2vw,28px);font-weight:800;letter-spacing:-.01em;line-height:1.2}
#lxHome .x-gr h2 em{font-style:normal;color:#2dd4bf}
#lxHome .x-gr small{display:block;margin-top:4px;color:var(--mut);font-size:13px}
#lxHome .x-r1{display:grid;grid-template-columns:minmax(0,1.62fr) minmax(330px,1fr);gap:18px;align-items:stretch}
#lxHome .x-r1:has(>.x-con[hidden]){grid-template-columns:minmax(0,1fr)}
#lxHome .x-con{position:relative;box-sizing:border-box;padding:28px;border-radius:24px;display:flex;flex-wrap:wrap;gap:20px 24px;align-items:center;min-height:330px;min-width:0}
#lxHome .x-cn{position:absolute;width:18px;height:18px;pointer-events:none}
#lxHome .x-kick{font:700 11.5px ${MONO};letter-spacing:.22em;color:var(--lx-cy2);text-transform:uppercase;display:flex;align-items:center;gap:8px;line-height:1.3}
#lxHome .x-kick svg{width:16px;height:16px;flex:none}
#lxHome .x-cl{flex:1 1 280px;min-width:0}
#lxHome .x-cl h3{margin:10px 0 0;font-size:30px;font-weight:800;letter-spacing:-.02em;line-height:1.12;color:#f4f8ff}
#lxHome .x-hf>span{background:linear-gradient(90deg,#67e8f9,#a78bfa);-webkit-background-clip:text;background-clip:text;color:transparent}
#lxHome .x-cl label{display:block;margin-top:22px;font-size:12.5px;font-weight:600;color:var(--mut)}
#lxHome .x-row{display:flex;gap:10px;margin-top:8px}
#lxHome #lxCode{flex:1;min-width:0;width:100%;height:60px;box-sizing:border-box;padding:0 18px;border-radius:16px;border:1px solid rgba(103,232,249,.5);background:rgba(3,8,20,.85);color:#f0fdff;font:700 clamp(18px,1.6vw,24px) ${MONO};letter-spacing:.18em;text-transform:uppercase;outline:0;box-shadow:0 0 0 4px rgba(34,211,238,.08),inset 0 0 24px rgba(34,211,238,.1),0 0 30px -12px rgba(34,211,238,.7);transition:border-color .2s,box-shadow .2s}
#lxHome #lxCode:focus{border-color:#67e8f9;box-shadow:0 0 0 4px rgba(34,211,238,.18),inset 0 0 24px rgba(34,211,238,.14),0 0 36px -10px rgba(34,211,238,.9)}
#lxHome #lxCode::placeholder{color:#30475f;letter-spacing:.22em}
#lxHome .x-go{all:unset;box-sizing:border-box;cursor:pointer;flex:none;height:60px;padding:0 26px;border-radius:16px;background:linear-gradient(135deg,#22d3ee,#2dd4bf);color:#021018;font:800 15px ${SANS};letter-spacing:.06em;box-shadow:0 16px 36px -14px rgba(34,211,238,.95);position:relative;overflow:hidden;display:inline-flex;align-items:center;justify-content:center;gap:8px;transition:filter .2s,transform .12s}
#lxHome .x-go svg{width:18px;height:18px;flex:none}
#lxHome .x-go:hover{filter:brightness(1.12)}
#lxHome .x-go:active{transform:scale(.97)}
#lxHome .x-go:focus-visible{outline:2px solid #e0faff;outline-offset:3px}
#lxHome .x-go::after{content:'';position:absolute;top:0;bottom:0;left:0;width:38%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent);animation:lxShine 3.4s ease-in-out infinite;pointer-events:none}
#lxHome .x-only{margin-top:22px}
@keyframes lxShine{0%{transform:translateX(-140%) skewX(-20deg)}55%,100%{transform:translateX(280%) skewX(-20deg)}}
#lxHome .x-hint{display:flex;gap:8px 12px;flex-wrap:wrap;align-items:center;margin-top:14px;font-size:12.5px;color:#8b9bb4;line-height:1.4}
#lxHome .x-pn{padding:4px 10px;border-radius:8px;background:rgba(139,92,246,.09);border:1px solid rgba(139,92,246,.25);font:500 12px ${MONO};color:#c4b5fd}
#lxHome .x-orbit{position:relative;flex:0 1 320px;max-width:100%;aspect-ratio:340/270;margin:0 auto}
#lxHome .x-orbit svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
#lxHome .x-o1{fill:none;stroke:rgba(103,232,249,.13);stroke-dasharray:3 6}
#lxHome .x-o2{fill:none;stroke:rgba(167,139,250,.16)}
#lxHome .x-ln{fill:none;stroke:url(#lxLn);stroke-width:1.5}
#lxHome .x-fl{fill:none;stroke-width:3;stroke-linecap:round;stroke-dasharray:12 308;animation:lxFlow 2.4s linear infinite}
@keyframes lxFlow{from{stroke-dashoffset:320}to{stroke-dashoffset:0}}
#lxHome .x-node{position:absolute;transform:translate(-50%,-50%);display:inline-flex;align-items:center;gap:7px;padding:6px 11px;border-radius:10px;background:rgba(5,9,20,.9);border:1px solid rgba(125,211,252,.28);font:700 11.5px ${MONO};letter-spacing:.06em;color:#e7f6ff;white-space:nowrap;box-shadow:0 8px 22px -10px rgba(0,0,0,.8)}
#lxHome .x-node i{width:7px;height:7px;border-radius:50%;background:#34d399;box-shadow:0 0 8px #34d399;flex:none}
#lxHome .x-orb{display:none}
#lxHome .x-sv{position:relative;box-sizing:border-box;padding:24px;border-radius:24px;min-width:0;display:flex;flex-direction:column;gap:18px;text-align:left}
#lxHome .x-sb{display:flex;align-items:center;gap:24px}
#lxHome .x-rings{position:relative;width:184px;height:184px;flex:none}
#lxHome .x-rings svg{width:100%;height:100%;transform:rotate(-90deg);filter:drop-shadow(0 0 10px rgba(34,211,238,.28))}
#lxHome .x-rings circle{fill:none;stroke-width:10;stroke-linecap:round}
#lxHome .x-trk{stroke:rgba(125,211,252,.08)}
#lxHome .x-val{transition:stroke-dashoffset 1.4s cubic-bezier(.16,1,.3,1)}
#lxHome .x-ce{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
#lxHome .x-ce b{font-size:36px;font-weight:800;line-height:1;color:#f4f8ff}
#lxHome .x-ce small{margin-top:5px;font-size:12px;font-weight:600;color:#a7f3d0;display:inline-flex;align-items:center;gap:6px}
#lxHome .x-ce small i{width:7px;height:7px;border-radius:50%;background:#34d399;box-shadow:0 0 8px #34d399}
#lxHome .x-leg{flex:1 1 auto;min-width:0;display:grid;gap:14px;margin:0;padding:0;list-style:none}
#lxHome .x-leg li{display:grid;grid-template-columns:10px minmax(0,1fr);column-gap:9px;align-items:center}
#lxHome .x-leg li>i{width:10px;height:10px;border-radius:3px}
#lxHome .x-leg span{color:var(--mut);font-size:13px}
#lxHome .x-leg b{grid-column:2;font-size:24px;font-weight:800;line-height:1.15;color:#f4f8ff;white-space:nowrap}
#lxHome .x-leg b small{font-size:12px;font-weight:500;color:var(--mut);margin-left:6px}
#lxHome .x-cr{display:grid;gap:12px;padding-top:16px;border-top:1px solid var(--lx-line)}
#lxHome .x-crl{display:grid;gap:11px}
#lxHome .x-crr{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 10px;align-items:baseline}
#lxHome .x-crr span{font-weight:600;font-size:13.5px;color:#dbe7f7}
#lxHome .x-crr b{font-weight:800;font-size:15px;color:#f4f8ff}
#lxHome .x-bar{grid-column:1/-1;height:8px;border-radius:4px;background:rgba(125,211,252,.08);overflow:hidden;display:block}
#lxHome .x-bar i{display:block;height:100%;width:calc(var(--w) * 100%);background:var(--k);border-radius:4px;box-shadow:0 0 12px -2px var(--k);transform-origin:left;animation:lxGrow 1.3s .3s cubic-bezier(.16,1,.3,1) both}
@keyframes lxGrow{from{transform:scaleX(0)}}
#lxHome .x-mini{display:none}
@media (max-width:1100px){#lxHome .x-r1{grid-template-columns:minmax(0,1fr)}}
@media (min-width:701px) and (max-width:1100px){
  #lxHome .x-sv{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:30px;align-items:center}
  #lxHome .x-sv>.x-kick{grid-column:1/-1}
  #lxHome .x-cr{border-top:0;padding-top:0;border-left:1px solid var(--lx-line);padding-left:28px}
}

/* ======== Futuro ======== */
html.lx-f .card .hd h3{font:700 12px ${MONO}!important;letter-spacing:.18em;text-transform:uppercase;color:var(--lx-cy2)}
html.lx-f .card .hd h3 small{font:500 12.5px ${SANS}!important;letter-spacing:0;text-transform:none;color:var(--mut)}
html.lx-f .card.glass,html.lx-f .kpi.glass{border-radius:20px}
html.lx-f .tbl th{font:700 11px ${MONO};letter-spacing:.14em;text-transform:uppercase;color:#7f93b3}
html.lx-f #newDev{background:linear-gradient(135deg,#22d3ee,#2dd4bf 50%,#a78bfa)!important;font-weight:800;box-shadow:0 0 0 1px rgba(255,255,255,.12) inset,0 14px 34px -12px rgba(34,211,238,.9)!important}
html.lx-f #newDev::after{content:'';position:absolute;top:0;bottom:0;left:0;width:38%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent);animation:lxShine 3.4s ease-in-out infinite;pointer-events:none}
html.lx-f .lcard h1.grad{background:linear-gradient(90deg,#f0fdff,#67e8f9 45%,#a78bfa)!important;-webkit-background-clip:text!important;background-clip:text!important;-webkit-text-fill-color:transparent!important;color:transparent!important;font-weight:800;letter-spacing:.34em!important}
html.lx-f .h4-home-title b{font:700 12.5px ${MONO};letter-spacing:.18em;text-transform:uppercase;color:#dff7ff}
html.lx-f .h4-home-metric small{font-family:${MONO};font-size:10.5px;letter-spacing:.04em}
html.lx-f #lxHome .x-go{text-transform:uppercase;letter-spacing:.1em}
/* console: bordo che gira, angoli da mirino */
@property --lxa{syntax:'<angle>';initial-value:0deg;inherits:false}
@keyframes lxRot{to{--lxa:360deg}}
html.lx-f #lxHome .x-con{border:1px solid transparent;background:linear-gradient(160deg,#0a1328,#060b18) padding-box,conic-gradient(from var(--lxa),rgba(34,211,238,.95),rgba(139,92,246,.75),rgba(45,212,191,.06) 38%,rgba(45,212,191,.06) 62%,rgba(34,211,238,.95)) border-box;animation:lxRot 7s linear infinite;box-shadow:0 40px 90px -40px rgba(34,211,238,.45)}
html.lx-f #lxHome .x-tl{left:14px;top:14px;border-left:2px solid #67e8f9;border-top:2px solid #67e8f9;border-radius:4px 0 0 0}
html.lx-f #lxHome .x-tr{right:14px;top:14px;border-right:2px solid #67e8f9;border-top:2px solid #67e8f9;border-radius:0 4px 0 0}
html.lx-f #lxHome .x-bl{left:14px;bottom:14px;border-left:2px solid #a78bfa;border-bottom:2px solid #a78bfa;border-radius:0 0 0 4px}
html.lx-f #lxHome .x-br{right:14px;bottom:14px;border-right:2px solid #a78bfa;border-bottom:2px solid #a78bfa;border-radius:0 0 4px 0}
html.lx-f #lxHome .x-sv{background:linear-gradient(160deg,#0a1328,#060b18);border:1px solid var(--lx-line);box-shadow:0 30px 70px -44px rgba(34,211,238,.4)}
html.lx-f #lxHome .x-gr h2{font:700 12.5px ${MONO};letter-spacing:.22em;text-transform:uppercase;color:#67e8f9}
html.lx-f #lxHome .x-gr h2 em{color:#67e8f9}
html.lx-f #lxHome .x-gr small{font:500 12.5px ${MONO};color:#93a4c3}
html.lx-f #lxHome .x-bar{background:repeating-linear-gradient(90deg,rgba(125,211,252,.1) 0 9px,transparent 9px 12px);border-radius:2px}
html.lx-f #lxHome .x-bar i{border-radius:2px;-webkit-mask:repeating-linear-gradient(90deg,#000 0 9px,transparent 9px 12px);mask:repeating-linear-gradient(90deg,#000 0 9px,transparent 9px 12px)}
html.lx-f #lxHome .x-km,html.lx-f #lxHome .x-hm{display:none}
/* computer: barra a icone, nome KAIROS con ruolo e orologio in alto, titolo della pagina piccolo */
@media (min-width:1181px){
  html.lx-f #app.on{grid-template-columns:96px 1fr!important}
  html.lx-f #side{padding:20px 0 16px!important;align-items:center;position:relative;z-index:20;overflow:visible!important}
  html.lx-f #side .brand{justify-content:center;padding:0 0 18px!important;margin:0}
  html.lx-f #side .brand>:not(svg){display:none!important}
  html.lx-f #side .brand svg.kx-logo{width:56px!important;height:56px!important}
  html.lx-f #hub4side{align-items:center;gap:10px;width:100%}
  html.lx-f #hub4side .nav{width:56px!important;height:56px;padding:0!important;gap:0;justify-content:center;border-radius:16px;color:#93a4c3}
  html.lx-f #hub4side .nav .h4l{position:absolute;left:68px;top:50%;transform:translate(-6px,-50%);opacity:0;pointer-events:none;padding:7px 12px;border-radius:10px;background:#0b1424;border:1px solid rgba(125,211,252,.25);color:#e8f6ff;font:600 13px ${SANS};white-space:nowrap;box-shadow:0 14px 34px rgba(0,0,0,.5);transition:opacity .15s,transform .15s;z-index:60}
  html.lx-f #hub4side .nav:hover .h4l,html.lx-f #hub4side .nav:focus-visible .h4l{opacity:1;transform:translate(0,-50%)}
  html.lx-f #hub4side .nav svg{width:22px;height:22px;color:#93a4c3!important;opacity:1}
  html.lx-f #hub4side .nav:hover{background:rgba(34,211,238,.1)!important}
  html.lx-f #hub4side .nav:hover svg{color:#e0faff!important}
  html.lx-f #hub4side .nav.on{background:linear-gradient(145deg,rgba(34,211,238,.28),rgba(139,92,246,.18))!important;box-shadow:0 0 0 1px rgba(34,211,238,.55),0 10px 30px -8px rgba(34,211,238,.6)}
  html.lx-f #hub4side .nav.on svg{color:#e0faff!important}
  html.lx-f #hub4side .nav.on::before{display:none}
  html.lx-f #hub4side .nav .h4n{position:absolute;top:6px;right:6px;margin:0;min-width:16px;height:16px;padding:0 4px;border-radius:8px;font-size:10px}
  html.lx-f #side #logout{width:56px;height:46px;padding:0!important;justify-content:center;font-size:0;gap:0;border-radius:14px;margin-left:auto!important;margin-right:auto!important}
  html.lx-f #side #logout svg{width:20px;height:20px}
  html.lx-f #lxBrand{display:block;flex:none;margin-right:6px}
  html.lx-f #lxBrand .x-wm{display:block;font:800 23px ${SANS};letter-spacing:.34em;background:linear-gradient(90deg,#f0fdff,#67e8f9 45%,#a78bfa);-webkit-background-clip:text;background-clip:text;color:transparent;line-height:1.1}
  html.lx-f #lxBrand .x-mt{display:flex;align-items:center;gap:10px;margin-top:4px;font:500 12.5px ${MONO};color:#93a4c3;white-space:nowrap}
  html.lx-f #lxBrand .x-rl{padding:2px 9px;border-radius:6px;border:1px solid rgba(167,139,250,.55);color:#ddd6fe;font-weight:700;letter-spacing:.14em;text-transform:uppercase;box-shadow:0 0 14px -4px rgba(139,92,246,.8)}
  html.lx-f .topbar h2#vTitle{font:700 12px ${MONO}!important;letter-spacing:.24em;text-transform:uppercase;color:#67e8f9;border-left:1px solid rgba(125,211,252,.28)!important;padding:6px 0 6px 16px!important;align-self:center}
  html.lx-f #lxHome .x-gr{display:none}
}

/* ======== Misto ======== */
html.lx-m .card .hd h3{color:#f1f6ff}
html.lx-m #lxHome .x-con{background:linear-gradient(160deg,#0d1a30,#0a1322);border:1px solid rgba(34,211,238,.28);box-shadow:0 30px 70px -46px rgba(34,211,238,.55)}
html.lx-m #lxHome .x-sv{background:linear-gradient(160deg,#0d182c,#0a1322);border:1px solid var(--lx-line)}
html.lx-m #lxHome .x-kick{font:600 14px ${SANS};letter-spacing:0;text-transform:none;color:#67e8f9}
html.lx-m #lxHome .x-sv .x-kick{font:700 16px ${SANS};color:#f1f6ff}
html.lx-m #lxHome .x-cr .x-kick{font:700 14px ${SANS};color:#f1f6ff}
html.lx-m #lxHome .x-cl h3{font-size:27px}
html.lx-m #lxHome .x-orbit{flex-basis:270px}
html.lx-m #lxHome #lxCode{font-size:clamp(17px,1.4vw,21px);letter-spacing:.14em;border-color:rgba(103,232,249,.35);box-shadow:inset 0 0 18px rgba(34,211,238,.06)}
html.lx-m #lxHome .x-go::after{display:none}
html.lx-m #lxHome .x-pn{font:600 12px ${SANS};background:none;border:0;padding:0;color:#8b9bb4}
html.lx-m #lxHome .x-fl{animation-duration:3.6s}
html.lx-m #lxHome .x-node{font:600 12.5px ${SANS};letter-spacing:0}
html.lx-m #lxHome .x-kf,html.lx-m #lxHome .x-hf{display:none}
html.lx-m #hub4side .nav{border-radius:12px;color:#c3cfe2}
html.lx-m #hub4side .nav svg{color:#8fa3c2!important}
html.lx-m #hub4side .nav.on{color:#fff}
html.lx-m #hub4side .nav.on svg{color:#67e8f9!important}
@media (min-width:1181px){
  html.lx-m #hub4side .nav.on{background:linear-gradient(100deg,rgba(34,211,238,.17),rgba(34,211,238,.02))!important}
  html.lx-m #hub4side .nav.on::before{background:#22d3ee!important;box-shadow:0 0 12px #22d3ee!important}
}

/* tablet e telefono */
@media (max-width:1180px){#lxHome .x-con{min-height:0}}
@media (max-width:700px){
  #lxHome .x-gr{margin-bottom:12px}
  #lxHome .x-r1{gap:14px}
  #lxHome .x-con{padding:20px;border-radius:20px}
  #lxHome .x-orbit{display:none}
  #lxHome .x-cl h3{font-size:22px}
  #lxHome #lxCode{height:54px;font-size:19px;letter-spacing:.14em;padding:0 14px}
  #lxHome .x-go{height:54px;padding:0 18px}
  #lxHome .x-sv{padding:18px;border-radius:20px;gap:14px}
  #lxHome .x-sb{display:none}
  #lxHome .x-mini{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:10px}
  #lxHome .x-mi{display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px 6px;border-radius:16px;background:rgba(3,8,20,.55);border:1px solid rgba(125,211,252,.1);min-width:0}
  #lxHome .x-rg{position:relative;width:64px;height:64px}
  #lxHome .x-rg svg{width:100%;height:100%;transform:rotate(-90deg)}
  #lxHome .x-rg circle{fill:none;stroke-width:6;stroke-linecap:round}
  #lxHome .x-rg b{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:800;color:#f4f8ff}
  #lxHome .x-mi small{font-size:11.5px;color:var(--mut);text-align:center;line-height:1.2}
  /* Futuro sul telefono: un grande pulsante rotondo al posto del campo (si apre l'attivazione con la tastiera pronta) */
  html.lx-f #lxHome .x-con{justify-content:center;padding:26px 18px}
  html.lx-f #lxHome .x-cl{display:none}
  html.lx-f #lxHome .x-orb{all:unset;box-sizing:border-box;cursor:pointer;position:relative;display:grid;place-items:center;width:212px;height:212px;margin:4px auto;border-radius:50%;text-align:center;-webkit-tap-highlight-color:transparent}
  html.lx-f #lxHome .x-orb::before{content:'';position:absolute;inset:0;border-radius:50%;padding:3px;background:conic-gradient(from var(--lxa),#22d3ee,#8b5cf6,#2dd4bf,#22d3ee);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:lxRot 6s linear infinite;box-shadow:0 0 40px -6px rgba(34,211,238,.6)}
  html.lx-f #lxHome .x-orb::after{content:'';position:absolute;inset:14px;border-radius:50%;background:radial-gradient(circle at 50% 35%,rgba(34,211,238,.28),rgba(5,9,20,.95) 70%);box-shadow:inset 0 0 40px rgba(34,211,238,.25)}
  html.lx-f #lxHome .x-orb>span{position:relative;z-index:1;display:grid;justify-items:center;gap:6px}
  html.lx-f #lxHome .x-orb svg{width:34px;height:34px;color:#a5f3fc;filter:drop-shadow(0 0 10px #22d3ee)}
  html.lx-f #lxHome .x-orb b{font:800 21px ${SANS};letter-spacing:.26em;margin-right:-.26em;color:#f0fdff}
  html.lx-f #lxHome .x-orb small{font-size:12px;color:#93a4c3}
  html.lx-f #lxHome .x-orb:active{transform:scale(.97)}
  html.lx-f #lxHome .x-orb:focus-visible{outline:2px solid #67e8f9;outline-offset:4px}
}

/* «riduci movimento»: tutto fermo */
@media (prefers-reduced-motion:reduce){
  #lxSky *,#lxHome *,#lxHome *::before,#lxHome *::after,html.lx #newDev::after,html.lx-f #lxHome .x-con{animation:none!important;transition:none!important}
}
`;
  document.head.appendChild(css);

  /* ---------------- fonti in più (solo Futuro e Misto) ---------------- */
  function fonts() {
    if (q('#lxFonts')) return;
    const l = document.createElement('link');
    l.id = 'lxFonts'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@800&family=JetBrains+Mono:wght@600;700&display=swap';
    document.head.appendChild(l);
  }

  /* ---------------- sfondo (aurora, pavimento a griglia, stelle) ---------------- */
  const STARS = [[6, 12, 2], [14, 30, 1.5], [22, 8, 2.5], [31, 22, 1.5], [38, 6, 2], [47, 17, 1.5], [55, 9, 2], [63, 26, 1.5], [71, 5, 2.5], [78, 19, 1.5], [86, 11, 2], [93, 28, 1.5], [9, 44, 1.5], [27, 52, 2], [58, 41, 1.5], [74, 48, 2], [88, 39, 1.5], [44, 34, 2]];
  function sky() {
    if (q('#lxSky')) return;
    const s = document.createElement('div');
    s.id = 'lxSky'; s.setAttribute('aria-hidden', 'true');
    s.innerHTML = '<i class="x-au x-au1"></i><i class="x-au x-au2"></i><i class="x-au x-au3"></i><div class="x-floor"><div class="x-plane"><div class="x-lines"></div></div></div>' +
      STARS.map(([x, y, r], i) => `<i class="x-star" style="left:${x}%;top:${y}%;width:${r}px;height:${r}px;animation-delay:${-(i * 0.37 % 3.6).toFixed(2)}s"></i>`).join('');
    document.body.prepend(s);
  }

  /* ---------------- nome KAIROS, ruolo e orologio in alto (Futuro, computer) ---------------- */
  function brand() {
    let b = q('#lxBrand');
    const title = q('#vTitle');
    if (!b && title) {
      b = document.createElement('div');
      b.id = 'lxBrand';
      b.innerHTML = '<b class="x-wm">KAIROS</b><div class="x-mt"><span class="x-rl"></span><span class="x-clk"></span><span class="x-dt"></span></div>';
      title.before(b);
    }
    return b;
  }
  function tick() {
    if (look !== 'futuro' || document.hidden) return;
    const b = q('#lxBrand'); if (!b || !b.offsetParent) return;
    const now = new Date();
    const rl = q('.x-rl', b), ck = q('.x-clk', b), dt = q('.x-dt', b);
    const role = window.KXRoleTxt || 'Master';
    if (rl.textContent !== role) rl.textContent = role;
    ck.textContent = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const d = '· ' + now.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
    if (dt.textContent !== d) dt.textContent = d;
  }

  /* ---------------- barra a icone: il nome della voce compare accanto (niente doppio suggerimento del browser) ---------------- */
  function railTitles() {
    const box = q('#hub4side'); if (!box) return;
    for (const b of box.children) {
      if (look === 'futuro') {
        const t = b.getAttribute('title');
        if (t) { b.setAttribute('aria-label', t); b.removeAttribute('title'); }
      } else if (!b.getAttribute('title') && b.getAttribute('aria-label')) b.setAttribute('title', b.getAttribute('aria-label'));
    }
  }

  /* ---------------- Home: console di attivazione e stato del servizio ---------------- */
  const ICO_BOLT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>';
  const SLOTS = [[58, 46], [282, 46], [58, 224], [282, 224]];
  const FLOW = ['#34d399', '#67e8f9', '#67e8f9', '#a78bfa'];
  const KCOL = ['#22d3ee', '#2dd4bf', '#a78bfa', '#fbbf24', '#38bdf8', '#f472b6'];
  const pathOf = ([x, y]) => `M170 135 C ${x < 170 ? 120 : 220} 135, ${x < 170 ? 100 : 240} ${y}, ${x} ${y}`;
  const fmtCode = (v) => { const c = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); return c.length > 4 ? c.slice(0, 4) + '-' + c.slice(4) : c; };
  const isAgent = () => typeof D !== 'undefined' && D && D.role === 'agent';
  const canWizard = () => { const n = q('#newDev'); return !!n && n.style.display !== 'none'; };
  const canCode = () => !isAgent() || !!(((D.me || {}).perms) || {}).create;
  const liveVisible = () => { const n = q('#side .nav[data-v="live"]'); return !!n && n.style.display !== 'none'; };
  let homeBox = null, lastNodes = null;

  function buildHome() {
    const home = q('#v-home'); if (!home) return null;
    if (homeBox) { if (homeBox.nextElementSibling !== home) home.before(homeBox); return homeBox; }
    homeBox = document.createElement('div');
    homeBox.id = 'lxHome';
    homeBox.innerHTML = `<div class="x-gr"><h2></h2><small></small></div>
<div class="x-r1">
  <section class="x-con" aria-labelledby="lxConT">
    <i class="x-cn x-tl"></i><i class="x-cn x-tr"></i><i class="x-cn x-bl"></i><i class="x-cn x-br"></i>
    <div class="x-cl">
      <div class="x-kick"><span class="x-kf">Console di attivazione</span><span class="x-km">${ICO_BOLT}Attivazione lampo</span></div>
      <h3 id="lxConT"><span class="x-hf">Scrivi il codice.<br><span>La linea la trova KAIROS.</span></span><span class="x-hm">Scrivi il codice,<br>la linea la trova KAIROS.</span></h3>
      <form class="x-cf" autocomplete="off">
        <label for="lxCode">Codice TV</label>
        <div class="x-row"><input id="lxCode" maxlength="9" spellcheck="false" autocapitalize="characters" placeholder="KXAB-12CD" aria-describedby="lxHint"><button type="submit" class="x-go">Attiva</button></div>
      </form>
      <button type="button" class="x-go x-only" hidden>${ICO_BOLT}Apri l'attivazione</button>
      <div class="x-hint" id="lxHint"><span>Il codice che il cliente ti manda in foto</span><span class="x-pn" hidden></span></div>
    </div>
    <div class="x-orbit" aria-hidden="true">
      <svg viewBox="0 0 340 270">
        <defs>
          <radialGradient id="lxCore"><stop offset="0" stop-color="#67e8f9" stop-opacity=".5"/><stop offset="1" stop-color="#22d3ee" stop-opacity="0"/></radialGradient>
          <linearGradient id="lxLn" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#22d3ee" stop-opacity=".15"/><stop offset="1" stop-color="#a78bfa" stop-opacity=".45"/></linearGradient>
          <linearGradient id="lxHx" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#67e8f9"/><stop offset=".55" stop-color="#22d3ee"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient>
        </defs>
        <circle class="x-o1" cx="170" cy="135" r="104"/><circle class="x-o2" cx="170" cy="135" r="66"/>
        <g class="x-ps"></g>
        <circle cx="170" cy="135" r="60" fill="url(#lxCore)"/>
        <g transform="translate(170 135)">
          <polygon points="0,-38 32.9,-19 32.9,19 0,38 -32.9,19 -32.9,-19" fill="#0c0f22" stroke="url(#lxHx)" stroke-width="3" stroke-linejoin="round"/>
          <g><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="16s" repeatCount="indefinite"/>
            <g transform="rotate(-48)"><ellipse rx="46" ry="17" fill="none" stroke="#22d3ee" stroke-width="2.6"/><circle cx="46" r="5" fill="#fff"/><circle cx="-46" r="4" fill="#fb923c"/></g></g>
          <polygon points="0,-13 9,0 0,13 -9,0" fill="#fff"/>
        </g>
      </svg>
      <div class="x-nodes"></div>
    </div>
    <button type="button" class="x-orb" aria-label="Attiva un cliente: tocca e scrivi il codice"><span>${ICO_BOLT}<b>ATTIVA</b><small>tocca e scrivi il codice</small></span></button>
  </section>
  <section class="x-sv" aria-labelledby="lxStT">
    <div class="x-kick" id="lxStT"><span class="x-kf">Stato del servizio</span><span class="x-km">Il servizio adesso</span></div>
    <div class="x-sb">
      <div class="x-rings"><svg viewBox="0 0 200 200" aria-hidden="true">
        <circle class="x-trk" cx="100" cy="100" r="90"/><circle class="x-val" data-r="0" cx="100" cy="100" r="90" stroke="#22d3ee"/>
        <circle class="x-trk" cx="100" cy="100" r="72"/><circle class="x-val" data-r="1" cx="100" cy="100" r="72" stroke="#34d399"/>
        <circle class="x-trk" cx="100" cy="100" r="54"/><circle class="x-val" data-r="2" cx="100" cy="100" r="54" stroke="#a78bfa"/>
      </svg><div class="x-ce"><b></b><small></small></div></div>
      <ul class="x-leg"></ul>
    </div>
    <div class="x-mini"></div>
    <div class="x-cr" hidden><div class="x-kick"><span class="x-kf">Energia crediti</span><span class="x-km">Crediti</span></div><div class="x-crl"></div></div>
  </section>
</div>`;
    home.before(homeBox);
    const inp = q('#lxCode', homeBox);
    inp.addEventListener('input', () => { const v = fmtCode(inp.value); if (v !== inp.value) inp.value = v; });
    q('form', homeBox).addEventListener('submit', (e) => { e.preventDefault(); startActivation(inp.value); });
    q('.x-only', homeBox).addEventListener('click', () => startActivation(''));
    q('.x-orb', homeBox).addEventListener('click', () => startActivation(''));
    if (reduce()) q('.x-orbit svg', homeBox).pauseAnimations?.();
    return homeBox;
  }

  /* apre l'attivazione di «Nuovo cliente» e, se c'è un codice, lo scrive nel suo campo come faresti tu */
  function startActivation(code) {
    const nd = q('#newDev'); if (!nd || nd.style.display === 'none') return;
    const old = q('#wzCode') || q('#eCode');
    nd.click();
    code = fmtCode(code); if (!code) return;
    const fill = () => {
      const f = q('#wzCode') || q('#eCode');
      if (!f || (f === old && !f.offsetParent)) return false; // non il campo di un'attivazione chiusa prima
      f.value = code; f.dispatchEvent(new Event('input', { bubbles: true })); f.focus();
      const c = q('#lxCode'); if (c) c.value = '';
      return true;
    };
    if (fill()) return;
    let n = 0;
    const t = setInterval(() => { if (fill() || ++n > 200) clearInterval(t); }, 50);
  }

  const ringSet = (el, frac) => {
    const r = +el.getAttribute('r'), C = 2 * Math.PI * r, f = Math.max(0, Math.min(1, frac || 0));
    el.style.strokeDasharray = `${C} ${C}`;
    const want = String(C * (1 - f));
    if (el.dataset.off === want) return;
    el.dataset.off = want;
    if (!el.style.strokeDashoffset) el.style.strokeDashoffset = String(C);
    requestAnimationFrame(() => requestAnimationFrame(() => { el.style.strokeDashoffset = want; }));
  };
  const num = (t) => { const n = +String(t).replace(/\./g, '').replace(',', '.'); return Number.isFinite(n) ? n : null; };
  const short = (n) => String(n || '').replace(/\s*IPTV$/i, '');
  const pct = (a, b) => b > 0 ? Math.round(a / b * 100) : 0;
  const setHtml = (el, html) => { if (el.innerHTML !== html) el.innerHTML = html; };
  const setText = (el, t) => { if (el.textContent !== t) el.textContent = t; };

  function paintHome() {
    if (look === 'classico' || typeof D === 'undefined' || !D || !Array.isArray(D.devices)) return;
    const home = q('#v-home'); if (!home) return;
    const box = buildHome(); if (!box) return;
    const on = home.classList.contains('on');
    box.classList.toggle('on', on);
    if (!on) return;
    // saluto (come quello di prima: ora del giorno, nome, data, ruolo)
    const hr = new Date().getHours(), hi = hr < 5 ? 'Buonanotte' : hr < 13 ? 'Buongiorno' : hr < 18 ? 'Buon pomeriggio' : hr < 23 ? 'Buonasera' : 'Buonanotte';
    const who = (isAgent() && D.me && D.me.username) || D.user || '';
    const day = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
    setHtml(q('.x-gr h2', box), `${hi}${who ? `, <em>${h(who)}</em>` : ''}`);
    setText(q('.x-gr small', box), day + (window.KXRoleTxt ? ' · ' + window.KXRoleTxt : ''));
    // console: solo per chi può aprire l'attivazione; il campo del codice solo per chi attiva clienti Kairos
    const con = q('.x-con', box), code = canCode();
    con.hidden = !canWizard();
    q('.x-cf', box).hidden = !code;
    q('.x-only', box).hidden = code;
    // pannelli collegati attorno al logo (nomi veri, dalle linee già caricate)
    const s = window.KXDashLines?.homeSummary?.();
    const panels = s && s.at ? s.panels || [] : [];
    const shown = panels.slice(0, panels.length > 4 ? 3 : 4).map((p) => short(p.name));
    if (panels.length > 4) shown.push('+' + (panels.length - 3));
    const sig = shown.join('|');
    if (sig !== lastNodes) {
      lastNodes = sig;
      q('.x-ps', box).innerHTML = shown.map((_, i) => `<path class="x-ln" d="${pathOf(SLOTS[i])}"/><path class="x-fl" d="${pathOf(SLOTS[i])}" stroke="${FLOW[i]}" style="animation-delay:${(i * 0.6).toFixed(1)}s;filter:drop-shadow(0 0 5px ${FLOW[i]})"/>`).join('');
      q('.x-nodes', box).innerHTML = shown.map((n, i) => `<span class="x-node" style="left:${(SLOTS[i][0] / 340 * 100).toFixed(2)}%;top:${(SLOTS[i][1] / 270 * 100).toFixed(2)}%"><i></i>${h(n)}</span>`).join('');
    }
    const pn = q('.x-pn', box);
    pn.hidden = !panels.length;
    setText(pn, panels.length === 1 ? '1 pannello collegato' : `${panels.length} pannelli collegati`);
    // stato del servizio: clienti attivi, online adesso, linee attive (solo quello che il pannello sa già)
    const all = D.devices, act = all.filter((d) => d.status === 'active').length;
    const live = liveVisible() ? window.KC?.live?.counts?.online ?? null : null;
    const tot = panels.length ? s.total || null : null;
    const items = [
      { k: 'Clienti attivi', v: act, f: all.length ? act / all.length : 0, c: '#22d3ee', sub: all.length ? `su ${all.length}` : '' },
      live == null ? null : { k: 'Online adesso', v: live, f: act ? live / act : 0, c: '#34d399', sub: act ? `${pct(live, act)}% degli attivi` : '' },
      tot ? { k: 'Linee attive', v: tot.active, f: tot.active + tot.expired ? tot.active / (tot.active + tot.expired) : 0, c: '#a78bfa', sub: tot.expired ? `${tot.expired} scadute` : '' } : null,
    ];
    qa('.x-rings .x-val', box).forEach((c) => { const it = items[+c.dataset.r]; c.style.display = it ? '' : 'none'; if (it) ringSet(c, it.f); });
    const ce = q('.x-ce', box);
    setText(q('b', ce), String(live == null ? act : live));
    setHtml(q('small', ce), live == null ? 'attivi' : '<i></i>online');
    setHtml(q('.x-leg', box), items.filter(Boolean).map((it) => `<li><i style="background:${it.c};box-shadow:0 0 10px ${it.c}"></i><span>${h(it.k)}</span><b>${h(String(it.v))}${it.sub ? `<small>${h(it.sub)}</small>` : ''}</b></li>`).join(''));
    const C28 = 2 * Math.PI * 28;
    setHtml(q('.x-mini', box), items.filter(Boolean).map((it) => `<div class="x-mi"><div class="x-rg"><svg viewBox="0 0 64 64" aria-hidden="true"><circle class="x-trk" cx="32" cy="32" r="28"/><circle cx="32" cy="32" r="28" stroke="${it.c}" style="stroke-dasharray:${C28} ${C28};stroke-dashoffset:${(C28 * (1 - Math.max(0, Math.min(1, it.f)))).toFixed(2)}"/></svg><b>${h(String(it.v))}</b></div><small>${h(it.k)}</small></div>`).join(''));
    // crediti dei pannelli (quelli che il pannello mostra già nel riepilogo delle linee)
    const crs = panels.filter((p) => p.cr && p.cr !== '…').map((p, i) => {
      const t = String(p.cr), [a, b] = t.split('/');
      return { n: short(p.name), t, v: a.trim() === '∞' ? Infinity : num(a), of: b != null ? num(b) : null, k: KCOL[i % KCOL.length] };
    });
    const max = Math.max(1, ...crs.map((c) => (Number.isFinite(c.v) && c.of == null ? c.v : 0)));
    q('.x-cr', box).hidden = !crs.length;
    setHtml(q('.x-crl', box), crs.map((c) => { const w = c.v === Infinity ? 1 : c.of ? (c.v || 0) / c.of : (c.v || 0) / max; return `<div class="x-crr"><span>${h(c.n)}</span><b>${h(c.t)}</b><span class="x-bar"><i style="--w:${Math.max(0.02, Math.min(1, w)).toFixed(3)};--k:${c.k}"></i></span></div>`; }).join(''));
  }

  /* ---------------- riquadri statistiche: significato di ogni numero (data-x) per colorarlo in Futuro e Misto ----------------
     Solo un attributo in più sull'HTML di KXStats.strip: niente cambia nel Classico, i riquadri restano cliccabili come prima. */
  const SEM_K = { online: 'online', today: 'today', month: 'month', active: 'active', conns: 'conns', total: 'total', soon: 'soon', expired: 'expired', off: 'off', trial: 'trial' };
  const SEM_L = [[/^online/i, 'online'], [/create oggi/i, 'today'], [/questo mese/i, 'month'], [/scadono|in scadenza/i, 'soon'], [/scadut/i, 'expired'], [/disattivat/i, 'off'], [/^prov[ae]/i, 'trial'], [/totali/i, 'total'], [/connession/i, 'conns'], [/attiv/i, 'active']];
  const semOf = (t) => {
    if (t.k && /^(panel|app)-/.test(t.k)) return '';
    if (t.k && SEM_K[t.k]) return SEM_K[t.k];
    const l = String(t.label || '').replace(/<[^>]*>/g, ' ').trim();
    const m = SEM_L.find(([re]) => re.test(l)); return m ? m[1] : '';
  };
  if (window.KXStats && typeof KXStats.strip === 'function' && !KXStats.strip.lx) {
    const strip0 = KXStats.strip;
    KXStats.strip = Object.assign(function (tiles, opt) {
      const html = strip0.apply(this, arguments);
      try {
        const T = (tiles || []).filter((t) => t && t.v != null && t.v !== '');
        let i = 0;
        return html.replace(/<div class="ks-tile/g, (m) => { const x = T[i++]; const s = x ? semOf(x) : ''; return s ? `<div data-x="${s}" class="ks-tile` : m; });
      } catch { return html; }
    }, { lx: true });
  }

  /* ---------------- scelta dell'aspetto ---------------- */
  let pick = null;
  function picker() {
    if (pick) return pick;
    pick = document.createElement('div');
    pick.id = 'lxPick'; pick.setAttribute('role', 'dialog'); pick.setAttribute('aria-label', 'Aspetto del pannello');
    pick.innerHTML = `<h4>Aspetto del pannello</h4>
      <button type="button" data-lx="futuro"><i class="x-sw x-sw-f"></i><span><b>Futuro</b><small>Icone, scritte spaziate, effetti animati</small></span><i class="x-rad"></i></button>
      <button type="button" data-lx="misto"><i class="x-sw x-sw-m"></i><span><b>Misto</b><small>Menu con le scritte, più calmo</small></span><i class="x-rad"></i></button>
      <button type="button" data-lx="classico"><i class="x-sw x-sw-c"></i><span><b>Classico</b><small>Il pannello com'era prima</small></span><i class="x-rad"></i></button>
      <p>Cambia solo l'aspetto: clienti, linee e impostazioni restano uguali. Vale per questo dispositivo.</p>`;
    document.body.appendChild(pick);
    qa('[data-lx]', pick).forEach((b) => b.addEventListener('click', () => { setLook(b.dataset.lx); close(); }));
    pick.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { close(); q('#av')?.focus(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const bs = qa('[data-lx]', pick), i = bs.indexOf(document.activeElement); bs[(i + (e.key === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length].focus(); }
    });
    document.addEventListener('click', (e) => { if (pick.classList.contains('on') && !pick.contains(e.target) && !e.target.closest('#av')) close(); }, true);
    addEventListener('resize', () => { if (pick.classList.contains('on')) place(); });
    return pick;
  }
  function place() {
    const a = q('#av'); if (!a || !pick) return;
    const r = a.getBoundingClientRect(), w = pick.offsetWidth;
    pick.style.top = Math.round(r.bottom + 10) + 'px';
    pick.style.left = Math.round(Math.max(12, Math.min(innerWidth - w - 12, r.right - w))) + 'px';
  }
  function open() {
    picker();
    qa('[data-lx]', pick).forEach((b) => { const on = b.dataset.lx === look; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    pick.classList.add('on'); place();
    (q('[data-lx].on', pick) || q('[data-lx]', pick)).focus();
    q('#av')?.setAttribute('aria-expanded', 'true');
  }
  function close() { if (pick) pick.classList.remove('on'); q('#av')?.setAttribute('aria-expanded', 'false'); }
  function hookAvatar() {
    const a = q('#av'); if (!a || a.dataset.lx) return;
    a.dataset.lx = '1';
    a.title = 'Aspetto del pannello'; a.setAttribute('role', 'button'); a.tabIndex = 0;
    a.setAttribute('aria-haspopup', 'dialog'); a.setAttribute('aria-expanded', 'false');
    a.addEventListener('click', () => (pick && pick.classList.contains('on') ? close() : open()));
    a.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  }

  /* ---------------- applica ---------------- */
  function apply() {
    root.dataset.look = look;
    root.classList.toggle('lx', look !== 'classico');
    root.classList.toggle('lx-f', look === 'futuro');
    root.classList.toggle('lx-m', look === 'misto');
    if (look !== 'classico') { fonts(); sky(); brand(); tick(); paintHome(); }
    else if (homeBox) homeBox.classList.remove('on');
    railTitles();
  }
  function setLook(v) {
    if (!LOOKS.includes(v) || v === look) return;
    look = v;
    try { localStorage.setItem(KEY, v); } catch {}
    apply();
  }
  apply();
  hookAvatar();

  // Home: home4.js ridisegna la pagina a ogni aggiornamento → ridipingo i numeri (una volta per fotogramma)
  let raf = 0;
  const later = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (look !== 'classico') paintHome(); }); };
  const home = q('#v-home');
  if (home) new MutationObserver(later).observe(home, { childList: true, attributes: true, attributeFilter: ['class'] });
  addEventListener('kxlines:update', later);
  addEventListener('kxpay:update', later);
  const box4 = q('#hub4side');
  if (box4) new MutationObserver(() => { if (look === 'futuro') railTitles(); }).observe(box4, { subtree: true, attributes: true, attributeFilter: ['title'] });
  setInterval(tick, 1000);
  document.addEventListener('visibilitychange', tick);

  window.KXLook = { get: () => look, set: setLook, open };
})();
