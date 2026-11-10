/* KAIROS Control — tema «Notte» (10 novembre 2026): colori presi dal logo, blu notte + turchese.
   Un solo colore d'accento per azioni e voci selezionate; verde, giallo e rosso solo per gli stati.
   --a1 è il turchese profondo degli sfondi pieni (testo bianco leggibile, contrasto 4,5:1); --kx-hi il turchese
   brillante del logo per pulsanti principali (con testo scuro), bordi attivi e dettagli.
   Solo stile: va caricato per ultimo (sopra il tema scuro di agents.js). Per tornare indietro basta togliere lo script. */
(() => {
  if (document.getElementById('kxThemeNotte')) return;
  const css = document.createElement('style');
  css.id = 'kxThemeNotte';
  css.textContent = `
:root{--bg:#0a111e!important;--pane:#0b1526!important;--glass:#0f1a2c!important;--line:#1d2b42!important;--txt:#e8eef8!important;--mut:#8b9bb4!important;--hov:#13223a!important;
  --a1:#0d857b!important;--a2:#22d3ee!important;--a3:#2dd4bf!important;--ok:#34d399!important;--warn:#fbbf24!important;--bad:#f87171!important;--kx-hi:#2dd4bf}
html,body{background:radial-gradient(1100px 620px at 8% -12%,rgba(45,212,191,.075),transparent 62%),radial-gradient(900px 560px at 108% 4%,rgba(56,189,248,.06),transparent 60%),var(--bg)!important;background-attachment:fixed!important}
aside{background:linear-gradient(180deg,#0c172a,#0a1322)!important;border-right:1px solid var(--line)!important}

/* riquadri: blu notte con un filo di luce in alto */
.glass{background:linear-gradient(180deg,#101c30,#0d1828)!important;border-color:var(--line)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.035)!important}

/* pulsanti: neutri; il principale turchese brillante con testo scuro */
.btn{background:#13213a;border-color:#22324d}
.btn:hover{background:#182a47}
.btn.pri{background:linear-gradient(135deg,#2dd4bf,#22d3ee)!important;color:#042f2e!important;font-weight:700}
.btn.pri:hover{background:linear-gradient(135deg,#5eead4,#67e8f9)!important}
.btn.pri svg{color:#042f2e}

/* campi */
.inp{background:#0b1424!important;border-color:var(--line)!important}
.inp:focus{border-color:var(--kx-hi)!important;box-shadow:0 0 0 3px rgba(45,212,191,.18)!important}

/* menu: icone neutre, la voce aperta turchese */
.nav.on{background:rgba(45,212,191,.12)!important}
.nav.on::before{background:var(--kx-hi)!important}
#hub4side .nav{--sc:#2dd4bf!important}
#hub4side .nav:not(.on) svg{color:#7f90aa!important}
#hub4side .nav:not(.on):hover svg{color:#c7d2e2!important}
#hub4{--sc:#0d857b!important}

/* titolo della pagina: barretta turchese (prima il colore della sezione) */
.topbar h2{border-left-color:var(--kx-hi)!important}

/* grigi rimasti del tema scuro → blu notte */
aside .foot{background:#0f1b2e!important}
.tog{background:#0d1828;border-color:var(--line)}
.pl,.dsec{background:#0d1828!important}
#drawer{background:#0c1627!important}
#modal .glass{background:linear-gradient(180deg,#101c30,#0d1828)!important}
.dvt th{background:#0d1828}
.ag-chk label,.ag-radio label{background:#0d1828}
.wz input.inp,.wz select.inp,.wz textarea.inp{background:#0b1424}

/* nome e ruolo: logo più grande */
#side .brand svg.kx-logo{width:56px!important;height:56px!important}
#side .brand b.brandName{font-size:17px}
#side .brand small.brandRole{font-size:13px}

/* Home: riquadri calmi (colore solo sull'icona e un alone), numeri chiari; saluto con nome, data e ruolo */
.h4-home-tile{background:linear-gradient(160deg,#111e33,#0d1828)!important;border-color:var(--line)!important;overflow:hidden}
.h4-home-tile::after{content:'';position:absolute;right:-45px;bottom:-55px;width:180px;height:180px;border-radius:50%;background:radial-gradient(closest-side,color-mix(in srgb,var(--hc) 24%,transparent),transparent);pointer-events:none}
.h4-home-tile:hover{border-color:color-mix(in srgb,var(--hc) 55%,var(--line))!important;box-shadow:0 14px 30px rgba(0,0,0,.28)!important}
.h4-home-tile>*{position:relative;z-index:1}
.h4-home-metric{background:rgba(255,255,255,.04)!important}
.h4-home-metric b{color:#f1f5fb!important}
.h4-home-head h2 .h4-hi{color:var(--kx-hi)}
`;
  document.head.appendChild(css);
})();
