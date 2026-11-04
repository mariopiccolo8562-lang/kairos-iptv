/* KAIROS Control 3.1 — voci importanti a colori in tutto il pannello.
   Ogni elemento ha il suo colore (--c): fondo e bordo tinti, icona e numero colorati, quello attivo pieno.
   Solo stile (vale anche per i contenuti che il pannello ridisegna da solo). Va caricato per ultimo. */
(() => {
  const P = ['#4f8cff', '#a78bfa', '#2dd4bf', '#f5b041', '#fb7185', '#34d399', '#fb923c', '#38bdf8'];
  const nth = (sel) => P.map((c, i) => `${sel}:nth-child(${P.length}n+${i + 1}){--c:${c}}`).join('\n');
  const tint = (p) => `color-mix(in srgb,var(--c) ${p}%,transparent)`;
  const css = document.createElement('style');
  css.textContent = `
/* Panoramica — azioni rapide */
${nth('#qaA .qa-a')}
#qaA .qa-a{background:linear-gradient(150deg,${tint(18)},${tint(5)})!important;border-color:${tint(40)}!important}
#qaA .qa-a:hover{background:linear-gradient(150deg,${tint(30)},${tint(10)})!important;border-color:var(--c)!important;transform:translateY(-1px)}
#qaA .qa-a i{width:38px;height:38px;display:grid;place-items:center;border-radius:11px;background:${tint(26)};box-shadow:inset 0 0 0 1px ${tint(45)}}
#qaA .qa-a b{color:#fff}

/* Panoramica — interruttori rapidi */
${nth('#qaSw .tog')}
#qaSw .tog{background:linear-gradient(150deg,${tint(12)},transparent)!important;border:1px solid ${tint(30)}!important;border-left:4px solid var(--c)!important}
#qaSw .tog b{color:#fff}
#qaSw .tog.on{background:linear-gradient(150deg,${tint(26)},${tint(6)})!important;border-color:${tint(60)}!important;border-left-color:var(--c)!important;box-shadow:0 8px 24px -14px var(--c)}
#qaSw .tog.on i{background:var(--c)!important}

/* numeri in evidenza (Panoramica e pagine con riquadri) */
${nth('#kpis .kpi')}
#kpis .kpi:nth-child(1){--c:#34d399}#kpis .kpi:nth-child(2){--c:#f5b041}#kpis .kpi:nth-child(3){--c:#38bdf8}#kpis .kpi:nth-child(4){--c:#a78bfa}
#kpis .kpi,.kc-k>.kpi,.kc-k>.kc-kp{background:linear-gradient(160deg,${tint(17)},transparent 70%)!important;border:1px solid ${tint(35)}!important;border-top:3px solid var(--c)!important}
#kpis .kpi .v{color:var(--c)}
${nth('.kc-k>*')}

/* Clienti — riquadri in alto */
.dv-tile{--c:#4f8cff}
.dv-tile.all{--c:#4f8cff}.dv-tile.active{--c:#34d399}.dv-tile.soon{--c:#f5b041}.dv-tile.pending{--c:#fb923c}.dv-tile.expired{--c:#fb7185}.dv-tile.disabled{--c:#94a3b8}
.dv-tile{background:linear-gradient(150deg,${tint(16)},transparent)!important;border:1px solid ${tint(38)}!important;border-left:4px solid var(--c)!important}
.dv-tile b{color:var(--c)!important}.dv-tile em{color:#fff}
.dv-tile:hover{background:linear-gradient(150deg,${tint(26)},${tint(4)})!important}
.dv-tile.on{background:linear-gradient(150deg,${tint(34)},${tint(10)})!important;border-color:var(--c)!important;box-shadow:0 10px 26px -14px var(--c)!important}

/* schede e filtri dentro le pagine (Armada, Linee collegate, Errori, Richieste…) */
${nth('.filters .fchip')}
.filters .fchip{background:${tint(13)}!important;border-color:${tint(40)}!important;color:#eef1f8!important;font-weight:700}
.filters .fchip:hover{background:${tint(24)}!important}
.filters .fchip.on{background:var(--c)!important;border-color:transparent!important;color:#fff!important;box-shadow:0 8px 22px -12px var(--c)}
.filters .fchip span{background:rgba(0,0,0,.22)!important;color:#fff!important}
.filters .fchip.on span{background:rgba(255,255,255,.25)!important}

/* scelte a pillola (Tipo, Durata, App collegata…) */
${nth('.ar-ch button')}
${nth('.ll-apps button')}
.ar-ch button,.ll-apps button{background:${tint(12)}!important;border-color:${tint(40)}!important;color:#eef1f8!important;font-weight:600}
.ar-ch button.on,.ll-apps button.on{background:var(--c)!important;border-color:transparent!important;color:#fff!important}

/* titoli delle sezioni principali: piccola barra colorata */
${nth('main section.view.on > .card > .hd h3, main section.view.on > div > .card > .hd h3')}
main .card > .hd h3{position:relative}
`;
  document.head.appendChild(css);
})();
/* Online ora: i riquadri seguono i colori dei pallini (blu collegati, verde guardano, giallo nei menu) */
(() => { const st = document.createElement('style'); st.textContent = '#v-live .kc-k>.kpi:nth-child(1){--c:#4f8cff}#v-live .kc-k>.kpi:nth-child(2){--c:#22c55e}#v-live .kc-k>.kpi:nth-child(3){--c:#facc15}#v-live .kc-k>.kpi:nth-child(4){--c:#a78bfa}'; document.head.appendChild(st); })();
