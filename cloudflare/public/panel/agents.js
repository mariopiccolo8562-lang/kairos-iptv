/* KAIROS Control 2.3 — Agenti (reseller), pannello ridotto per gli agenti, menu a gruppi e stile più sobrio.
   Usa le funzioni di app.js e kc.js ($, $$, esc, api, toast, ask, ago, fmtD, D, TITLES, view, load, renderDevices…). */
(() => {
  /* ---------- stile: piatto, grigio scuro, accento blu, niente bagliori ---------- */
  const css = document.createElement('style');
  css.textContent = `
:root{--bg:#16181d;--glass:#1e2127;--line:#2c3038;--txt:#e7e9ee;--mut:#8d93a0;--ok:#3fbf7f;--warn:#e0a431;--bad:#e5534b;--a1:#3d7cf5!important;--a2:#5b8ff7!important;--a3:#2f63c9!important;--pane:#1b1d22;--hov:#252931}
#dlCode{font-size:15px!important;font-weight:600}#donut svg{filter:none!important}#donut svg *{filter:none!important}
html,body{background:var(--bg);font-family:Inter,'Segoe UI',system-ui,-apple-system,sans-serif;font-size:14px}
.bgfx,.gridfx,#spot{display:none!important}
.glass{background:var(--glass)!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;border:1px solid var(--line);border-radius:10px;box-shadow:none!important}
.orb,.kpi .v,.legend b,.brand b,.lcard h1,.tv .c b.n{font-family:inherit!important;letter-spacing:0!important}
.grad{background:none!important;color:var(--txt)!important;-webkit-text-fill-color:currentColor}
.lcard{border-radius:12px}.lcard::before{display:none}.lcard h1{font-size:24px;font-weight:700;letter-spacing:.12em!important}
.hex svg,.brand svg{filter:none!important}
.inp{border-radius:8px;background:#14161a;border:1px solid var(--line);padding:11px 13px;font-size:14px}
.inp:focus{border-color:var(--a1);box-shadow:0 0 0 3px rgba(61,124,245,.18)}
.btn{border-radius:8px;padding:10px 16px;font-weight:600;background:#262a32;border-color:#323743}
.btn:hover{background:#2d323b;transform:none}
.btn.pri{background:var(--a1)!important;color:#fff!important;box-shadow:none!important;border:0}
.btn.pri:hover{background:#346ee0!important}
.btn.sm{border-radius:7px;padding:7px 11px}
#app.on{grid-template-columns:240px 1fr}
aside{background:var(--pane)!important;backdrop-filter:none!important;padding:18px 12px;gap:2px;overflow-y:auto}
.brand{padding:0 8px 18px}.brand svg{width:30px}.brand b{font-size:15px;letter-spacing:.14em!important}.brand small{font-size:10px;letter-spacing:.2em}
.nav{padding:9px 12px;border-radius:7px;font-weight:500;color:#b4b9c4;gap:12px;font-size:14px}
.nav svg{width:18px;height:18px;opacity:.85}
.nav:hover{background:var(--hov);color:#fff}
.nav.on{background:rgba(61,124,245,.14)!important;color:#fff}
.nav.on::before{left:-12px;top:7px;bottom:7px;width:3px;box-shadow:none;background:var(--a1)}
.nav .bdg,.kc-nb{background:var(--a1)!important;color:#fff!important}
.nav-h{font-size:11px;font-weight:700;letter-spacing:.09em;color:#6c7280;padding:16px 12px 6px;text-transform:uppercase}
#side .nav{padding:7px 12px;font-size:13.5px;min-height:20px}
#side .nav.nav-col{display:none!important}
#side .nav-h[data-sec]{display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;border-radius:6px;padding:14px 10px 5px 12px;transition:color .15s}
#side .nav-h[data-sec]:hover{color:#aab1bf}
#side .nav-h[data-sec] span{flex:1}
#side .nav-h .chev{width:14px;height:14px;transition:transform .2s;opacity:.7}
#side .nav-h.closed .chev{transform:rotate(-90deg)}
#side .nav-h .hn{font-size:10.5px;letter-spacing:0;min-width:16px;height:16px;padding:0 5px;border-radius:8px;background:var(--a1);color:#fff;display:none;place-items:center}
#side .nav-h .hn:not(:empty){display:grid}
#side .nav-h:focus-visible{outline:2px solid var(--a1);outline-offset:1px}
aside .foot{display:none!important}
#logout{margin-top:auto!important}
.nav-h.big{font-size:12px;color:#c9ced8;letter-spacing:.14em;padding:22px 12px 2px;margin-top:6px;border-top:1px solid var(--line)}.nav-h.big:first-of-type{border-top:0;margin-top:0;padding-top:10px}
aside .foot{border-radius:8px;background:#1f2228!important}
main{padding:22px clamp(16px,2.6vw,34px) 60px;background:var(--bg)}
.topbar{margin-bottom:20px}.topbar h2{font-size:22px;font-weight:600}
.search{border-radius:8px}
.avatar{border-radius:50%;background:#2c3140!important;color:#fff;width:36px;height:36px;font-size:14px}
.view{animation:none}
.kpi{padding:18px}.kpi .halo{display:none}.kpi:hover{transform:none}.kpi .v{font-size:30px;font-weight:700}
.card{padding:18px}.card h3{font-size:15px;font-weight:600}
.fchip{border-radius:7px}.fchip.on,.seg button.on{background:var(--a1)!important;color:#fff!important}
.seg{border-radius:8px;background:#14161a}.seg button{border-radius:6px}
.tbl{border-spacing:0}.tbl td{background:transparent;border-top:0;border-bottom:1px solid var(--line);border-radius:0!important;border-left:0!important;border-right:0!important}
.tbl tbody tr:hover td{background:var(--hov)}.tbl tr{animation:none}
.code{border-radius:5px;background:#14161a}
.st{border-radius:5px;padding:4px 9px}.st i{box-shadow:none}
.icb{border-radius:7px}.icb:hover{border-color:var(--line);background:var(--hov)}
.tog{border-radius:8px;background:#1a1d22}.tog.on i{background:var(--a1)!important;box-shadow:none!important}
.pl,.dsec{border-radius:10px!important;background:#1a1d22!important}
#drawer{background:#1b1d22!important;border-radius:0!important}#drawer.full{background:var(--bg)!important;left:240px}
#modal .glass{background:#1e2127!important}
.toast{background:#22262d;border-radius:8px}.toast i{box-shadow:none}
.dv-card{border-radius:10px;background:var(--glass)}.dv-card:hover{transform:none;background:#22252c}
.dv-tile{border-radius:10px;background:var(--glass)}.dv-tile.on{background:rgba(61,124,245,.12)!important;border-color:rgba(61,124,245,.6)!important;box-shadow:none!important}
.dv-tile i{border-radius:8px}
.dv-pc{border-radius:10px;background:rgba(224,164,49,.07)}
.dv-exp s,.dv-exp.warn s,.dv-exp.bad s{background:currentColor!important}.dv-exp.ok s{color:var(--ok)}.dv-exp.warn s{color:var(--warn)}.dv-exp.bad s{color:var(--bad)}
.dvt th{background:#1b1d22}.dvt tbody tr.sel{background:rgba(61,124,245,.12)}
.dvt-bulk{background:#20314f!important;border-color:rgba(61,124,245,.5)!important;border-radius:8px}
.dvt-ib{border-radius:7px}.dvt-ib:hover{transform:none}
.dnav button.on{border-color:rgba(61,124,245,.6)!important;background:rgba(61,124,245,.14)!important}.dnav button.on i{background:var(--a1)!important}
.kc-step>i{background:var(--a1)!important;box-shadow:none!important}
.kc-dns.saved{background:rgba(61,124,245,.06)!important;border-color:rgba(61,124,245,.35)!important}
.demo-tag{background:var(--a1);color:#fff}
.st-tab.on{border-color:rgba(61,124,245,.6)!important;background:rgba(61,124,245,.1)!important}
/* agenti */
.ag-bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px}.ag-bar .inp{flex:1;min-width:220px;margin:0}
.ag-bulk-wrap{max-height:68vh;overflow:auto;padding-right:4px}.ag-bulk-steps{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}.ag-bulk-step{padding:5px 9px;border:1px solid var(--line);border-radius:999px;color:var(--mut);font-size:12px}.ag-bulk-step.on{border-color:var(--a1);color:#fff;background:rgba(61,124,245,.14)}
.ag-bulk-group{border:1px solid var(--line);border-radius:10px;padding:11px;margin:10px 0;background:rgba(255,255,255,.02)}.ag-bulk-group h4{margin:0 0 8px;font-size:13.5px}.ag-bulk-perms{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:7px}.ag-bulk-perm{display:grid;grid-template-columns:minmax(0,1fr) 145px;gap:8px;align-items:center;padding:7px 8px;border-radius:7px;background:var(--glass);font-size:12.5px}.ag-bulk-perm small{display:block;color:var(--mut);font-size:11px;margin-top:2px;line-height:1.3}.ag-bulk-perm select,.ag-bulk-list select{margin:0}
.ag-bulk-lists{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:9px}.ag-bulk-list{border:1px solid var(--line);border-radius:9px;padding:10px;min-width:0}.ag-bulk-list h5{margin:0 0 6px;font-size:13px}.ag-bulk-list .ag-chk{max-height:145px;overflow:auto;margin:6px 0}.ag-bulk-list small{display:block;color:var(--mut);font-size:11.5px;line-height:1.4;margin-top:6px}.ag-bulk-agents{max-height:42vh;overflow:auto;border:1px solid var(--line);border-radius:9px;padding:5px}.ag-bulk-agent{display:flex;gap:9px;align-items:center;padding:8px;border-bottom:1px solid var(--line);font-size:13px}.ag-bulk-agent:last-child{border-bottom:0}.ag-bulk-agent small{display:block;color:var(--mut)}.ag-bulk-summary{background:var(--glass);border:1px solid var(--line);border-radius:9px;padding:12px;margin:8px 0;font-size:13px}.ag-bulk-summary li{margin:4px 0}
@media(max-width:600px){.ag-bulk-wrap{max-height:64vh}.ag-bulk-perm{grid-template-columns:1fr}.ag-bulk-perms,.ag-bulk-lists{grid-template-columns:1fr}.ag-bar .inp{min-width:100%}}
.ag-tbl{width:100%;border-collapse:collapse;font-size:13.5px}
.ag-tbl th{text-align:left;font-size:12px;font-weight:600;color:var(--mut);padding:11px 12px;border-bottom:1px solid var(--line);white-space:nowrap}
.ag-tbl td{padding:12px;border-bottom:1px solid var(--line);vertical-align:middle}
.ag-tbl tbody tr{cursor:pointer}.ag-tbl tbody tr:hover{background:var(--hov)}
.ag-tbl small{display:block;color:var(--mut);font-size:12px;margin-top:2px}
.ag-tbl .num{color:var(--mut);width:1%}
.ag-tbl td.dn{min-width:190px}.dn-r{display:flex;gap:6px;align-items:baseline;font-size:12.5px;line-height:1.35;margin:1px 0}
.dn-k{flex:none;font-size:9.5px;font-weight:800;letter-spacing:.04em;padding:1px 5px;border-radius:4px;color:#fff;background:#38bdf8}.dn-k.op{background:#a78bfa}.dn-k.mx{background:#fb7185}
.dn-r i{font-style:normal}.dn-r .dn-all{color:var(--ok)}.dn-r .dn-no{color:var(--warn)}
.chip{display:inline-block;font-size:11.5px;font-weight:600;padding:3px 8px;border-radius:5px;background:#2a2f39;color:#c9cdd6;margin:2px 4px 2px 0}
.chip.b{background:rgba(61,124,245,.16);color:#8fb3ff}
.chip.g{background:rgba(63,191,127,.15);color:#6fd6a1}.chip.r{background:rgba(229,83,75,.15);color:#f08a84}.chip.y{background:rgba(224,164,49,.15);color:#ecc06f}
.ag-st{display:inline-flex;align-items:center;gap:6px;font-weight:600;font-size:12.5px}.ag-st i{width:7px;height:7px;border-radius:50%;background:currentColor}
.ag-st.on{color:var(--ok)}.ag-st.off{color:var(--bad)}
.ag-bar2{height:5px;border-radius:5px;background:#2a2e36;margin-top:6px;overflow:hidden;max-width:120px}.ag-bar2 s{display:block;height:100%;background:var(--a1)}
.ag-host{margin-bottom:16px;border-left:4px solid #38bdf8}.ag-hrow{display:flex;gap:8px;flex-wrap:wrap}.ag-hrow .inp{flex:1;min-width:220px;margin:0}.ag-hlink{margin-top:10px;font-size:13.5px}.ag-hlink b{color:#38bdf8}.ag-hnote{margin:12px 0 0;color:var(--mut);font-size:12.5px;line-height:1.5}
.ag-apg{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-top:10px}.ag-ap{border:1px solid var(--line);border-radius:12px;padding:10px 12px;background:rgba(255,255,255,.02)}.ag-ap .ag-sub{margin:6px 0 0 18px;padding-left:10px;border-left:2px solid var(--line)}
#agPage{position:fixed;top:0;bottom:0;right:0;left:240px;z-index:21;background:var(--bg);display:none;flex-direction:column}
#agPage.on{display:flex}
#agPage .ah{display:flex;align-items:center;gap:12px;padding:16px 28px;border-bottom:1px solid var(--line);background:var(--pane)}
#agPage .ah h3{flex:1;font-size:18px;font-weight:600}
#agPage .ab{flex:1;overflow:auto;padding:22px 28px}
#agPage .af{display:flex;gap:10px;padding:14px 28px;border-top:1px solid var(--line);background:var(--pane)}
/* «Attiva un cliente Kairos»: tre passi in fila, ognuno si accende di verde quando è a posto */
.wz{max-width:900px;margin:0 auto;display:grid;gap:14px}
.wz-s{background:var(--glass);border:1px solid var(--line);border-radius:14px;padding:18px 20px;display:grid;grid-template-columns:40px minmax(0,1fr);column-gap:14px}
.wz-s .n{grid-row:1/span 9;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:15px;color:#fff;background:#2563eb;border:1px solid #60a5fa;box-shadow:0 0 0 4px #2563eb22}
#wzS2 .n{background:#0e7490;border-color:#22d3ee;box-shadow:0 0 0 4px #06b6d422}#wzS3 .n{background:#7c3aed;border-color:#c4b5fd;box-shadow:0 0 0 4px #8b5cf622}
.wz-s.ok{border-color:color-mix(in srgb,var(--ok) 45%,transparent)}.wz-s.ok .n{background:var(--ok);color:#06120b;border-color:transparent}
.wz-s h4{margin:5px 0 3px;font-size:17px;font-weight:800;color:#f8fafc}.wz-s .hint{color:#cbd5e1;font-size:13.5px;margin:0 0 12px;line-height:1.5}
.wz input.inp,.wz select.inp,.wz textarea.inp{border-color:#566174;background:#11151c;color:#f1f5f9}.wz input.inp:focus,.wz select.inp:focus,.wz textarea.inp:focus{border-color:#60a5fa;box-shadow:0 0 0 3px #3b82f633}
#wzLinePick{margin:8px 0 5px;padding:7px;border:1px solid #356cba;border-left:4px solid #38bdf8;border-radius:12px;background:linear-gradient(110deg,#10243a,#151c28)}
#wzLinePick .wz-fp-wrap{width:100%;min-width:0;margin:0}#wzLinePick [data-kx-line-find]{border-color:#60a5fa;box-shadow:inset 0 0 0 1px #60a5fa33}
.wz-targets{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:9px;margin:4px 0 12px}
.wz-target{display:flex;align-items:center;gap:10px;padding:13px 15px;border:1px solid color-mix(in srgb,var(--wzt,#64748b) 52%,var(--line));border-radius:12px;background:color-mix(in srgb,var(--wzt,#64748b) 10%,#171a1f);color:var(--txt,#eef1f8);font:inherit;font-weight:750;text-align:left;cursor:pointer}
.wz-target i{display:grid;place-items:center;width:22px;height:22px;border:1px solid var(--line);border-radius:7px;font-style:normal;color:transparent}
.wz-target.on{border-color:var(--wzt,#64748b);background:color-mix(in srgb,var(--wzt,#64748b) 24%,#171a1f)}
.wz-target.on i{background:var(--wzt,#64748b);border-color:var(--wzt,#64748b);color:#fff}
.wz-target .wz-ico{display:grid;place-items:center;min-width:28px;height:28px;border-radius:9px;background:color-mix(in srgb,var(--wzt,#64748b) 22%,transparent);font-style:normal;font-size:12px;font-weight:900}
.wz-target:focus-visible{outline:2px solid var(--a1);outline-offset:2px}
.wz-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.wz-fields .inp{margin:0}
.wz-apps{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0 0}
.wz-apps button{padding:8px 11px;border-radius:999px;font-size:12.5px}
.wz-apps button.on{background:var(--a1);border-color:var(--a1);color:#fff}
.wz-help{font-size:12.5px;color:var(--mut);line-height:1.45;margin:6px 0 0}
.wz-custom-duration{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px;color:var(--mut);font-size:13px}
.wz-custom-duration input{width:90px;margin:0}.wz-custom-duration select{width:120px;margin:0}
.wz-code{font:700 26px/1.1 ui-monospace,SFMono-Regular,Menlo,monospace!important;letter-spacing:.14em;text-transform:uppercase;padding:14px 16px!important;width:100%;max-width:330px;margin:0!important}
.wz-st{margin-top:10px;font-size:13.5px;padding:10px 12px;border-radius:10px;border:1px solid var(--line);line-height:1.45}
.wz-app-st{border-left:4px solid var(--wzt,#0d9488);border-color:color-mix(in srgb,var(--wzt,#0d9488) 48%,var(--line));border-left-color:var(--wzt,#0d9488);background:color-mix(in srgb,var(--wzt,#0d9488) 7%,transparent)}
.wz-st.good{border-color:color-mix(in srgb,var(--ok) 55%,transparent);background:color-mix(in srgb,var(--ok) 10%,transparent)}
.wz-st.warn{border-color:rgba(245,176,65,.55);background:rgba(245,176,65,.08)}
.wz-st.bad{border-color:color-mix(in srgb,var(--bad) 55%,transparent);background:color-mix(in srgb,var(--bad) 10%,transparent)}
.wz-pl{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:8px;margin-top:10px}.wz-pl .inp,.wz textarea.inp{margin:0}
.wz-dur{display:flex;gap:8px;flex-wrap:wrap}.wz-dur button{min-width:100px;padding:12px 14px;font-size:15px;font-weight:700}
.wz-dur button.on{background:var(--a1);border-color:var(--a1);color:#fff}
.wz-exp{margin-top:10px;font-size:13.5px;color:var(--mut)}.wz-exp b{color:var(--txt,#eef1f8)}#wzExpOther{color:var(--a1);text-decoration:underline}
.wz-miss{font-size:12.5px;color:var(--mut);align-self:center}
.wz-full{display:inline-block;margin-top:2px;color:var(--mut);font-size:12.5px}
.wz-results{display:grid;gap:9px}
.wz-result{display:flex;align-items:flex-start;gap:10px;padding:11px 13px;border:1px solid var(--line);border-radius:12px;background:rgba(255,255,255,.025)}
.wz-result.ok{border-color:color-mix(in srgb,var(--ok) 42%,var(--line))}
.wz-result.ko{border-color:color-mix(in srgb,var(--bad) 48%,var(--line))}
.wz-result i{display:grid;place-items:center;flex:none;width:25px;height:25px;border-radius:50%;background:rgba(255,255,255,.08);font-style:normal;font-weight:800}
.wz-result.ok i{color:var(--ok)}.wz-result.ko i{color:var(--bad)}
.wz-result div{flex:1;min-width:0}.wz-result small{display:block;color:var(--mut);margin-top:3px;word-break:break-word}
.wz-summary{margin:12px 0 0;padding:12px 14px;border-radius:12px;background:rgba(255,255,255,.04);line-height:1.5}
@media (max-width:700px){.wz-pl,.wz-fields{grid-template-columns:1fr}.wz-s{grid-template-columns:30px minmax(0,1fr);padding:15px 13px}.wz-s .n{width:28px;height:28px}}
@media(max-width:420px){.wz{width:100%;gap:10px}.wz-s{min-width:0;grid-template-columns:28px minmax(0,1fr);column-gap:9px;padding:12px 10px}.wz-s>div{min-width:0}.wz-targets{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.wz-target{min-width:0;padding:10px 8px;gap:7px;font-size:13px}.wz-target span:not(.wz-ico){overflow-wrap:anywhere}.wz-app-st{padding:9px}.wz-pl{grid-template-columns:minmax(0,1fr)}}
@media(max-width:480px){.wz-targets{grid-template-columns:repeat(2,minmax(0,1fr))}.wz-target span:not(.wz-ico){white-space:nowrap;overflow-wrap:normal;word-break:normal}}
.ag-g{display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:16px;align-items:start}
.ag-c{background:var(--glass);border:1px solid var(--line);border-radius:10px;padding:18px}
.ag-c h4{font-size:14px;font-weight:600;margin-bottom:2px}.ag-c>small{display:block;color:var(--mut);font-size:12.5px;margin-bottom:12px}
.ag-chk{display:grid;gap:6px}.ag-chk label{display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:7px;background:#1a1d22;border:1px solid var(--line);cursor:pointer;font-size:13.5px}
.ag-chk label.dis{opacity:.45;cursor:not-allowed}
.ag-chk input{width:16px;height:16px;accent-color:var(--a1)}
.ag-chk small{margin-left:auto;color:var(--mut);font-size:12px}
small.ag-cnt{display:block;margin:6px 0 0 2px;font-size:12px;color:var(--mut)}
.ag-armg{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:16px;margin-top:12px;align-items:start}.ag-armu{margin:10px 0 0;font-size:13px}
@media (max-width:900px){.ag-armg{grid-template-columns:1fr}}
.ag-dg{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:12px}
.ag-dc{--k:#38bdf8;border:1px solid color-mix(in srgb,var(--k) 35%,var(--line));border-top:3px solid var(--k);border-radius:12px;padding:12px;background:color-mix(in srgb,var(--k) 5%,transparent);min-width:0}
.ag-dc.op{--k:#a78bfa}.ag-dc.mx{--k:#fb7185}
.ag-dh{display:flex;gap:10px;align-items:flex-start;margin-bottom:10px}.ag-dh b{display:block;font-size:14px}.ag-dh small{display:block;color:var(--mut);font-size:12px;margin-top:2px;line-height:1.35}
.ag-dt{flex:none;min-width:34px;height:26px;padding:0 7px;border-radius:7px;display:grid;place-items:center;font-size:10.5px;font-weight:800;letter-spacing:.04em;color:#fff;background:var(--k)}
.ag-dn{font-size:12px;color:var(--mut);margin:10px 0 0}
.ag-dg[data-n="1"]{grid-template-columns:minmax(0,560px)}.ag-dg[data-n="2"]{grid-template-columns:repeat(2,minmax(0,1fr))}
@media (max-width:1100px){.ag-dg,.ag-dg[data-n]{grid-template-columns:1fr}}small.ag-cnt.no{color:var(--warn,#f5b041);font-weight:600}
.ag-radio{display:grid;grid-template-columns:1fr 1fr;gap:8px}.ag-radio label{display:block;padding:12px;border-radius:8px;border:1px solid var(--line);background:#1a1d22;cursor:pointer}
.ag-radio label.on{border-color:var(--a1);background:rgba(61,124,245,.1)}.ag-radio b{display:block;font-size:13.5px}.ag-radio small{color:var(--mut);font-size:12px}
.ag-radio input{display:none}
.ag-lim{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:8px;background:var(--glass);border:1px solid var(--line);font-size:13px}
.ag-lim b{font-size:15px}
.dv-resp{display:inline-block;margin-top:4px;font-size:12px;color:#8fb3ff}
.own-sw{display:flex;gap:10px;flex-wrap:wrap;align-items:stretch;margin:0 0 12px}
.own-t{all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:12px;border:1px solid var(--line);border-left:4px solid var(--c);background:rgba(255,255,255,.03);flex:1 1 220px;max-width:380px;min-width:0;transition:background .15s,border-color .15s}
.own-t:hover{background:rgba(255,255,255,.06)}.own-t:focus-visible{outline:2px solid var(--c);outline-offset:2px}
.own-t>i{font-style:normal;font-size:22px;line-height:1}.own-t>span{min-width:0}
.own-t b{display:block;font-size:15px;color:#fff}
.own-t small{display:block;color:var(--mut);font-size:12px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.own-t em{margin-left:auto;padding-left:8px;font-style:normal;font-weight:800;font-size:22px;color:var(--c)}
.own-t.me{--c:#4f8cff}.own-t.ag{--c:#a78bfa}
.own-t.me.on{border-color:#4f8cff;background:rgba(79,140,255,.16);box-shadow:0 10px 26px -16px #4f8cff}
.own-t.ag.on{border-color:#a78bfa;background:rgba(167,139,250,.17);box-shadow:0 10px 26px -16px #a78bfa}
.own-all{all:unset;cursor:pointer;align-self:center;padding:8px 14px;border-radius:99px;border:1px dashed var(--line);color:var(--mut);font-weight:700;font-size:13px;white-space:nowrap}
.own-all:hover{color:#fff}.own-all.on{border-style:solid;color:#fff;background:rgba(255,255,255,.08)}
.own-ags{margin:0 0 12px!important;align-items:center}.own-ags .fchip.off{opacity:.6}
.own-x{color:var(--mut);font-size:12.5px}
.own-info,.own-hint{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:0 0 12px;padding:9px 14px;border-radius:10px;font-size:13px}
.own-info{border:1px solid rgba(167,139,250,.35);background:rgba(167,139,250,.08)}.own-info .sp{flex:1}
.own-hint{border:1px dashed rgba(167,139,250,.55)}
.ag-cl{display:inline-block;margin-top:6px;padding:4px 10px!important;font-size:12px!important}
@media (max-width:700px){.own-t{flex:1 1 140px;padding:10px 12px;gap:8px}.own-t small{display:none}.own-t em{font-size:18px}.own-t b{font-size:13.5px}.own-all{width:100%;text-align:center;box-sizing:border-box}}
body.agent #newDev{display:inline-flex}
body.agent .dvt input[type=checkbox],body.agent .dvt th.c:first-child,body.agent .dvt td.c:first-child,body.agent #dvBulk{display:none!important}
body.agent .foot{display:none}
@media (max-width:900px){#agPage{left:0}.ag-g{grid-template-columns:1fr}.ag-tbl .hm{display:none}}
@media (max-width:820px){#drawer.full{left:0}}`;
  document.head.appendChild(css);

  const IC = {
    agents: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17.5" cy="9" r="2.6"/><path d="M16.8 14.6c2.6.2 4.2 1.9 4.8 4.6"/></svg>',
    sec: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
  };
  const FL = [['create', 'Attivare clienti nuovi', 'Con il codice che il cliente vede sulla TV'], ['renew', 'Rinnovare e cambiare la scadenza', ''], ['disable', 'Attivare e disattivare il servizio', ''],
    ['playlists', 'Cambiare server, utente e password', 'Solo tra i server che gli assegni'], ['kick', 'Disconnettere il cliente', 'Interrompe la visione in corso'], ['delete', 'Eliminare clienti', ''],
    ['clientPerms', 'Cambiare i permessi dell\'app', 'Cosa può fare il cliente nell\'app'], ['vpn', 'Cambiare la VPN del cliente', ''],
    ['link', 'Collegare altri dispositivi', 'Codice a 6 cifre, sblocca, scollega e «Collega a un cliente» in Nuovo cliente (dispositivi in più fino a «Connessioni per cliente»)'], ['lineView', 'Linee selezionate in primo piano', 'Nella ricerca dentro i pannelli: server, collegamento, IP e app che usano le sue linee'], ['subClients', 'Vedere i clienti dei suoi sotto-agenti', 'Se spento vede e gestisce solo i clienti attivati da lui'], ['players', 'Inviare le linee a OrbixPlay e MaxPlayer', 'Solo per i suoi clienti, con le tue chiavi (che non vede)'], ['payments', 'Gestire i pagamenti dei clienti', 'Segnare chi deve pagare e chi ha pagato, solo sui suoi clienti'], ['autoRenew', 'Rinnovo automatico', 'Rinnova da solo le sue linee già pagate, con i suoi crediti'], ['account', 'Profili, lettore e visioni contemporanee', 'Entro le connessioni che gli concedi'], ['ai', 'Assistente IA dei clienti', 'Quale IA, domande al giorno, domande extra']];
  // pagine del pannello: sempre e solo con i dati dei suoi clienti
  const FP = [['dash', 'Dashboard', 'Riepilogo dei suoi clienti', 'dash'], ['events', 'Eventi ora', 'Sport in diretta e dove vederli, con la striscia che scorre in alto', 'events'], ['errors', 'Errori applicazione', 'Dei suoi clienti', 'apperr'],
    ['reports', 'Segnalazioni', 'Dei suoi clienti', 'reports'], ['contentReq', 'Richieste contenuti', 'Dei suoi clienti', 'creq'], ['addonReq', 'Richieste temi', 'Assegna solo gli add-on che gli concedi', 'areq'],
    ['messages', 'Messaggi', 'Solo ai suoi clienti, mai a tutti', 'msgs'],
    ['vod', 'Videoteca', 'Solo le linee dei suoi clienti', 'vod'], ['activity', 'Attività', 'Solo le sue azioni', 'activity'], ['dlcodes', 'Codici downloader', 'Le app da far installare ai clienti (solo da copiare)', 'dlc'], ['appstore', 'APP Store', 'Le app per caricare le liste: solo quelle che scegli qui sotto, in sola lettura', 'apps3'], ['appsOp', 'OrbixPlay e MaxPlayer', 'Codici cliente e liste create dei suoi clienti', 'agop'], ['appk', 'App Kairos', 'Link e codici Downloader delle app Kairos che scegli', 'agk'], ['lines', 'Linee collegate', 'Il registro delle linee collegate alle app: solo le sue', 'lines'], ['maint', 'Manutenzione dei suoi clienti', 'Schermata di manutenzione solo per i suoi clienti (mai per i tuoi)', ''], ['armada', 'Pannello Armada', 'Con i tuoi crediti, entro il tetto mensile', 'armada'], ['storm', 'Pannello Storm', 'Con i tuoi crediti Storm, entro il tetto che decidi', 'storm'], ['orcpApp', 'App MirkoTeam: scaricarla e scegliere il server', 'Downloader e solo i server che gli assegni', 'orcp-agent']];
  FP.push(['wolf', 'Pannello WOLF', 'Con il suo account reseller WOLF: sue linee e suoi crediti', 'wolf'], ['mxp', 'Pannello MaxPlayer', 'Solo i clienti del suo agente MaxPlayer', 'mxp'], ['oxp', 'Pannello OrbixPlay', 'Solo le playlist dei suoi clienti', 'oxp'], ['ro', 'Pannello Realott', 'Con il suo account sub-reseller Realott: sue linee e suoi crediti', 'ro'], ['slt', 'Pannello SLT', 'Con il suo account sub-reseller SLT: sue linee e suoi crediti', 'slt'], ['atx', 'Pannello Atlantix', 'Con il suo account sottovenditore Atlantix: sue linee e suoi crediti', 'atx']);
  const PERM_VIEW = Object.fromEntries(FP.map(([k, , , v]) => [v, k]));
  PERM_VIEW.payments = 'payments';
  PERM_VIEW.appsum = 'lines';
  PERM_VIEW['orcp-agent'] = 'orcpApp';
  const isAgent = () => D.role === 'agent';
  const me = () => D.me || {};
  const can = (k) => !isAgent() || !!(me().perms || {})[k];
  const AG_ATX_OK = /^\/admin\/atx\/[A-Za-z0-9_\/%.-]+(\?.*)?$/;
  const AG_ATX_NEED = /^\/admin\/atx\//;
  const canOpenActivationWizard = () => !isAgent() || can('create') || (D.activationApps || []).some((x) => x.enabled && KXActApps.hasPermission(me().perms || {}, x)) || (!!(me().perms || {}).orcpApp && (me().perms || {}).orcpSrv?.length > 0);
  const linePanels = ['wolf', 'armada', 'storm', 'atx', 'ro', 'slt'];
  const canLoadLines = (perms = me().perms || {}) => !!window.KXLinePick && (!isAgent() || linePanels.some((k) => !!perms[k]));
  const matchLineServer = async (host, servers, panel) => {
    if (!host && !panel) return null;
    let server = null;
    try {
      const match = await api('POST', '/admin/match-server', { host: host || '', ...(panel ? { panel } : {}) });
      if (match && match.server) server = servers.find((s) => s.id === match.server.id) || null;
    } catch {}
    return server;
  };

  /* ---------- menu a gruppi ---------- */
  const side = $('#side');
  const nav = (v) => $(`.nav[data-v="${v}"]`);
  const mk = (v, label, ic) => { const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = v; b.innerHTML = ic + label; b.onclick = () => view(v); return b; };
  if (!nav('agents')) {
    const a = mk('agents', 'Agenti', IC.agents), s = mk('sec', 'Sicurezza', IC.sec);
    side.appendChild(a); side.appendChild(s);
    for (const [id, html] of [['agents', ''], ['sec', '']]) { const sec = document.createElement('section'); sec.className = 'view'; sec.id = 'v-' + id; sec.innerHTML = html; $('#v-dash').after(sec); }
  }
  // "Dispositivi" diventa "Clienti"
  { const b = nav('devices'); if (b) for (const n of b.childNodes) if (n.nodeType === 3 && /Dispositivi/.test(n.textContent)) n.textContent = 'Clienti'; }
  Object.assign(TITLES, { devices: 'Clienti', agents: 'Agenti', sec: 'Sicurezza' });
  // menu 3.2: una voce per ogni pagina, in sezioni chiare (prima molte pagine erano schede dentro poche voci).
  // Le voci che un agente non può usare restano nascoste; una sezione senza voci non compare.
  const GROUPS = [
    ['', ['dash', 'devices', 'payments', 'live', 'agents', 'msgs']],
    ['Linee e pannelli', ['conn', 'lmap', 'lines', 'dns', 'armada', 'storm', 'wolf', 'ro', 'slt', 'orcp', 'orcp-agent', 'mxp', 'oxp', 'ora', 'atx']],
    ['App e Store', ['store', 'apps3', 'apps3op', 'agop', 'xlist', 'dlc', 'appk', 'agk']],
    ['Richieste e controllo', ['reports', 'creq', 'areq', 'reqai', 'rctl', 'apperr', 'activity', 'trash', 'vod']],
    ['Impostazioni', ['set-look', 'set-app', 'set-addon', 'set-ai', 'set-maint', 'set-pay', 'set-sec', 'api', 'sec']],
  ];
  const HIDDEN = ['settings', 'ai']; // pagine vecchie sostituite dalle voci qui sopra (le pagine restano)
  // sezioni richiudibili (si ricorda la scelta; di base è chiusa solo «Impostazioni»). Se apri una pagina di una sezione
  // chiusa (campanella, scorciatoie, F5) la sezione si riapre da sola, così vedi dove sei
  const NAVC = 'kx_navc';
  const closedSet = () => { try { const v = JSON.parse(localStorage.getItem(NAVC) || 'null'); return new Set(Array.isArray(v) ? v : ['Impostazioni']); } catch { return new Set(['Impostazioni']); } };
  const saveClosed = (st) => { try { localStorage.setItem(NAVC, JSON.stringify([...st])); } catch {} };
  const CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
  const badgeOf = (b) => { let t = 0; for (const e of b.querySelectorAll('span')) { const x = (e.textContent || '').trim(); if (/^\d+$/.test(x) && e.style.display !== 'none' && getComputedStyle(e).display !== 'none' && (e.classList.contains('on') || !e.classList.contains('kc-nb'))) t += +x; } return t; };
  /** numero sulla sezione chiusa: le richieste in attesa non si perdono */
  function navSums() {
    for (const h of $$('.nav-h[data-sec]', side)) {
      const items = $$('.nav[data-v]', side).filter((b) => b.dataset.sec === h.dataset.sec && b.style.display !== 'none');
      const t = h.classList.contains('closed') ? items.reduce((a, b) => a + badgeOf(b), 0) : 0, el = h.querySelector('.hn'), txt = t ? String(t) : '';
      if (el && el.textContent !== txt) el.textContent = txt;
    }
  }
  window.KXLayoutMenu = () => layoutMenu();
  function layoutMenu() {
    const foot = $('aside .foot'), brand = $('aside .brand'), closed = closedSet();
    $$('.nav-h', side).forEach((h) => h.remove());
    let at = brand;
    const put = (el) => { at.after(el); at = el; };
    for (const v of HIDDEN) { const b = nav(v); if (b) b.style.display = 'none'; }
    for (const [h, vs] of GROUPS) {
      const items = (vs || []).map(nav).filter((b) => b && b.style.display !== 'none');
      if (!items.length) continue;
      const shut = !!h && closed.has(h);
      if (h) {
        const e = document.createElement('div'); e.className = 'nav-h' + (shut ? ' closed' : ''); e.dataset.sec = h; e.setAttribute('role', 'button'); e.tabIndex = 0;
        e.innerHTML = `<span>${esc(h)}</span><b class="hn"></b>${CHEV}`;
        e.onclick = () => { const st = closedSet(); if (st.has(h)) st.delete(h); else st.add(h); saveClosed(st); layoutMenu(); };
        e.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); e.click(); } };
        put(e);
      }
      for (const b of items) { b.dataset.sec = h; b.classList.toggle('nav-col', shut); put(b); }
    }
    for (const b of $$('.nav[data-v]', side)) if (!HIDDEN.includes(b.dataset.v) && !GROUPS.some(([, vs]) => (vs || []).includes(b.dataset.v))) { b.classList.remove('nav-col'); put(b); } // eventuali voci nuove
    if (foot && $('#logout')) foot.after($('#logout'));
    navSums();
  }
  { let raf = 0; new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; navSums(); }); }).observe(side, { subtree: true, characterData: true, childList: true, attributes: true, attributeFilter: ['class', 'style'] }); }
  { const vw = view; window.view = view = function (v) { const r = vw.apply(this, arguments); const b = nav(v), sec = b && b.dataset.sec; if (sec) { const st = closedSet(); if (st.has(sec)) { st.delete(sec); saveClosed(st); layoutMenu(); } } return r; }; }

  /* ---------- API: per l'agente solo le funzioni consentite (niente chiamate inutili) ---------- */
  // agente: le pagine senza permesso non chiamano nemmeno il server (prima ogni 20-30 s partivano richieste destinate al «non consentito»)
  const AG_OK = /^\/admin\/(events(\/(chans|epg))?(\?.*)?|payments|line-notes(\?.*)?|online|insight\/[A-Za-z0-9_-]+|health|devices\/[A-Za-z0-9_-]+\/(upd|fix)|apps3\/lists(\?.*)?|ext-lists(\/(?!nanomid-clear)[A-Za-z0-9_-]+)?|presence|app-errors(\/seen)?(\?.*)?|requests(\/\d+(\/status)?)?(\?.*)?|messages(\/\d+)?|store(\/[A-Za-z0-9_-]+\/(approve|deny|revoke))?|catalog(\/(sources|info|check))?(\?.*)?|ai\/grant|match-server|linked-lines(\/\d+)?|agent-maint|agent\/(orcp|act-request)|armada\/(state|packages|lines|mags|new|renew|toggle)|storm\/(state|lines)|oxp\/(state|playlists(\/[A-Za-z0-9_-]+)?)|mxp\/(accounts|a\/[a-z0-9]{2,20}\/(overview|domains|agents(\/\d+\/(enable|disable))?|users(\/\d+(\/password|\/devices|\/lists(\/[A-Za-z0-9%-]+)?)?)?(\?fresh=1)?))|guide(?:\/read)?|(ro|slt)\/[A-Za-z0-9_\/%.-]+(\?.*)?|wolf\/(config|password|packages|lines(\/\d+(\/(extend|toggle|kick))?)?(\?fresh=1)?|resellers(\/\d+(\/(credits|toggle|delete))?)?)|orbix\/[A-Za-z0-9_-]+|maxplayer\/[A-Za-z0-9_-]+(\?fresh=1)?|login|logout|logout-all|state|password|totp\/(setup|enable|disable)|devices(\/[^/?]+(\/(kick|linkcode|reset|unlink|link))?)?(\?.*)?|agents(\/\d+|\/bulk)?|line-sync(\/apply)?(\?.*)?|addon-preview\/[a-z0-9-]+)$/;
  const AG_NEED = [[/^\/admin\/requests.*[?&]kind=content/, 'contentReq'], [/^\/admin\/requests.*[?&]kind=addon/, 'addonReq'], [/^\/admin\/requests.*[?&]kind=ai/, 'ai'],
    [/^\/admin\/requests(\?(?!.*kind=)|\?.*kind=report|$)/, 'reports'], [/^\/admin\/app-errors/, 'errors'], [/^\/admin\/presence/, 'online'], [/^\/admin\/catalog/, 'vod'], [/^\/admin\/apps3\/lists/, 'appsOp'],
    [/^\/admin\/ext-lists/, 'players'], [/^\/admin\/linked-lines/, 'lines'], [/^\/admin\/agent-maint/, 'maint'], [/^\/admin\/armada\//, 'armada'], [/^\/admin\/storm\//, 'storm'], [/^\/admin\/wolf\//, 'wolf'], [/^\/admin\/mxp\//, 'mxp'], [/^\/admin\/oxp\//, 'oxp'], [/^\/admin\/ro\//, 'ro'], [/^\/admin\/slt\//, 'slt']];
  const agDenied = (m, p) => { if (!isAgent() || !D.me || !D.me.perms || m !== 'GET') return false; const x = AG_NEED.find(([re]) => re.test(p)); return !!x && !D.me.perms[x[1]] || AG_ATX_NEED.test(p) && !D.me.perms.atx; };
  const origApi = api;
  window.api = api = async function (m, p, b) {
    if (isAgent() && !AG_OK.test(p) && !AG_ATX_OK.test(p) && p !== '/admin/agent/agent-ledger') throw new Error('Funzione non disponibile per gli agenti');
    if (agDenied(m, p)) throw new Error('Funzione non consentita: chiedila a chi ti ha creato');
    const asAt = window.__assist || null;
    const r = await origApi(m, p, b);
    if (p === '/admin/state' && m === 'GET' && (window.__assist || null) !== asAt) throw new Error('Pannello cambiato nel frattempo');
    if (p === '/admin/state' && m === 'GET' && r && !asAt && !window.__assist) {
      // è entrato un altro account nella stessa scheda (uscita e nuovo accesso senza ricaricare): si ricarica la pagina,
      // così nessun elenco già scaricato (linee dei pannelli, ricerca, pagine) del primo account resta in memoria
      const who = (r.role === 'agent' ? 'a:' : 'o:') + String(r.user || '');
      if (window.__kxWho && window.__kxWho !== who) { try { sessionStorage.removeItem('kc_page'); } catch {} location.reload(); await new Promise(() => {}); }
      window.__kxWho = who;
    }
    if (p === '/admin/state' && m === 'GET' && r) {
      D.role = r.role === 'agent' ? 'agent' : 'owner'; D.agents = r.agents || []; D.me = r.me || null; D.servers = r.servers || [];
      D.storeAppNames = r.storeAppNames || []; D.activationApps = Array.isArray(r.activationApps) ? r.activationApps : []; D.maintMe = r.maint || null; D.maintAg = r.maintAg || []; D.appLinks = Array.isArray(r.appLinks) ? r.appLinks : []; D.kairosApps = Array.isArray(r.kairosApps) ? r.kairosApps : [];
      if (r.addonCat) D.addonCat = r.addonCat;
    }
    if (p === '/admin/login' && r && r.role) D.role = r.role;
    return r;
  };

  /* ---------- modalità agente ---------- */
  // «Online ora» e «Riepilogo store» sono solo del titolare (lo store è aperto: agli agenti non resta nulla da approvare)
  const agentCan = (v) => v === 'payments' ? (can('payments') || !!(window.KXPay && KXPay.hasRows())) : v !== 'live' && v !== 'store' && v !== 'stapps' && !!PERM_VIEW[v] && can(PERM_VIEW[v]);
  const OWNER_ONLY = ['events', 'dash', 'live', 'rctl', 'trash', 'apperr', 'reports', 'creq', 'areq', 'ai', 'reqai', 'vod', 'msgs', 'store', 'stapps', 'storesum', 'dns', 'apps3', 'lines', 'appsum', 'armada', 'storm', 'wolf', 'mxp', 'oxp', 'appk', 'dlc', 'settings', 'set-look', 'set-app', 'set-addon', 'set-ai', 'set-maint', 'set-sec', 'api', 'activity', 'ora', 'ro', 'slt', 'blk', 'orcp', 'payments', 'allp', 'appon', 'set-pay']; // ora/ro/slt/orcp/blk, «Tutti i pannelli» e «Online nelle app»: solo titolare (il server risponde 403 agli agenti)
  const AGENT_ONLY = ['orcp-agent'];
  let modeSet = '';
  function applyMode() {
    const ag = isAgent();
    document.body.classList.toggle('agent', ag);
    for (const v of OWNER_ONLY) { const b = nav(v); if (b) b.style.display = ag && !agentCan(v) ? 'none' : ''; }
    for (const v of AGENT_ONLY) { const b = nav(v); if (b) b.style.display = ag && agentCan(v) ? '' : 'none'; }
    const sb = nav('sec'); if (sb) sb.style.display = ag ? '' : 'none';
    const ab = nav('agents'); if (ab) ab.style.display = !ag || me().canAgents ? '' : 'none';
    layoutMenu();
    // la sicurezza dell'account: per l'agente in una pagina sua, per il proprietario resta nelle Impostazioni
    const g = $('[data-pane="sec"] .st-g') || $('#v-sec .st-g');
    if (g) (ag ? $('#v-sec') : $('[data-pane="sec"]')).appendChild(g);
    const h = $('#aUser') && $('#aUser').closest('.card') && $('#aUser').closest('.card').querySelector('h3');
    if (h) h.innerHTML = ag ? 'Il tuo account<small>Nome utente e password per entrare nel pannello</small>' : 'Account amministratore<small>Nome utente e password per entrare nel pannello</small>';
    if (ag && $('#aUser') && !$('#aUser').value) $('#aUser').value = D.user || '';
    $('#newDev').style.display = !ag || canOpenActivationWizard() ? '' : 'none';
    // per l'agente il pulsante dice cosa fa: apre «Attiva un cliente Kairos»
    const nb = $('#newDev').lastChild;
    if (nb && nb.nodeType === 3) nb.textContent = ag ? 'Attiva cliente' : 'Nuovo cliente'; // titolare: come lo scrive nav2.js
    if (modeSet !== (ag ? 'a' : 'o')) { modeSet = ag ? 'a' : 'o'; if (ag) view('devices'); }
    if (ag && [...OWNER_ONLY, ...AGENT_ONLY].some((v) => !agentCan(v) && $('#v-' + v) && $('#v-' + v).classList.contains('on'))) view('devices');
    let lim = $('#agLim');
    if (ag) {
      if (!lim) { lim = document.createElement('div'); lim.id = 'agLim'; lim.className = 'ag-lim'; $('#newDev').before(lim); }
      const m = me(); lim.innerHTML = `Clienti <b>${m.clientsUsed ?? 0}</b> / ${m.maxClients ?? 0}`;
    } else if (lim) lim.remove();
  }
  window.addEventListener('kxpay:update', () => { if (isAgent()) { applyMode(); layoutMenu(); } });
  const origRenderAll = renderAll;
  window.renderAll = renderAll = function () { applyMode(); origRenderAll(); renderAgents(); if (window.KXPay) { KXPay.load(); KXPay.loadLedger?.()?.catch(() => {}); } }; // aggiornamento in sottofondo: se non riesce (es. mentre si entra in assistenza) niente errore
  const origMsgs = renderMsgs;
  window.renderMsgs = renderMsgs = function () { origMsgs(); if (isAgent()) { const o = $('#mTo option[value="all"]'); if (o) o.remove(); $$('#mTo option').forEach((x) => { const d = D.devices.find((y) => y.id === x.value); if (d && d.parent) x.remove(); }); } };
  const origSec = renderSecurity;
  window.renderSecurity = renderSecurity = function () {
    origSec();
    if (!isAgent()) return;
    const x = D.security || {};
    $('#secList').innerHTML = `<div class="sec"><i class="${x.totp ? 'y' : 'n'}">${x.totp ? '✓' : '!'}</i><div><b>Verifica in due passaggi</b><small>${x.totp ? `Attiva: all'accesso serve anche il codice dell'app di autenticazione · codici di recupero: ${x.rec ?? 0}${(x.rec ?? 0) <= 2 ? ' — creane di nuovi qui sotto' : ''}` : 'Facoltativa ma consigliata: protegge il tuo account anche se qualcuno scopre la password'}</small></div></div>
      <div class="sec"><i class="y">✓</i><div><b>Accesso limitato</b><small>Vedi e gestisci solo i tuoi clienti${me().canAgents ? ' e quelli dei tuoi sotto-agenti' : ''}</small></div></div>`;
  };
  const view0 = view;
  window.view = view = function (v) {
    if (isAgent() && (OWNER_ONLY.includes(v) && !agentCan(v) || AGENT_ONLY.includes(v) && !agentCan(v)) || !isAgent() && AGENT_ONLY.includes(v)) v = 'devices';
    if (v === 'agents' && isAgent() && !me().canAgents) v = 'devices';
    view0(v);
  };
  $$('.nav[data-v]').forEach((n) => (n.onclick = () => view(n.dataset.v)));

  /* ---------- Responsabile nelle schede e nella tabella dei clienti ---------- */
  const agName = (id) => { if (!id) return isAgent() ? '' : ''; if (isAgent() && id === me().id) return 'Tu'; const a = (D.agents || []).find((x) => x.id === id); return a ? a.username : 'agente #' + id; };
  /* ---------- Clienti divisi: «I miei clienti», «Clienti degli agenti» e un pulsante per ogni agente ----------
     La scelta (kc_own) filtra schede, tabella ed elenco come il filtro per app: 'me' i miei (anche quelli da attivare),
     'ag' tutti gli agenti, '<id>' un solo agente, 'all' tutti insieme. Per l'agente con sotto-agenti: i suoi / dei sotto-agenti. */
  const OWN = { k: 'me' };
  try { OWN.k = localStorage.getItem('kc_own') || 'me'; } catch {}
  const ownSave = (k) => { OWN.k = String(k); try { localStorage.setItem('kc_own', OWN.k); } catch {} };
  /** di chi è il cliente: 0 = mio, altrimenti l'id dell'agente; le connessioni collegate seguono il loro cliente principale */
  function ownKeyFn(all) {
    const byId = new Map(all.map((d) => [d.id, d])), mine = isAgent() ? +me().id || 0 : 0;
    return (d) => { const p = d.parent ? byId.get(d.parent) : null; const o = +((p || d).ownerId || 0); return !o || o === mine ? 0 : o; };
  }
  const inSec = (k, key) => k === 'all' || (k === 'me' ? key === 0 : k === 'ag' ? key !== 0 : key === +k);
  const ownOn = (all, keyOf) => (D.agents || []).length > 0 || all.some((d) => keyOf(d) !== 0);
  const agLabel = (id) => { const a = (D.agents || []).find((x) => x.id === id); return a ? a.username : 'agente eliminato #' + id; };
  function ownFix(all, keyOf) {
    const k = OWN.k;
    if (k === 'me' || k === 'ag' || k === 'all') return;
    const id = +k;
    if (id && ((D.agents || []).some((a) => a.id === id) || all.some((d) => !d.parent && keyOf(d) === id))) return;
    OWN.k = 'ag'; // agente eliminato e senza più clienti: tutti gli agenti
  }
  /** un pulsante per ogni agente con clienti (più quello scelto anche se ne ha 0): i più grandi prima, ognuno seguito dai suoi sotto-agenti */
  function ownAgents(all, keyOf) {
    const cnt = new Map();
    for (const d of all) if (!d.parent) { const k = keyOf(d); if (k) cnt.set(k, (cnt.get(k) || 0) + 1); }
    const cur = +OWN.k; if (cur && !cnt.has(cur) && (D.agents || []).some((a) => a.id === cur)) cnt.set(cur, 0);
    const byId = new Map((D.agents || []).map((a) => [a.id, a]));
    const rows = [...cnt.keys()].map((id) => ({ id, a: byId.get(id) || null, n: cnt.get(id) }));
    const nm = (r) => (r.a ? r.a.username : '~' + r.id);
    rows.sort((x, y) => y.n - x.n || nm(x).localeCompare(nm(y), 'it'));
    const has = new Set(rows.map((r) => r.id)), out = [], done = new Set();
    const push = (r, lvl) => { if (done.has(r.id)) return; done.add(r.id); out.push({ ...r, lvl }); if (lvl < 3) for (const s of rows) if (s.a && s.a.parentId === r.id) push(s, lvl + 1); };
    for (const r of rows) if (!(r.a && r.a.parentId && has.has(r.a.parentId))) push(r, 0);
    for (const r of rows) push(r, 0);
    return { list: out, zero: (D.agents || []).filter((a) => !cnt.has(a.id)).length };
  }
  function ownBar(all, keyOf, on) {
    const tiles = $('#dvTiles'); let box = $('#dvOwn');
    if (!on || !tiles) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement('div'); box.id = 'dvOwn'; box.addEventListener('click', ownClick); }
    if (box.nextElementSibling !== tiles) tiles.before(box);
    const ag = isAgent(), k = OWN.k, prim = all.filter((d) => !d.parent);
    const nMe = prim.filter((d) => keyOf(d) === 0).length, nAg = prim.length - nMe;
    const pend = prim.filter((d) => keyOf(d) === 0 && d.status === 'pending').length;
    const { list, zero } = ownAgents(all, keyOf), agSel = k !== 'me' && k !== 'all', withCl = list.filter((r) => r.n).length;
    let h = `<div class="own-sw" role="tablist">
      <button type="button" class="own-t me ${k === 'me' ? 'on' : ''}" data-own="me" role="tab" aria-selected="${k === 'me'}"><i>👤</i><span><b>I miei clienti</b><small>Attivati da te${pend ? ` · ${pend} da attivare` : ''}</small></span><em>${nMe}</em></button>
      <button type="button" class="own-t ag ${agSel ? 'on' : ''}" data-own="ag" role="tab" aria-selected="${agSel}"><i>🤝</i><span><b>${ag ? 'Dei sotto-agenti' : 'Clienti degli agenti'}</b><small>${withCl ? `${withCl} ${withCl === 1 ? 'agente' : 'agenti'} con clienti · un pulsante per ognuno` : 'Nessun cliente degli agenti per ora'}</small></span><em>${nAg}</em></button>
      <button type="button" class="own-all ${k === 'all' ? 'on' : ''}" data-own="all" title="Un solo elenco con tutti, con la colonna Responsabile">Tutti insieme · ${prim.length}</button></div>`;
    if (agSel) {
      h += `<div class="filters own-ags"><button type="button" class="fchip ${k === 'ag' ? 'on' : ''}" data-own="ag">Tutti gli agenti<span>${nAg}</span></button>${list.map((r) => `<button type="button" class="fchip ${k === String(r.id) ? 'on' : ''} ${r.a && !r.a.active ? 'off' : ''}" data-own="${r.id}" title="${esc((r.a ? 'Clienti di ' + r.a.username : 'Clienti di un agente eliminato') + (r.a && !r.a.active ? ' (agente disattivato)' : '') + (r.lvl && r.a ? ' · sotto-agente di ' + agLabel(r.a.parentId) : ''))}">${r.lvl ? '↳ ' : ''}${esc(r.a ? r.a.username : 'agente eliminato #' + r.id)}<span>${r.n}</span></button>`).join('')}${zero ? `<span class="own-x">${zero === 1 ? '1 agente' : zero + ' agenti'} senza clienti</span>` : ''}</div>`;
      const cur = list.find((r) => String(r.id) === k);
      if (cur) {
        const a = cur.a, subs = (D.agents || []).filter((x) => x.parentId === cur.id).length;
        h += `<div class="own-info"><span>👤 Clienti di <b>${esc(a ? a.username : 'agente eliminato #' + cur.id)}</b> · ${cur.n} ${cur.n === 1 ? 'cliente' : 'clienti'}${a && a.maxClients ? ' · limite ' + esc(a.maxClients) : ''}${a && !a.active ? ' · <span class="chip r">Disattivato</span>' : ''}${subs ? ` · <span class="mut">i clienti ${subs === 1 ? 'del suo sotto-agente hanno' : 'dei suoi ' + subs + ' sotto-agenti hanno'} il loro pulsante</span>` : ''}</span>${a ? `<span class="sp"></span><button type="button" class="btn sm" data-ownopen="${cur.id}">Apri la scheda dell'agente</button>` : ''}</div>`;
      }
    }
    // ricerca: se il cliente cercato sta in un'altra sezione lo dico, invece di un elenco vuoto
    const q = (($('#dvQ') || {}).value || D.q || '').toLowerCase().trim();
    if (q && k !== 'all') {
      const hay = (d) => [d.code, d.name, d.notes, d.model].join(' ').toLowerCase();
      const kidHit = new Set(all.filter((d) => d.parent && hay(d).includes(q)).map((d) => d.parent));
      const hits = prim.filter((d) => !inSec(k, keyOf(d)) && (hay(d).includes(q) || kidHit.has(d.id)));
      if (hits.length) {
        const keys = [...new Set(hits.map(keyOf))], to = keys.length > 1 ? 'all' : keys[0] === 0 ? 'me' : String(keys[0]);
        const where = to === 'all' ? 'nelle altre sezioni' : to === 'me' ? 'in «I miei clienti»' : `tra i clienti di «${esc(agLabel(+to))}»`;
        h += `<div class="own-hint"><span>🔎 «${esc(q)}»: ${hits.length === 1 ? 'c\'è 1 cliente' : `ci sono ${hits.length} clienti`} ${where}</span><button type="button" class="btn sm" data-own="${to}">Mostra</button></div>`;
      }
    }
    if (box._h !== h) { box.innerHTML = h; box._h = h; }
  }
  function ownClick(e) {
    const o = e.target.closest('[data-ownopen]');
    if (o) { const a = (D.agents || []).find((x) => x.id === +o.dataset.ownopen); if (a) openAgent(a); return; }
    const b = e.target.closest('[data-own]'); if (!b) return;
    ownSave(b.dataset.own);
    // il filtro in alto (Attivi, Da attivare…) resta, salvo che nella nuova sezione non mostri nessuno
    const all = D.devices || [], keyOf = ownKeyFn(all), f = D.filter || 'all';
    const fit = (d) => f === 'all' || (f === 'soon' ? d.status === 'active' && !d.parent && daysLeft(d) !== null && daysLeft(d) <= (window.kxSoonDays ? kxSoonDays() : 14) : d.status === f);
    if (f !== 'all' && !all.some((d) => inSec(OWN.k, keyOf(d)) && fit(d))) D.filter = 'all';
    renderDevices();
  }
  window.KXOwn = {
    /** la sezione mostrata adesso (per la modifica in massa): null = tutti insieme, o nessun agente */
    scope() {
      const all = D.devices || [], keyOf = ownKeyFn(all);
      if (!ownOn(all, keyOf)) return null;
      ownFix(all, keyOf);
      const k = OWN.k; if (k === 'all') return null;
      const label = k === 'me' ? 'I miei clienti' : k === 'ag' ? (isAgent() ? 'Clienti dei sotto-agenti' : 'Clienti degli agenti') : 'Clienti di ' + agLabel(+k);
      return { k, label, devs: all.filter((d) => !d.parent && inSec(k, keyOf(d))) };
    },
    /** apre i Clienti su una sezione: 'me', 'ag', 'all' o l'id di un agente */
    show(k) { ownSave(k); view('devices'); renderDevices(); },
  };
  const origRD = renderDevices;
  window.renderDevices = renderDevices = function () {
    const all = D.devices || [], keyOf = ownKeyFn(all), on = ownOn(all, keyOf);
    if (on) ownFix(all, keyOf);
    const k = on ? OWN.k : 'all';
    if (k !== 'all') D.devices = all.filter((d) => inSec(k, keyOf(d)));
    try { origRD(); } finally { D.devices = all; }
    ownBar(all, keyOf, on);
    // colonna e riga «Responsabile» solo dove servono: tutti gli agenti insieme o tutti insieme
    const show = on && (k === 'ag' || k === 'all');
    if (!show) return;
    $$('#dvCards .dv-card[data-id]').forEach((c) => {
      const d = D.devices.find((x) => x.id === c.dataset.id); if (!d) return;
      const meta = $('.dv-meta', c); const n = agName(d.ownerId);
      if (meta && !$('.dv-resp', c)) meta.insertAdjacentHTML('beforeend', `<br><span class="dv-resp">👤 ${n ? 'Responsabile: ' + esc(n) : 'Responsabile: ' + (isAgent() ? 'Tu' : 'tu')}</span>`);
    });
    const t = $('#dvTbl .dvt'); if (!t || $('th.ag-col', t)) return;
    const ths = $$('thead th', t); if (ths[1]) ths[1].insertAdjacentHTML('afterend', '<th class="ag-col">Responsabile</th>');
    $$('tbody tr[data-id]', t).forEach((r) => {
      const d = D.devices.find((x) => x.id === r.dataset.id); const tds = $$(':scope>td', r);
      const n = d && !d.parent ? agName(d.ownerId) : '';
      if (tds[1]) tds[1].insertAdjacentHTML('afterend', `<td>${d && d.parent ? '' : n ? `<span class="chip b">${esc(n)}</span>` : '<span class="mut">—</span>'}</td>`);
    });
  };

  /* ---------- pagina Agenti ---------- */
  const st = { q: '', f: 'all' };
  // nomi dei DNS di MaxPlayer (gli agenti li hanno per id): letti una volta ogni 5 minuti per il riepilogo nell'elenco
  let mxNames = null, mxNamesT = 0, mxNamesBusy = false;
  async function loadMxNames() {
    if (mxNamesBusy || !(D.players && D.players.max) || (mxNames && Date.now() - mxNamesT < 5 * 60e3)) return;
    mxNamesBusy = true;
    try { const r = await api('GET', '/admin/maxplayer/domains'); mxNames = new Map((r.domains || []).map((x) => [String(x.id), x.label || 'DNS ' + x.id])); mxNamesT = Date.now(); if ($('#v-agents.on')) renderAgents(); } catch { mxNames = mxNames || new Map(); mxNamesT = Date.now(); } finally { mxNamesBusy = false; }
  }
  let ledgerSummary = new Map(), ledgerSummaryAt = 0, ledgerSummaryBusy = false;
  const ledgerNum = (n) => (+n || 0).toLocaleString('it-IT', { maximumFractionDigits: 2 });
  const ledgerPanel = (p) => ({ '': 'Generico', wolf: 'WOLF', armada: 'Armada', storm: 'Storm', atx: 'Atlantix', ro: 'Realott', slt: 'SLT' }[p || ''] || p);
  const LEDGER_PANEL_OPTIONS = [['', 'Generico', '#94a3b8'], ['wolf', 'WOLF', '#38bdf8'], ['armada', 'Armada', '#fb923c'], ['storm', 'Storm', '#a78bfa'], ['atx', 'Atlantix', '#22d3ee'], ['ro', 'Realott', '#4ade80'], ['slt', 'SLT', '#f472b6']];
  function ledgerBadge(s) {
    if (!s) return '';
    const credits = Object.values(s.credits || {}).reduce((n, x) => n + Math.max(0, +x || 0), 0);
    const parts = [];
    if (+s.eur > 0) parts.push(`${ledgerNum(s.eur)} €`);
    if (credits > 0) parts.push(`${ledgerNum(credits)} cr`);
    return parts.length ? `<span class="chip r" style="margin-left:6px">${parts.join(' · ')}</span>` : '';
  }
  function loadLedgerSummary() {
    if (isAgent() || ledgerSummaryBusy || ledgerSummaryAt && Date.now() - ledgerSummaryAt < 60000) return;
    ledgerSummaryBusy = true;
    api('GET', '/admin/agent-ledger').then((r) => {
      ledgerSummary = new Map((r.agents || []).map((x) => [+x.agentId, x]));
      ledgerSummaryAt = Date.now();
      if ($('#v-agents')) renderAgents();
    }).catch(() => {}).finally(() => { ledgerSummaryBusy = false; });
  }
  window.addEventListener('kxledger:update', () => { ledgerSummaryAt = 0; loadLedgerSummary(); });
  function ledgerBalanceText(balance) {
    const positive = [], negative = [], eur = +balance.eur || 0;
    if (eur > 0) positive.push(`${ledgerNum(eur)} €`);
    else if (eur < 0) negative.push(`${ledgerNum(Math.abs(eur))} €`);
    for (const [panel, amount] of Object.entries(balance.credits || {})) {
      const n = +amount || 0;
      if (n > 0) positive.push(`${ledgerNum(n)} crediti${panel ? ' ' + ledgerPanel(panel) : ''}`);
      else if (n < 0) negative.push(`${ledgerNum(Math.abs(n))} crediti${panel ? ' ' + ledgerPanel(panel) : ''}`);
    }
    return [positive.length ? `Ti deve: ${positive.join(' · ')}` : '', negative.length ? `A suo favore: ${negative.join(' · ')}` : ''].filter(Boolean).join(' · ') || 'Nessun debito';
  }
  async function loadAgentLedger(agent) {
    const box = $('#agLedgerBox'); if (!box) return;
    try {
      const data = await api('GET', `/admin/agent-ledger?agent=${agent.id}`);
      const summary = $('#agLedgerSummary'), history = $('#agLedgerHistory');
      if (!summary || !history || !$('#agLedgerBox')) return;
      summary.className = (+data.balance.eur > 0 || Object.values(data.balance.credits || {}).some((x) => +x > 0)) ? 'pay-badge due' : 'mut';
      summary.textContent = ledgerBalanceText(data.balance);
      history.innerHTML = window.KXPay?.ledgerHistory?.(data.entries, true) || '<p class="mut">Nessun movimento registrato.</p>';
      box.querySelectorAll('[data-ledger-add]').forEach((button) => {
        button.onclick = () => promptAgentLedger(agent, button.dataset.ledgerAdd);
      });
      box.querySelectorAll('[data-ledger-edit]').forEach((button) => {
        button.onclick = () => {
          const entry = data.entries.find((x) => String(x.id) === button.dataset.ledgerEdit);
          if (entry) promptAgentLedger(agent, entry.type, entry);
        };
      });
      box.querySelectorAll('[data-ledger-delete]').forEach((button) => {
        button.onclick = async () => {
          const entry = data.entries.find((x) => String(x.id) === button.dataset.ledgerDelete);
          if (!entry || !(await ask('Eliminare questo movimento?', `${entry.type === 'debt' ? 'Debito' : 'Pagamento'} · ${ledgerNum(entry.eur)} € · ${ledgerNum(entry.credits)} crediti${entry.note ? ' · ' + esc(entry.note) : ''}`, 'Elimina'))) return;
          try {
            await api('DELETE', `/admin/agent-ledger/${entry.id}`);
            ledgerSummaryAt = 0; await loadAgentLedger(agent); loadLedgerSummary(); toast('Movimento eliminato');
          } catch (e) { toast(e.message, 1); }
        };
      });
    } catch (e) {
      const summary = $('#agLedgerSummary'); if (summary) summary.textContent = e.message;
    }
  }
  function promptAgentLedger(agent, type, entry = null) {
    // oggi in Italia (ora del pannello): con toISOString dopo mezzanotte la data proposta era ancora quella di ieri (UTC)
    const now0 = new Date(), today = `${now0.getFullYear()}-${String(now0.getMonth() + 1).padStart(2, '0')}-${String(now0.getDate()).padStart(2, '0')}`;
    const date = entry ? new Date(+entry.t).toISOString().slice(0, 10) : today;
    const title = entry ? 'Modifica movimento' : type === 'debt' ? 'Aggiungi debito' : 'Registra pagamento';
    return ask(title, `<label class="lbl">Tipo</label><select class="inp" id="agLedgerType"><option value="debt"${(entry?.type || type) === 'debt' ? ' selected' : ''}>Debito</option><option value="pay"${(entry?.type || type) === 'pay' ? ' selected' : ''}>Pagamento</option></select><label class="lbl">Data</label><input class="inp" id="agLedgerDate" type="date" value="${date}"><label class="lbl">Euro</label><input class="inp" id="agLedgerEur" type="number" min="0" max="100000" step="0.01" value="${entry?.eur ?? ''}"><label class="lbl">Crediti</label><div style="display:flex;gap:8px"><input class="inp" id="agLedgerCredits" type="number" min="0" max="1000000" step="0.01" style="flex:1" value="${entry?.credits ?? ''}"><select class="inp" id="agLedgerPanel"><option value="">Generico</option><option value="wolf"${entry?.panel === 'wolf' ? ' selected' : ''}>WOLF</option><option value="armada"${entry?.panel === 'armada' ? ' selected' : ''}>Armada</option><option value="storm"${entry?.panel === 'storm' ? ' selected' : ''}>Storm</option><option value="atx"${entry?.panel === 'atx' ? ' selected' : ''}>Atlantix</option><option value="ro"${entry?.panel === 'ro' ? ' selected' : ''}>Realott</option><option value="slt"${entry?.panel === 'slt' ? ' selected' : ''}>SLT</option></select></div><label class="lbl">Nota</label><input class="inp" id="agLedgerNote" maxlength="200" value="${esc(entry?.note || '')}">`, 'Salva').then(async (ok) => {
      if (!ok) return;
      const eur = Number($('#agLedgerEur').value), credits = Number($('#agLedgerCredits').value), note = $('#agLedgerNote').value.trim();
      if (!Number.isFinite(eur) || eur < 0 || eur > 100000 || !Number.isFinite(credits) || credits < 0 || credits > 1000000 || !(eur > 0 || credits > 0) || note.length > 200) return toast('Controlla importi e nota', 1);
      try {
        const typeValue = $('#agLedgerType').value;
        const body = { type: typeValue, eur, credits, panel: $('#agLedgerPanel').value, note, date: $('#agLedgerDate').value };
        if (entry) await api('PUT', `/admin/agent-ledger/${entry.id}`, body);
        else await api('POST', '/admin/agent-ledger', { agent: agent.id, ...body });
        ledgerSummaryAt = 0; await loadAgentLedger(agent); loadLedgerSummary();
        window.dispatchEvent(new CustomEvent('kxledger:update'));
        await window.KXPay?.loadLedger?.(true);
        toast(entry ? 'Movimento modificato' : typeValue === 'debt' ? 'Debito aggiunto' : 'Pagamento registrato');
      } catch (e) { toast(e.message, 1); }
    });
  }
  window.KXAgentLedger = { prompt: promptAgentLedger };
  /** riepilogo dei DNS dell'agente: server delle linee, OrbixPlay e MaxPlayer, ognuno col suo colore */
  function dnsSum(a) {
    const p = a.perms || {};
    const lst = (v, names) => (!Array.isArray(v) || v.includes('*') ? '<i class="dn-all">tutti</i>' : v.length ? v.map((x) => esc(names ? names.get(String(x)) || 'DNS ' + x : String(x))).join(', ') : '<i class="dn-no">nessuno</i>');
    return `<div class="dn-r"><span class="dn-k srv">LINEE</span><span>${(a.serverNames || []).length ? a.serverNames.map(esc).join(', ') : '<i class="dn-no">nessun server</i>'}</span></div>`
      + (p.players ? `<div class="dn-r"><span class="dn-k op">OP</span><span>${lst(p.orbDns)}</span></div><div class="dn-r"><span class="dn-k mx">MX</span><span>${lst(p.mxDns, mxNames)}</span></div>` : '');
  }
  function renderAgents() {
    const V = $('#v-agents'); if (!V) return;
    loadLedgerSummary();
    loadMxNames();
    const L = D.agents || [];
    const sub = isAgent();
    const list = L.filter((a) => (st.f === 'all' || (st.f === 'on' ? a.active : !a.active)) && (!st.q || [a.username, a.email, a.notes].join(' ').toLowerCase().includes(st.q)));
    const byId = new Map(L.map((a) => [a.id, a]));
    const S = D.settings || {}, showHost = !sub && !window.__assist;
    const hostCard = !showHost ? '' : `<div class="card glass ag-host" id="agHost"><div class="hd"><h3>🔗 Indirizzo per i tuoi agenti<small>Dai agli agenti un link diverso dal tuo: non vedranno mai l'indirizzo con cui entri tu</small></h3></div>
      <div class="ag-hrow"><input class="inp" id="agHostI" placeholder="es. agenti-tuodominio.com" value="${esc(S.agentHost || '')}"><button class="btn pri" id="agHostS">Salva</button>${S.agentHost ? `<button class="btn" id="agHostC">Copia link agenti</button>` : ''}</div>
      ${S.agentHost ? `<div class="ag-hlink">Link da dare agli agenti: <b class="mono">https://${esc(S.agentHost)}</b></div>
      <div class="tog ${S.agentHostOnly ? 'on' : ''}" id="agHostO" role="switch" tabindex="0" style="margin-top:10px"><div><b>Gli agenti entrano solo da questo indirizzo</b><small>${S.agentHostOnly ? 'Acceso: dal tuo indirizzo gli agenti non possono più entrare' : 'Spento: per ora entrano da entrambi (accendilo dopo aver provato che il link funziona)'}</small></div><i></i></div>` : ''}
      <p class="ag-hnote">Il dominio deve essere tuo su Cloudflare e collegato al pannello (dominio personalizzato del Worker <b>kairos-panel</b>). Da quell'indirizzo tu non entri (risulta «credenziali errate»), così nessuno capisce che è anche il tuo pannello. L'assistenza agli agenti la fai sempre dal tuo.</p></div>`;
    V.innerHTML = `${hostCard}<div class="ag-bar"><input class="inp" id="agQ" placeholder="Cerca agente per nome, email o note" value="${esc(st.q)}">
      <div class="seg" id="agF">${[['all', 'Tutti'], ['on', 'Attivi'], ['off', 'Disattivati']].map(([k, l]) => `<button data-f="${k}" class="${st.f === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${!sub && !window.__assist ? '<button class="btn" id="agHealth">🩺 Controllo generale</button>' : ''}${!sub || me().canAgents ? '<button class="btn" id="agBulk">👥 Applica a più agenti</button>' : ''}<button class="btn pri" id="agNew">+ Nuovo ${sub ? 'sotto-agente' : 'agente'}</button></div>
      <div class="card glass" style="padding:0;overflow:auto">${list.length ? `<table class="ag-tbl"><thead><tr><th class="num">ID</th><th>Agente</th><th>Clienti</th><th class="hm">Sottoagenti</th><th>Accesso</th>${sub ? '' : '<th>Link accesso</th>'}<th>DNS</th><th class="hm">Ultima attività</th><th class="hm">2FA</th><th>Stato</th></tr></thead><tbody>
      ${list.map((a) => { const pct = a.maxClients ? Math.min(100, Math.round((a.clients / a.maxClients) * 100)) : 100; const up = a.parentId && byId.get(a.parentId);
        return `<tr data-ag="${a.id}"><td class="num">${a.id}</td>
        <td><b>${esc(a.username)}</b>${ledgerBadge(ledgerSummary.get(a.id))}<small>${esc(a.email || '—')} · Responsabile: ${esc(up ? up.username : 'Master')}</small></td>
        <td><b>${a.clients}</b><small>Limite: ${a.maxClients}</small><div class="ag-bar2"><s style="width:${pct}%"></s></div><button type="button" class="btn sm ag-cl" data-agcl="${a.id}" title="Apre Clienti con solo i clienti di ${esc(a.username)}">👥 Vedi i suoi clienti</button></td>
        <td class="hm">${a.subAgents}</td>
        <td><span class="chip ${a.canAgents ? 'b' : ''}">${a.canAgents ? 'Gestisce agenti' : 'Solo clienti'}</span>${(a.perms || {}).armada ? '<br><span class="chip" style="margin-top:4px">Armada</span>' : ''}${(a.perms || {}).storm ? '<br><span class="chip" style="margin-top:4px">Storm</span>' : ''}${(a.perms || {}).wolf ? '<br><span class="chip" style="margin-top:4px">WOLF</span>' : ''}${(a.perms || {}).mxp ? '<br><span class="chip" style="margin-top:4px">MaxPlayer</span>' : ''}${(a.perms || {}).oxp ? '<br><span class="chip" style="margin-top:4px">OrbixPlay</span>' : ''}</td>
        ${sub ? '' : `<td><button type="button" class="btn sm" data-aglink="${a.id}" title="Link personale e codice di accesso">🔗 Link accesso</button></td>`}
        <td class="dn">${dnsSum(a)}</td>
        <td class="hm">${a.lastSeen ? esc(ago(a.lastSeen)) : '<span class="mut">mai</span>'}</td>
        <td class="hm">${a.totp ? '<span class="chip g">Attiva</span>' : '<span class="chip">No</span>'}</td>
        <td><span class="ag-st ${a.active ? 'on' : 'off'}"><i></i>${a.active ? 'Attivato' : 'Disattivato'}</span></td></tr>`; }).join('')}</tbody></table>`
      : `<div class="emptyc">${L.length ? 'Nessun agente trovato' : `Nessun agente ancora.<br><span style="font-size:13px">Gli agenti sono i tuoi rivenditori: entrano nel pannello con le loro credenziali e gestiscono solo i propri clienti, con i permessi che decidi tu.</span>`}</div>`}</div>`;
    $('#agQ').oninput = (e) => { st.q = e.target.value.toLowerCase(); const p = e.target.selectionStart; renderAgents(); const q = $('#agQ'); q.focus(); q.setSelectionRange(p, p); };
    $$('#agF [data-f]').forEach((b) => (b.onclick = () => { st.f = b.dataset.f; renderAgents(); }));
    if (showHost) {
      const saveHost = async (body, msg) => { try { const r = await api('PUT', '/admin/settings', body); if (r && r.settings) D.settings = r.settings; else Object.assign(D.settings, body); renderAgents(); toast(msg); } catch (e) { toast(e.message, 1); } };
      $('#agHostS').onclick = () => saveHost({ agentHost: $('#agHostI').value.trim() }, $('#agHostI').value.trim() ? 'Indirizzo degli agenti salvato' : 'Indirizzo degli agenti tolto');
      if ($('#agHostC')) $('#agHostC').onclick = () => navigator.clipboard.writeText('https://' + S.agentHost).then(() => toast('Link copiato'), () => toast('Copia non consentita', 1));
      if ($('#agHostO')) $('#agHostO').onclick = async () => {
        const on = !S.agentHostOnly;
        if (on && !(await ask('Agenti solo dal loro indirizzo?', `Da adesso gli agenti entrano solo da <b>https://${esc(S.agentHost)}</b>. Chi è collegato dal tuo indirizzo viene scollegato. Prima prova che il link funzioni.`, 'Attiva'))) return;
        saveHost({ agentHostOnly: on }, on ? 'Agenti solo dal loro indirizzo' : 'Gli agenti possono entrare da entrambi');
      };
    }
    $('#agHealth') && ($('#agHealth').onclick = openHealthCheck);
    $('#agBulk') && ($('#agBulk').onclick = openBulkAgents);
    $('#agNew').onclick = () => openAgent(null);
    $$('[data-ag]', V).forEach((r) => (r.onclick = () => openAgent(L.find((a) => a.id === +r.dataset.ag))));
    $$('[data-aglink]', V).forEach((b) => (b.onclick = (e) => { e.stopPropagation(); linkBox(L.find((a) => a.id === +b.dataset.aglink)); }));
    $$('[data-agcl]', V).forEach((b) => (b.onclick = (e) => { e.stopPropagation(); window.KXOwn.show(b.dataset.agcl); }));
  }

  function openHealthCheck() {
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;z-index:12000;background:#000b;display:grid;place-items:center;padding:12px';
    modal.innerHTML = `<div class="glass" style="width:min(900px,100%);max-height:92vh;overflow:auto;padding:16px;border-radius:16px"><div style="display:flex;align-items:center;gap:10px"><h3 style="margin:0;flex:1">🩺 Controllo generale</h3><button class="btn sm" id="agHealthRefresh">Ricontrolla</button><button class="icb" id="agHealthClose" aria-label="Chiudi">×</button></div><div id="agHealthContent" style="margin-top:12px">Controllo in corso…</div></div>`;
    document.body.appendChild(modal);
    const content = modal.querySelector('#agHealthContent');
    let onKey;
    const close = () => { modal.remove(); if (onKey) removeEventListener('keydown', onKey); };
    modal.querySelector('#agHealthClose').onclick = close;
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    onKey = (e) => { if (e.key === 'Escape' && document.body.contains(modal)) close(); };
    addEventListener('keydown', onKey);
    const issueHtml = (issue) => `<div style="padding:8px 10px;margin-top:7px;border-radius:10px;background:rgba(255,255,255,.045);border-left:3px solid ${issue.level === 'red' ? '#ff7777' : '#ecc06f'}"><b>${esc(issue.area)}</b><div>${esc(issue.text)}</div></div>`;
    const problems = (issues) => (issues || []).map(issueHtml).join('') || '<span class="mut">Nessun problema rilevato.</span>';
    const render = (data) => {
      const ownerIssues = data.owner?.issues || [];
      const troubled = (data.agents || []).filter((a) => (a.issues || []).length).sort((a, b) => {
        const red = (x) => x.issues.filter((i) => i.level === 'red').length;
        return red(b) - red(a) || b.issues.length - a.issues.length || a.username.localeCompare(b.username);
      });
      const clear = (data.agents || []).filter((a) => !(a.issues || []).length).sort((a, b) => a.username.localeCompare(b.username));
      const n = ownerIssues.length + troubled.reduce((sum, a) => sum + a.issues.length, 0);
      const sections = ownerIssues.length ? `<section style="margin:12px 0"><h4 style="margin:0">I tuoi clienti</h4>${problems(ownerIssues)}</section>` : '';
      const rows = troubled.map((a) => {
        const red = a.issues.some((i) => i.level === 'red');
        return `<section style="margin:12px 0;padding:10px;border:1px solid var(--line);border-radius:12px"><div style="display:flex;align-items:center;gap:8px"><span style="color:${red ? '#ff7777' : '#ecc06f'}">●</span><b style="flex:1">${esc(a.username)}</b><button class="btn sm" data-health-agent="${a.id}">Apri agente</button></div>${problems(a.issues)}</section>`;
      }).join('');
      content.innerHTML = `<div style="padding:9px 11px;border-radius:10px;background:rgba(255,255,255,.06)">${n ? `${n} problemi · ${ownerIssues.length ? 'clienti tuoi · ' : ''}${troubled.length} agenti da controllare` : 'Tutto a posto: nessun problema rilevato.'}</div>${sections}${rows}${clear.length ? `<details style="margin-top:12px"><summary style="cursor:pointer">✅ Tutto a posto (${clear.length})</summary><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:6px;margin-top:8px">${clear.map((a) => `<span class="chip">${esc(a.username)}</span>`).join('')}</div></details>` : ''}`;
      content.querySelectorAll('[data-health-agent]').forEach((button) => {
        button.onclick = () => { const a = (D.agents || []).find((x) => +x.id === +button.dataset.healthAgent); close(); if (a) openAgent(a); };
      });
    };
    const refresh = async (fresh) => {
      const button = modal.querySelector('#agHealthRefresh');
      button.disabled = true; button.textContent = 'Controllo in corso…';
      if (!content.dataset.loaded) content.textContent = 'Controllo in corso… (può servire fino a un minuto)';
      try { const data = await api('GET', '/admin/health-check' + (fresh ? '?fresh=1' : '')); render(data); content.dataset.loaded = '1'; }
      catch (e) { content.innerHTML = `<div class="st warn">${esc(e.message)}</div>`; }
      finally { if (document.body.contains(modal)) { button.disabled = false; button.textContent = 'Ricontrolla'; } }
    };
    modal.querySelector('#agHealthRefresh').onclick = () => refresh(true);
    refresh(false);
  }

  /* ---------- pagina intera: crea / modifica agente ---------- */
  const page = document.createElement('div'); page.id = 'agPage';
  page.innerHTML = '<div class="ah"><h3 id="agT"></h3><button class="icb" id="agX" title="Chiudi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div><div class="ab" id="agB"></div><div class="af" id="agFt"></div>';
  document.body.appendChild(page);
  const closePage = () => page.classList.remove('on');
  $('#agX').onclick = closePage;
  addEventListener('keydown', (e) => { if (e.key === 'Escape') closePage(); });
  const chk = (name, val, label, on, dis, sm) => `<label class="${dis ? 'dis' : ''}"><input type="checkbox" data-${name}="${esc(val)}" ${on ? 'checked' : ''} ${dis ? 'disabled' : ''}>${label}${(name === 'ad' || name === 'cad') && window.KX_EYE ? window.KX_EYE(val) : ''}${sm ? `<small>${sm}</small>` : ''}</label>`;
  // app dello store: «tutte» oppure quelle scelte (un sotto-agente mai più di chi lo crea)
  const storeAppsBox = (P, topP) => {
    const cur = Array.isArray(P.storeApps) ? P.storeApps : ['*'], all = cur.includes('*');
    const topAll = !topP || !Array.isArray(topP.storeApps) || topP.storeApps.includes('*');
    const names = [...new Set([...(D.storeAppNames || []), ...(topAll ? [] : topP.storeApps), ...cur.filter((x) => x !== '*')])].filter((x) => topAll || topP.storeApps.some((y) => y.toLowerCase() === x.toLowerCase())).sort((x, y) => x.localeCompare(y));
    return (topAll ? chk('sapp', '*', '<b>Tutte le app</b>', all, false, 'Anche quelle che aggiungerai in futuro') : '') + (names.length ? names.map((n) => chk('sapp', n, esc(n), all ? !topAll : cur.some((x) => x.toLowerCase() === n.toLowerCase()), false, '')).join('') : '<p class="mut" style="font-size:12.5px">Le app compaiono qui dopo la prima richiesta dallo store; puoi anche aggiungerle a mano.</p>');
  };
  // app di «Attiva app» (manage-device) che l'agente può vedere/usare: ['*'] = tutte
  const appsAllowBox = (P) => {
    const cur = Array.isArray(P.appsAllow) ? P.appsAllow : ['*'], all = cur.includes('*');
    const names = [...new Set([...(((D.settings && D.settings.appLinks) || []).map((x) => x.name)), ...cur.filter((x) => x !== '*')])].sort((a, b) => a.localeCompare(b));
    return chk('aapp', '*', '<b>Tutte le app</b>', all, false, 'Anche quelle che aggiungerai in futuro') + (names.length ? names.map((n) => chk('aapp', n, esc(n), !all && cur.some((x) => x.toLowerCase() === n.toLowerCase()), false, '')).join('') : '<p class="mut" style="font-size:12.5px">Nessuna app: le aggiungi in APP Store → Attiva app.</p>');
  };
  const actAppsBox = (P, topP) => {
    const cur = new Set(Array.isArray(P.actApps) ? P.actApps : []);
    const allowed = new Set(Array.isArray(topP && topP.actApps) ? topP.actApps : []);
    const has = (keys, app) => (Array.isArray(app.aliases) && app.aliases.length ? app.aliases : [app.key]).some((key) => keys.has(key));
    const apps = (D.activationApps || []).filter((x) => !topP || has(allowed, x));
    return apps.length ? apps.map((x) => chk('actapp', x.key, esc(x.name) + (x.enabled ? '' : ' <small>(spenta dal Master)</small>'), has(cur, x), !x.enabled, '')).join('') : '<small class="mut">Il Master non ha ancora attivato app per Nuovo cliente.</small>';
  };
  /* link di accesso personale di un agente + codice: copia, rigenera, revoca (come i pannelli dei fornitori) */
  async function linkBox(a) {
    const P = `/admin/agents/${a.id}/access-link`, day = (t) => (t ? new Date(t).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
    let L; try { L = await api('GET', P); } catch (e) { return toast(e.message, 1); }
    const html = () => `<div style="font-size:11px;letter-spacing:.14em;font-weight:800;color:#8fb3ff;margin:-6px 0 2px">🔗 ACCESSO PROTETTO</div>
      <p class="mut" style="font-size:12.5px;margin:8px 0 12px">Il link apre il pannello esclusivamente con l'account di <b>${esc(a.username)}</b>. Non contiene username o password: per entrare serve anche il codice di accesso.</p>
      <label class="lbl">Link personale</label><div class="row" style="grid-template-columns:1fr auto"><input class="inp mono" readonly value="${esc(L.on ? L.url : '')}" placeholder="Nessun link generato" style="font-size:12px"><button type="button" class="btn" data-lk="url" ${L.on ? '' : 'disabled'}>⧉ Copia</button></div>
      <small class="mut">${L.on ? `Link attivo · creato ${esc(day(L.created))} · ultimo accesso ${esc(day(L.used))}` : 'Nessun link attivo per questo agente.'}</small>
      ${L.on ? `<label class="lbl" style="margin-top:10px">Codice di accesso</label><div class="row" style="grid-template-columns:1fr auto"><input class="inp mono" readonly value="${esc(L.code)}" style="letter-spacing:.12em"><button type="button" class="btn" data-lk="code">⧉ Copia codice</button></div>
      <small class="mut">Il codice è conservato cifrato e può essere rivisto solo da questa gestione.</small>` : ''}
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap"><button type="button" class="btn danger" data-lk="del" ${L.on ? '' : 'disabled'}>⊘ Revoca</button><button type="button" class="btn" data-lk="new" ${L.on ? '' : 'disabled'}>↻ Rigenera</button>${L.on ? '' : '<button type="button" class="btn pri" data-lk="new">🔗 Genera link</button>'}</div>`;
    const bind = () => $$('#mB [data-lk]').forEach((b) => (b.onclick = async () => {
      const k = b.dataset.lk;
      if (k === 'url' || k === 'code') return navigator.clipboard.writeText(L[k]).then(() => toast(k === 'url' ? 'Link copiato' : 'Codice copiato'), () => toast('Copia non consentita', 1));
      if ((k === 'del' || (k === 'new' && L.on)) && !confirm(k === 'del' ? 'Revocare il link? Smette subito di funzionare e l\'agente viene scollegato.' : 'Rigenerare? Link e codice vecchi smettono subito di funzionare e l\'agente viene scollegato.')) return;
      try { if (k === 'del') { await api('DELETE', P); L = { on: false }; toast('Link revocato'); } else { L = await api('POST', P); toast('Link e codice pronti: copiali e mandali all\'agente'); } $('#mB').innerHTML = html(); bind(); } catch (e) { toast(e.message, 1); }
    }));
    const pr = ask('Link accesso · ' + a.username, html(), 'Chiudi'); bind(); await pr;
  }
  const APP_KEYS = ['appstore', 'players', 'appsOp', 'dlcodes', 'appk', 'armada', 'storm', 'wolf', 'mxp', 'oxp', 'ro', 'slt', 'atx']; // hanno la loro sezione nell'editor
  const KAPPS = [['pro', 'Kairos Pro'], ['tv', 'Kairos TV'], ['lite', 'Kairos Lite'], ['xc', 'Kairos XC'], ['prem', 'Kairos Premium'], ['plus', 'Kairos Plus'], ['nova', 'Kairos Nova'], ['store', 'Kairos Store']];
  const dlcNames = () => (Array.isArray(D.dlCodes) ? D.dlCodes : []).map((x) => [x.name, x.name]);
  const bulkAppFlags = new Set(['appstore', 'players', 'appsOp', 'dlcodes', 'appk']);
  const bulkPanelFlags = new Set(['armada', 'armadaTrial', 'storm', 'stormTrial', 'wolf', 'mxp', 'oxp', 'oxpNew', 'ro', 'slt', 'atx']);
  const bulkFlagGroups = [
    ['Permessi', FL.filter(([k]) => !bulkAppFlags.has(k) && !bulkPanelFlags.has(k))],
    ['Pagine del pannello', FP.filter(([k]) => !bulkAppFlags.has(k) && !bulkPanelFlags.has(k) && k !== 'store')],
    ['Sezione App', [...FL, ...FP].filter(([k]) => bulkAppFlags.has(k))],
    ['Pannelli IPTV', [
      ...FP.filter(([k]) => bulkPanelFlags.has(k)),
      ['armadaTrial', 'Può creare prove gratuite Armada', 'Al massimo 10 al giorno'],
      ['stormTrial', 'Può creare prove gratuite Storm', 'Al massimo 10 al giorno'],
      ['oxpNew', 'Può creare playlist OrbixPlay', 'Usa i tuoi posti'],
    ]],
  ].map(([title, entries]) => [title, entries.filter((entry, i) => entries.findIndex((x) => x[0] === entry[0]) === i)]);
  const bulkListDefs = () => {
    const apps = Array.isArray(D.settings && D.settings.appLinks) ? D.settings.appLinks : Array.isArray(D.appLinks) ? D.appLinks : [];
    return [
      { key: 'dlcAllow', title: 'Codici downloader', all: 'Tutti i codici', items: dlcNames() },
      { key: 'appsAllow', title: 'Attiva app', all: 'Tutte le app', items: [...new Set(apps.map((x) => x.name).filter(Boolean))].map((x) => [x, x]) },
      { key: 'kAllow', title: 'App Kairos', all: 'Tutte le app', items: KAPPS },
      { key: 'storeApps', title: 'Store apps', all: 'Tutte le app', items: [...new Set((D.storeAppNames || []).filter(Boolean))].map((x) => [x, x]) },
      { key: 'actApps', title: 'App da attivare in Nuovo cliente', all: 'Tutte le app attive', items: (D.activationApps || []).map((x) => [x.key, x.name]) },
    ];
  };
  function openBulkAgents() {
    const agents = D.agents || [], lists = bulkListDefs();
    const selected = new Set(), state = { step: 1, search: '', flags: {}, lists: {} };
    const appLabel = (key, value) => value === '*' ? lists.find((x) => x.key === key)?.all || 'Tutti' : lists.find((x) => x.key === key)?.items.find((x) => String(x[0]).toLowerCase() === String(value).toLowerCase())?.[1] || value;
    const listAll = (agent, key) => {
      const value = (agent.perms || {})[key];
      if (key === 'actApps') {
        const enabled = (D.activationApps || []).filter((x) => x.enabled).map((x) => x.key);
        return Array.isArray(value) && enabled.length > 0 && enabled.every((x) => value.includes(x));
      }
      return !Array.isArray(value) || value.includes('*');
    };
    const listHas = (agent, key, value) => value === '*' ? listAll(agent, key) : listAll(agent, key) || ((agent.perms || {})[key] || []).some((x) => String(x).toLowerCase() === String(value).toLowerCase());
    const agentNames = (agentsWith) => agentsWith.map((a) => a.username || `Agente ${a.id}`);
    const shortNames = (names) => `${names.slice(0, 6).map(esc).join(', ')}${names.length > 6 ? ` +${names.length - 6} altri` : ''}`;
    const hasChanges = () => Object.keys(state.flags).length > 0 || Object.keys(state.lists).length > 0;
    const captureChanges = () => {
      state.flags = Object.fromEntries($$('#mB [data-bulk-flag]').filter((x) => x.value !== '').map((x) => [x.dataset.bulkFlag, x.value === '1']));
      state.lists = {};
      for (const def of lists) {
        const items = $$('#mB [data-bulk-list="' + def.key + '"]:checked').map((x) => x.dataset.bulkValue);
        if (items.length) state.lists[def.key] = { mode: ($('#mB [data-bulk-mode="' + def.key + '"]') || {}).value || 'add', items };
      }
    };
    const render = () => {
      const step = state.step, steps = ['Cosa cambiare', 'A quali agenti', 'Riepilogo'];
      const head = `<div class="ag-bulk-steps">${steps.map((x, i) => `<span class="ag-bulk-step ${step === i + 1 ? 'on' : ''}">${i + 1}. ${x}</span>`).join('')}</div>`;
      if (step === 1) {
        const perms = bulkFlagGroups.map(([title, entries]) => `<section class="ag-bulk-group"><h4>${esc(title)}</h4><div class="ag-bulk-perms">${entries.map(([k, label, help]) => {
          const assigned = agents.filter((a) => !!(a.perms || {})[k]), names = agentNames(assigned), active = assigned.length > 0;
          return `<label class="ag-bulk-perm"${active ? ' style="background:rgba(34,197,94,.08);outline:1px solid rgba(34,197,94,.18)"' : ''}><span>${esc(label)}${help ? `<small>${esc(help)}</small>` : ''}<small style="display:block;margin-top:4px;color:${active ? '#6ee7a1' : '#9ca3af'}">${active ? `✅ Già acceso a: ${shortNames(names)} (${assigned.length} su ${agents.length})` : 'Nessun agente'}</small></span><select class="inp" data-bulk-flag="${esc(k)}"><option value="">Non cambiare</option><option value="1"${state.flags[k] === true ? ' selected' : ''}>Sì</option><option value="0"${state.flags[k] === false && Object.hasOwn(state.flags, k) ? ' selected' : ''}>No</option></select></label>`;
        }).join('')}</div></section>`).join('');
        const listHtml = lists.map((def) => {
          const cur = state.lists[def.key], selectedItems = new Set((cur?.items || []).map((x) => String(x).toLowerCase()));
          const items = [['*', def.all], ...def.items].map(([value, label]) => {
            const assigned = agents.filter((a) => listHas(a, def.key, value)), names = agentNames(assigned);
            const count = value === '*' ? agents.filter((a) => listAll(a, def.key)) : assigned;
            const tip = names.length ? ` title="${esc(names.join(', '))}"` : '';
            return `<label style="${assigned.length ? 'color:#86efac' : 'color:#a1a1aa'}"><input type="checkbox" data-bulk-list="${esc(def.key)}" data-bulk-value="${esc(value)}"${selectedItems.has(String(value).toLowerCase()) ? ' checked' : ''}> ${esc(label)} <small${tip} style="display:inline;margin:0 0 0 3px;color:${assigned.length ? '#6ee7a1' : '#9ca3af'}">${value === '*' ? `Tutti: ${count.length}` : `(${assigned.length})`}</small></label>`;
          }).join('');
          return `<section class="ag-bulk-list"><h5>${esc(def.title)}</h5><select class="inp" data-bulk-mode="${esc(def.key)}"><option value="add"${!cur || cur.mode === 'add' ? ' selected' : ''}>Aggiungi</option><option value="remove"${cur?.mode === 'remove' ? ' selected' : ''}>Togli</option><option value="set"${cur?.mode === 'set' ? ' selected' : ''}>Sostituisci</option></select><div class="ag-chk">${items || '<small>Nessuna voce disponibile.</small>'}</div><small>Nessuna spunta = nessuna modifica. «Tutti» (*) include anche le voci future; con «Togli», un elenco già impostato su tutti resta tutti.</small></section>`;
        }).join('');
        $('#mB').innerHTML = `${head}<div class="ag-bulk-wrap"><p class="mut">Scegli solo le voci da cambiare: tutto il resto resta com'è. ${isAgent() ? 'I permessi non concessi a te saranno tolti automaticamente.' : ''}</p>${perms}<section class="ag-bulk-group"><h4>Elenchi consentiti</h4><div class="ag-bulk-lists">${listHtml}</div></section></div>`;
        const updateNext = () => { captureChanges(); $('#mYes').disabled = !hasChanges(); };
        $$('#mB [data-bulk-flag], #mB [data-bulk-list], #mB [data-bulk-mode]').forEach((x) => (x.onchange = updateNext));
        $('#mYes').textContent = 'Avanti'; $('#mYes').disabled = !hasChanges(); $('#mNo').textContent = 'Annulla';
      } else if (step === 2) {
        const q = state.search.toLowerCase(), visible = agents.filter((a) => !q || [a.username, a.email, a.id].join(' ').toLowerCase().includes(q));
        const allVisible = visible.length > 0 && visible.every((a) => selected.has(a.id));
        const chips = (a) => {
          const out = Object.entries(state.flags).map(([k, wanted]) => {
            const has = !!(a.perms || {})[k] === wanted;
            const label = bulkFlagGroups.flatMap(([, rows]) => rows).find((x) => x[0] === k)?.[1] || k;
            return `<small style="display:inline-block;margin:3px 4px 0 0;padding:3px 6px;border-radius:8px;background:${has ? '#14532d' : '#7f1d1d'};color:${has ? '#bbf7d0' : '#fecaca'}">${has ? '✓ ha già' : '↗ non ha'} ${esc(label)}: ${wanted ? 'Sì' : 'No'}</small>`;
          });
          for (const [key, op] of Object.entries(state.lists)) for (const value of op.items) {
            const has = listHas(a, key, value), label = appLabel(key, value), removing = op.mode === 'remove' && has;
            out.push(`<small style="display:inline-block;margin:3px 4px 0 0;padding:3px 6px;border-radius:8px;background:${removing ? '#713f12' : has ? '#14532d' : '#7f1d1d'};color:${removing ? '#fde68a' : has ? '#bbf7d0' : '#fecaca'}">${has ? '✓ ha già' : '↗ non ha'} ${esc(label)}${removing ? ' · verrà tolto' : ''}</small>`);
          }
          return out.join('');
        };
        $('#mB').innerHTML = `${head}<div class="ag-bulk-wrap"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px"><input class="inp" id="agBulkQ" placeholder="Cerca agente per nome o email" value="${esc(state.search)}" style="margin:0;flex:1;min-width:180px"><label><input type="checkbox" id="agBulkAll"${allVisible ? ' checked' : ''}> Seleziona tutti</label></div><small class="mut" style="display:block;margin:0 0 8px">Puoi selezionare fino a 200 agenti. Se sei un sotto-agente, qui compaiono solo i tuoi sotto-agenti.</small><div class="ag-bulk-agents">${visible.map((a) => `<label class="ag-bulk-agent"><input type="checkbox" data-bulk-agent="${a.id}"${selected.has(a.id) ? ' checked' : ''}><span><b>${esc(a.username)}</b><small>ID ${a.id}${a.email ? ' · ' + esc(a.email) : ''}</small><span style="display:block">${chips(a)}</span></span></label>`).join('') || '<div class="emptyc">Nessun agente trovato.</div>'}</div><p class="mut" style="margin:8px 0 0">Selezionati: <b id="agBulkCount">${selected.size}</b></p></div>`;
        $('#agBulkQ').oninput = (e) => { state.search = e.target.value; render(); $('#agBulkQ').focus(); $('#agBulkQ').setSelectionRange(state.search.length, state.search.length); };
        const updateSelection = () => {
          const checks = $$('#mB [data-bulk-agent]');
          for (const c of checks) { if (c.checked) selected.add(+c.dataset.bulkAgent); else selected.delete(+c.dataset.bulkAgent); }
          $('#agBulkCount').textContent = selected.size;
          $('#mYes').disabled = !selected.size;
        };
        $('#agBulkAll').onchange = (e) => {
          if (e.target.checked) for (const a of visible) {
            if (selected.size >= 200 && !selected.has(a.id)) { toast('Puoi selezionare al massimo 200 agenti', 1); break; }
            selected.add(a.id);
          } else visible.forEach((a) => selected.delete(a.id));
          render();
        };
        $$('#mB [data-bulk-agent]').forEach((x) => (x.onchange = () => {
          if (x.checked && selected.size >= 200 && !selected.has(+x.dataset.bulkAgent)) { x.checked = false; toast('Puoi selezionare al massimo 200 agenti', 1); }
          updateSelection();
        }));
        $('#mYes').textContent = 'Riepilogo'; $('#mYes').disabled = !selected.size; $('#mNo').textContent = 'Indietro';
      } else if (step === 3) {
        const flagNames = new Map(bulkFlagGroups.flatMap(([, entries]) => entries.map(([k, name]) => [k, name])));
        const flagSummary = Object.entries(state.flags).map(([k, v]) => `<li>${esc(flagNames.get(k) || k)} → <b>${v ? 'Sì' : 'No'}</b></li>`).join('');
        const listSummary = Object.entries(state.lists).map(([k, op]) => `<li>${esc(lists.find((x) => x.key === k)?.title || k)} · ${op.mode === 'add' ? 'Aggiungi' : op.mode === 'remove' ? 'Togli' : 'Sostituisci'}: ${op.items.map((x) => esc(appLabel(k, x))).join(', ')}</li>`).join('');
        const names = agents.filter((a) => selected.has(a.id)).map((a) => `<li>${esc(a.username)}</li>`).join('');
        $('#mB').innerHTML = `${head}<div class="ag-bulk-wrap"><p>Conferma le modifiche per questi agenti:</p><div class="ag-bulk-summary"><b>Agenti (${selected.size})</b><ul>${names}</ul></div><div class="ag-bulk-summary"><b>Permessi</b><ul>${flagSummary || '<li>Nessuna modifica</li>'}</ul></div><div class="ag-bulk-summary"><b>Elenchi</b><ul>${listSummary || '<li>Nessuna modifica</li>'}</ul></div>${isAgent() ? '<p class="mut">I permessi e gli elenchi saranno limitati a quelli concessi a te.</p>' : ''}</div>`;
        $('#mYes').textContent = `Applica a ${selected.size} agenti`; $('#mYes').disabled = !selected.size || !hasChanges(); $('#mNo').textContent = 'Indietro';
      } else {
        const skipped = state.result?.skipped || [];
        $('#mB').innerHTML = `${head}<div class="ag-bulk-wrap"><div class="ag-bulk-summary"><b>${state.error ? 'Non è stato possibile applicare le modifiche' : `Aggiornati ${state.result?.updated || 0} · saltati ${skipped.length}`}</b>${state.error ? `<p>${esc(state.error)}</p>` : ''}${skipped.length ? `<ul>${skipped.map((x) => `<li>${esc(x.username || `Agente ${x.id}`)}: ${esc(x.reason)}</li>`).join('')}</ul>` : ''}</div></div>`;
        $('#mYes').textContent = 'Chiudi'; $('#mYes').disabled = false; $('#mNo').style.display = 'none';
      }
    };
    const noText = $('#mNo').textContent, promise = ask('👥 Applica a più agenti', '', 'Avanti'), resetNo = () => { $('#mNo').textContent = noText; $('#mNo').style.display = ''; }, okYes = $('#mYes').onclick, okNo = $('#mNo').onclick, closeYes = () => { resetNo(); okYes(); }, closeNo = () => { resetNo(); okNo(); };
    $('#mYes').onclick = async () => {
      if (state.step === 1) { captureChanges(); if (!hasChanges()) return; state.step = 2; render(); return; }
      if (state.step === 2) { if (!selected.size) return; state.step = 3; render(); return; }
      if (state.step === 3) {
        $('#mYes').disabled = true;
        const payload = { ids: [...selected], flags: state.flags, lists: state.lists };
        try { state.result = await api('POST', '/admin/agents/bulk', payload); } catch (e) { state.error = e.message; }
        state.step = 4; render(); return;
      }
      closeYes();
    };
    $('#mNo').onclick = () => {
      if (state.step === 1) { closeNo(); return; }
      if (state.step === 4) { closeNo(); return; }
      state.step--; render();
    };
    render();
    return promise.then(async () => {
      try { const r = await api('GET', '/admin/agents'); D.agents = r.agents || []; } catch (e) { toast(e.message, 1); }
      renderAgents();
    });
  }
  // elenco «tutti» + voci singole (['*'] = tutte, anche future); un sotto-agente mai oltre chi lo crea
  const listBox = (attr, cur, items, top, empty) => {
    cur = Array.isArray(cur) ? cur : ['*']; const all = cur.includes('*'), topAll = !Array.isArray(top) || top.includes('*');
    const okTop = (k) => topAll || top.some((x) => String(x).toLowerCase() === String(k).toLowerCase());
    return (topAll ? chk(attr, '*', '<b>Tutti</b>', all, false, 'Anche quelli che aggiungerai in futuro') : '') + (items.length ? items.filter(([k]) => okTop(k)).map(([k, l]) => chk(attr, k, esc(l), all ? !topAll : cur.some((x) => String(x).toLowerCase() === String(k).toLowerCase()), false, '')).join('') : `<p class="mut" style="font-size:12.5px">${empty}</p>`);
  };
  const armF = (n) => (Math.round((+n || 0) * 100) / 100).toLocaleString('it-IT');
  const listRead = (box, attr) => { const st = $(`#${box} [data-${attr}="*"]`); return st && st.checked ? ['*'] : $$(`#${box} [data-${attr}]`).filter((i) => i.checked && i.dataset[attr] !== '*').map((i) => i.dataset[attr]); };
  /* modulo di un sotto-agente aperto da un agente (anche in assistenza): si vede solo quello che il titolare ha dato a
     chi lo crea. Permessi, pagine, voci della Sezione App, pannelli e add-on che lui non ha non si vedono più (prima
     restavano grigi e sembravano assegnabili). Sono solo nascosti: il salvataggio legge gli stessi valori di prima
     (elenchi app e DNS di un sub già creato restano com'erano). Il server li toglie comunque: agentPermsWithin. */
  function onlyMine(root, topP) {
    if (!root || !topP) return;
    const hide = (el) => { if (el) el.style.setProperty('display', 'none', 'important'); };
    const shown = (el) => !!el && el.style.display !== 'none';
    const off = (box) => { const i = box.querySelector('input[data-perm]'); return !!(i && i.disabled); }; // il permesso principale della sezione: lui non ce l'ha
    $$('.ag-arm', root).forEach((s) => { if (off(s)) hide(s); }); // pannelli: Armada, Storm, Realott, SLT, Atlantix, WOLF, MaxPlayer, OrbixPlay
    $$('.ag-ap', root).forEach((s) => { if (off(s)) hide(s); }); // Sezione App: Attiva app, App MirkoTeam, OrbixPlay e MaxPlayer, Codici
    $$('label.dis', root).forEach(hide); // singole caselle: permessi, pagine, prove, server MirkoTeam, add-on…
    const aa = $('#agActApps', root); if (aa && !$$('label', aa).some(shown)) hide(aa.closest('.ag-ap')); // app di «Nuovo cliente»: non ne ha
    // elenchi DNS di OrbixPlay e MaxPlayer: contano solo con «Attivare OrbixPlay e MaxPlayer» o con quei pannelli
    if (!topP.players && !topP.oxp) hide($('.ag-dc.op', root));
    if (!topP.players && !topP.mxp) hide($('.ag-dc.mx', root));
    if (!topP.players) hide($('.ag-dn', root));
    const dg = $('.ag-dg', root), n = dg ? $$('.ag-dc', dg).filter(shown).length : 3;
    if (dg && n < 3) { dg.dataset.n = n; const sm = $('.ag-dns > small', root); if (sm) sm.textContent = (n === 2 ? 'Due elenchi separati, uno per ogni uso. ' : '') + 'L\'agente vede solo i nomi che scegli qui, mai gli indirizzi, e non può aggiungerne o cambiarli.'; }
    [['#agPm', 'Non hai permessi da dare.'], ['#agPg', 'Non hai pagine da dare.']].forEach(([id, t]) => { const b = $(id, root); if (b && !$$('label', b).some(shown)) b.insertAdjacentHTML('beforeend', `<p class="mut" style="font-size:12.5px;margin:6px 0">${t}</p>`); });
    const ad = $('#agAd', root); if (ad && !$$('label', ad).some(shown)) hide(ad.closest('.ag-c')); // add-on da dare: nessuno
    const apps = $('.ag-apps', root); if (apps && !$$('.ag-ap', apps).some(shown)) hide(apps);
  }
  async function openAgent(a) {
    const isNew = !a, sub = isAgent(), top = sub ? me() : null;
    let servers = [];
    try { servers = sub ? D.servers : ((await api('GET', '/admin/dns')).saved || []); } catch (e) { servers = []; }
    const adCat = (sub ? D.addonCat || [] : addonCatNow()).filter((x) => x.mode === 'some');
    const nh = (h) => String(h || '').replace(/^https?:\/\//, '');
    const orbItems = (sub ? (((D.players || {}).dns || {}).orbix || []) : (((D.settings || {}).playersCfg || {}).orbix || [])).filter((x) => x && x.name).map((x) => [x.name, x.name + (!sub && x.host ? ' — ' + nh(x.host) : '')]);
    let mxItems = [], mxErr = '';
    if (D.players && D.players.max) { try { mxItems = ((await api('GET', '/admin/maxplayer/domains')).domains || []).map((x) => [x.id, (x.label || 'DNS ' + x.id) + (!sub && x.domain ? ' — ' + x.domain + (x.port && !['80', '443'].includes(String(x.port)) ? ':' + x.port : '') : '')]); } catch (e) { mxErr = 'DNS di MaxPlayer non disponibili: ' + e.message; } }
    const P = a ? a.perms : { create: true, renew: true, disable: true, kick: true, playlists: true, delete: false, clientPerms: false, vpn: false, addons: [], maxConn: 1 };
    const parentById = new Map((D.agents || []).map((x) => [x.id, x]));
    const canManageAgents = (x) => { for (let p = x; p; p = parentById.get(p.parentId)) if (!p.canAgents) return false; return !!x; };
    const descendants = new Set();
    if (a) { let changed = true; while (changed) { changed = false; for (const x of D.agents || []) if (!descendants.has(x.id) && (x.parentId === a.id || descendants.has(x.parentId))) { descendants.add(x.id); changed = true; } } }
    const parentOptions = (selected, exclude = 0) => '<option value="0"' + (!selected ? ' selected' : '') + '>Io (Master)</option>' + (D.agents || []).filter((x) => x.id !== exclude && (x.id === selected || !descendants.has(x.id)) && canManageAgents(x)).map((x) => `<option value="${x.id}"${x.id === selected ? ' selected' : ''}>${esc(x.username)}</option>`).join('');
    let ledgerPanelsValue = Array.isArray(P.ledgerPanels) ? [...P.ledgerPanels] : null;
    const topP = top ? top.perms || {} : null;
    const orcpKeys = ['portal', 'portal2', 'portal3', 'portal4', 'portal5'];
    let orcpItems = [];
    try {
      const r = sub ? (topP && topP.orcpApp ? await api('GET', '/admin/agent/orcp') : null) : await api('GET', '/admin/orcp/cfg');
      if (sub) orcpItems = (r && r.servers || []).map((x) => ({ k: orcpKeys[x.n - 1], n: x.n, name: x.name }));
      else orcpItems = (r && r.cfg && r.cfg.portalNames || []).map((x, i) => ({ ...x, n: orcpKeys.indexOf(x.k) + 1 || i + 1, name: x.name || `Server ${i + 1}` }));
    } catch {}
    let wolfAcc = null, wolfErr = '', mxAccs = [], mxMap = null, atxMasterConnected = false, atxSubs = [];
    const extAcc = { ro: null, slt: null, atx: null };
    if (!sub) { try { mxAccs = (await api('GET', '/admin/mxp/accounts')).accounts || []; if (a) mxMap = ((await api('GET', '/admin/mxp/agents')).agents || []).find((x) => x.id === a.id) || null; } catch (e) { mxAccs = []; } }
    if (!sub && a) { try { wolfAcc = ((await api('GET', '/admin/wolf/agents')).agents || []).find((x) => x.id === a.id) || null; } catch (e) { wolfErr = ''; } }
    if (!sub) {
      try {
        atxMasterConnected = !!(await api('GET', '/admin/atx/state')).connected;
        if (atxMasterConnected) {
          const d = await api('GET', '/admin/atx/subs');
          atxSubs = Array.isArray(d) ? d : ['rows', 'items', 'subresellers', 'resellers', 'list', 'data'].map((k) => d && d[k]).find(Array.isArray) || [];
        }
      } catch {}
    }
    if (!sub && a) {
      for (const k of ['ro', 'slt']) { try { extAcc[k] = ((await api('GET', `/admin/${k}/agents`)).agents || []).find((x) => x.id === a.id) || null; } catch {} }
      try { extAcc.atx = ((await api('GET', '/admin/atx/agents')).agents || []).find((x) => x.id === a.id) || null; } catch {}
    }
    $('#agT').innerHTML = isNew ? (sub ? 'Nuovo sotto-agente' : 'Nuovo agente') : `${esc(a.username)} <span class="chip ${a.active ? 'g' : 'r'}" style="vertical-align:3px">${a.active ? 'Attivato' : 'Disattivato'}</span>`;
    $('#agB').innerHTML = `<div class="ag-g">
      <div class="ag-c"><h4>Account</h4><small>Le credenziali con cui l'agente entra in questo pannello</small>
        <label class="lbl">Nome utente</label><input class="inp" id="agU" maxlength="40" value="${esc(a ? a.username : '')}" ${a ? 'readonly' : ''} placeholder="es. mario.rossi" autocomplete="off">
        <label class="lbl">Email (facoltativa)</label><input class="inp" id="agE" maxlength="120" value="${esc(a ? a.email : '')}" placeholder="mario@esempio.it" autocomplete="off">
        ${a && a.password ? `<label class="lbl">Password attuale</label><div class="row" style="grid-template-columns:1fr auto auto"><input class="inp mono" id="agPwNow" type="password" value="${esc(a.password)}" readonly><button class="btn" id="agPwEye" title="Mostra / nascondi">👁</button><button class="btn" id="agPwCp" title="Copia">Copia</button></div>` : ''}
        <label class="lbl">${isNew ? 'Password' : 'Nuova password'}</label><input class="inp" id="agP" type="password" autocomplete="new-password" placeholder="${isNew ? 'almeno 10 caratteri' : 'lascia vuoto per non cambiarla'}">
        <label class="lbl">Note (le vedi solo tu)</label><textarea class="inp" id="agN" maxlength="300" placeholder="Contatto, accordi, pagamenti…">${esc(a ? a.notes : '')}</textarea>
        <div class="tog ${!a || a.active ? 'on' : ''}" id="agA" style="margin-top:14px"><div><b>Account attivo</b><small>Se lo disattivi esce subito dal pannello, insieme ai suoi sotto-agenti. I clienti continuano a funzionare.</small></div><i></i></div>
      </div>
      ${!sub && isNew ? `<div class="ag-c"><h4>Sotto chi</h4><small>Decidi quale agente gestirà questo nuovo agente</small><select class="inp" id="agParentSel">${parentOptions(0)}</select></div>` : ''}
      ${!sub && a ? `<div class="ag-c"><h4>👥 Sposta sotto…</h4><small>Il nuovo responsabile vedrà l'agente e i suoi clienti</small><select class="inp" id="agMoveParent">${parentOptions(a.parentId || 0, a.id)}</select><button type="button" class="btn" id="agMoveBtn" style="margin-top:10px">Sposta agente</button></div>` : ''}
      <div class="ag-c"><h4>Limiti e accesso</h4><small>Quanti clienti può avere e cosa vede</small>
        <div class="row"><div><label class="lbl">Clienti massimi</label><input class="inp" id="agM" type="number" min="0" max="${top ? top.maxClients : 100000}" value="${a ? a.maxClients : Math.min(10, top ? top.maxClients : 10)}"></div>
        <div><label class="lbl">Connessioni per cliente</label><input class="inp" id="agC" type="number" min="1" max="${topP ? topP.maxConn : 10}" value="${P.maxConn || 1}"></div></div>
        ${a ? `<p class="mut" style="font-size:12.5px;margin-top:8px">Clienti ora: <b>${a.clients}</b>${a.subAgents ? ` (di cui ${a.clients - a.ownClients} dei suoi ${a.subAgents} sotto-agenti)` : ''}</p>` : ''}
        ${a && !top ? `<label class="lbl" style="margin-top:10px">Link di accesso personale</label><button type="button" class="btn" id="agLink" style="width:100%">🔗 Link e codice di accesso</button><small class="mut" style="display:block;margin-top:4px">Apre il pannello solo con il suo account, senza utente e password</small>` : ''}
        <label class="lbl">Accesso</label><div class="ag-radio" id="agR">
          <label class="${a && a.canAgents ? '' : 'on'}"><input type="radio" name="agr" value="0" ${a && a.canAgents ? '' : 'checked'}><b>Solo clienti</b><small>Gestisce solo i suoi clienti</small></label>
          <label class="${a && a.canAgents ? 'on' : ''}"><input type="radio" name="agr" value="1" ${a && a.canAgents ? 'checked' : ''}><b>Gestisce agenti</b><small>Può creare sotto-agenti, mai con più permessi dei suoi</small></label></div>
      </div>
      <div class="ag-c ag-dns" style="grid-column:1/-1"><h4>🌐 DNS e server dell'agente</h4><small>Tre elenchi separati, uno per ogni uso. L'agente vede solo i nomi che scegli qui, mai gli indirizzi, e non può aggiungerne o cambiarli.</small>
        <div class="ag-dg">
          <div class="ag-dc srv"><div class="ag-dh"><span class="ag-dt">LINEE</span><div><b>Server delle linee IPTV</b><small>Quando crea o cambia la linea di un cliente sceglie uno di questi server e scrive utente e password</small></div></div>
            <div class="ag-chk" id="agS">${servers.length ? servers.map((s) => chk('srv', s.id, `<b>${esc(s.name)}</b>`, a ? (a.servers || []).includes(s.id) : false, false, sub ? '' : esc(s.host.replace(/^https?:\/\//, '')))).join('') : `<p class="mut" style="font-size:12.5px">${sub ? 'Non hai server assegnati.' : 'Nessun server salvato: aggiungili in Linee e DNS → DNS e server.'}</p>`}</div></div>
          <div class="ag-dc op"><div class="ag-dh"><span class="ag-dt">OP</span><div><b>DNS di OrbixPlay</b><small>Per attivare OrbixPlay ai suoi clienti e per «Crea lista». Vede anche solo i codici cliente di questi fornitori</small></div></div>
            <div class="ag-chk" id="agOd">${listBox('odns', P.orbDns, orbItems, topP && topP.orbDns, sub ? 'Non hai DNS di OrbixPlay.' : 'Nessun DNS di OrbixPlay: lo aggiungi in App e link → OrbixPlay e MaxPlayer.')}</div></div>
          <div class="ag-dc mx"><div class="ag-dh"><span class="ag-dt">MX</span><div><b>DNS di MaxPlayer</b><small>Per attivare MaxPlayer ai suoi clienti e per «Crea lista». Vede anche solo i codici cliente di questi fornitori</small></div></div>
            <div class="ag-chk" id="agMd">${listBox('mdns', P.mxDns, mxItems, topP && topP.mxDns, mxErr || (sub ? 'Non hai DNS di MaxPlayer.' : 'Nessun DNS su MaxPlayer: lo aggiungi in App e link → OrbixPlay e MaxPlayer.'))}</div></div>
        </div>
        <p class="ag-dn">I DNS di OrbixPlay e MaxPlayer contano solo se gli concedi «Attivare OrbixPlay e MaxPlayer dal pannello» (sezione App qui sotto).</p>
      </div>
      <div class="ag-c"><h4>Permessi</h4><small>Cosa può fare con i suoi clienti${sub ? ' (solo tra quelli che hai anche tu)' : ''}</small>
        <div class="ag-chk" id="agPm">${FL.filter(([k]) => !APP_KEYS.includes(k)).map(([k, l, sm]) => chk('perm', k, l, !!P[k], topP && !topP[k], sm)).join('')}</div>
      </div>
      <div class="ag-c"><h4>Pagine del pannello</h4><small>Cosa vede nel suo pannello: sempre e solo i dati dei suoi clienti. Impostazioni, Server DNS, API, la manutenzione generale e le impostazioni dell'assistente restano solo tue (valgono per tutti i clienti). I tuoi clienti e quelli degli altri agenti non li vede mai.</small>
      <div class="ag-chk" id="agPg">${FP.filter(([k]) => !APP_KEYS.includes(k) && k !== 'store' && k !== 'orcpApp').map(([k, l, sm]) => chk('perm', k, l, !!P[k], topP && !topP[k], sm)).join('')}</div>
      </div>
      <div class="ag-c" style="display:none"><h4>App dello store che può approvare</h4><small>Le richieste degli store attivati con il suo codice gli arrivano sempre, con l'avviso nel pannello. Qui scegli le app che può approvare: per le altre l'avviso arriva a te.</small>
        <div class="ag-chk" id="agSa" style="max-height:300px;overflow:auto">${storeAppsBox(P, topP)}</div>
        <div style="display:flex;gap:8px;margin-top:10px"><input class="inp" id="agSaN" maxlength="80" placeholder="Aggiungi un'app (nome come nello store)" style="margin:0;flex:1"><button class="btn sm" id="agSaAdd">Aggiungi</button></div>
      </div>
      <div class="ag-c ag-apps" style="grid-column:1/-1"><h4>📱 Sezione App</h4><small>Decidi tu voce per voce cosa vede e cosa può fare nella sezione «App» del suo pannello. Link, DNS e chiavi restano tuoi: lui non li modifica mai.</small>
        <div class="ag-apg">
          <div class="ag-ap"><div class="ag-chk">${chk('perm', 'appstore', '<b>Attiva app</b>', !!P.appstore, topP && !topP.appstore, 'Le app con cui carica le liste (solo quelle scelte qui sotto)')}</div>
            <div class="ag-chk ag-sub" id="agAa" style="max-height:220px;overflow:auto">${appsAllowBox(P)}</div></div>
          <div class="ag-ap"><div class="ag-chk">${chk('perm', 'orcpApp', '<b>App MirkoTeam: scaricarla e scegliere il server</b>', !!P.orcpApp, topP && !topP.orcpApp, 'Solo il codice Downloader e i server qui assegnati')}</div>
            <div class="ag-chk" id="agOrcpSrv">${orcpItems.length ? orcpItems.map((x) => chk('orcp-srv', x.k, `<b>Server ${x.n} · ${esc(x.name)}</b>`, (P.orcpSrv || []).includes(x.k), sub && !(topP.orcpSrv || []).includes(x.k), '')).join('') : '<small class="mut">Assegna prima i server MirkoTeam al tuo agente.</small>'}<label style="display:block;margin-top:6px"><input type="checkbox" data-orcp-all> Tutti</label></div></div>
          <div class="ag-ap"><div class="ag-chk"><b style="display:block;margin-bottom:6px">App da attivare in Nuovo cliente</b><small class="mut">Solo le app accese dal Master e concesse anche a questo agente.</small></div>
            <div class="ag-chk ag-sub" id="agActApps" style="max-height:220px;overflow:auto">${actAppsBox(P, topP)}</div></div>
          <div class="ag-ap"><div class="ag-chk">${chk('perm', 'players', '<b>Attivare OrbixPlay e MaxPlayer dal pannello</b>', !!P.players, topP && !topP.players, 'Manda le linee dei suoi clienti con le tue chiavi (che non vede)')}${chk('perm', 'appsOp', '<b>Pagina «OrbixPlay e MaxPlayer»</b>', !!P.appsOp, topP && !topP.appsOp, 'Codici cliente e liste create dei suoi clienti (senza DNS né impostazioni)')}</div>
            <p class="ag-dn" style="margin:8px 0 0 18px">Quali DNS può usare lo scegli in alto, in «DNS e server dell'agente».</p></div>
          <div class="ag-ap"><div class="ag-chk">${chk('perm', 'dlcodes', '<b>Codici downloader</b>', !!P.dlcodes, topP && !topP.dlcodes, 'Solo quelli scelti qui sotto, da copiare')}</div>
            <div class="ag-chk ag-sub" id="agDc" style="max-height:220px;overflow:auto">${listBox('dlca', P.dlcAllow, dlcNames(), topP && topP.dlcAllow, 'Nessun codice: li aggiungi in App → Codici downloader.')}</div></div>
          <div class="ag-ap"><div class="ag-chk"><b style="display:block;margin-bottom:4px">Pagina «App Kairos»</b><small class="mut">Ogni agente la vede: indirizzo per Downloader (senza il tuo nome) e codice Downloader delle app scelte qui sotto. Togli le app che non deve vedere.</small></div>
            <div class="ag-chk ag-sub" id="agKa">${listBox('kapp', P.kAllow, KAPPS, topP && topP.kAllow, '')}</div>
            <small class="mut" style="display:block;margin-top:6px">Le app Kairos scelte compaiono anche in alto con il loro codice Downloader.</small></div>
        </div>
      </div>
      <div class="ag-c ag-arm" id="agAr" style="grid-column:1/-1"><h4>🛰️ Pannello Armada</h4><small>Spento di base. Se lo accendi l'agente crea e rinnova linee e MAG su Armada <b>con i tuoi crediti</b>, fino al tetto che decidi qui. Vede e gestisce solo le linee create da lui (e dai suoi sotto-agenti); non vede il tuo saldo né i sotto-reseller. Ogni operazione resta nel registro attività.</small>
        <div class="ag-armg">
          <div class="ag-chk">${chk('perm', 'armada', '<b>Può usare il pannello Armada</b>', !!P.armada, topP && !topP.armada, 'Crea, rinnova, attiva e disattiva le sue linee')}${chk('perm', 'armadaTrial', '<b>Può creare prove gratuite</b>', !!P.armadaTrial, topP && !topP.armadaTrial, 'Al massimo 10 al giorno')}</div>
          <div><label class="lbl" style="margin-top:0">Crediti al mese (tuoi)</label><input class="inp" id="agArC" type="number" min="0" step="0.5" max="${topP ? topP.armadaCredits || 0 : 100000}" value="${+P.armadaCredits || 0}" ${topP && !topP.armada ? 'disabled' : ''}>
            <small class="mut" style="display:block;margin-top:6px">0 = nessun credito (solo prove, se concesse). Vale per lui e per i suoi sotto-agenti${topP ? `; tu ne hai ${armF(topP.armadaCredits || 0)} al mese` : ''}.</small>
            ${a ? `<p class="ag-armu">Usati questo mese: <b>${armF(a.armadaUsed || 0)}</b>${+P.armadaCredits ? ` su ${armF(P.armadaCredits)}` : ''}</p>` : ''}</div>
        </div>
      </div>
      <div class="ag-c ag-arm" id="agSt" style="grid-column:1/-1"><h4>⛈️ Pannello Storm</h4><small>Spento di base. Se lo accendi l'agente crea e rinnova linee e MAG su Storm <b>con i tuoi crediti</b>, fino al tetto che decidi qui. Vede e gestisce solo le linee create da lui (e dai suoi sotto-agenti); non vede il tuo saldo né i sotto-reseller. Ogni operazione resta nel registro attività.</small>
        <div class="ag-armg">
          <div class="ag-chk">${chk('perm', 'storm', '<b>Può usare il pannello Storm</b>', !!P.storm, topP && !topP.storm, 'Crea, rinnova, attiva e disattiva le sue linee')}${chk('perm', 'stormTrial', '<b>Può creare prove gratuite</b>', !!P.stormTrial, topP && !topP.stormTrial, 'Al massimo 10 al giorno')}</div>
          <div><label class="lbl" style="margin-top:0">Crediti al mese (tuoi)</label><input class="inp" id="agStC" type="number" min="0" step="0.5" max="${topP ? topP.stormCredits || 0 : 100000}" value="${+P.stormCredits || 0}" ${topP && !topP.storm ? 'disabled' : ''}>
            <small class="mut" style="display:block;margin-top:6px">0 = nessun credito (solo prove, se concesse). Vale per lui e per i suoi sotto-agenti${topP ? `; tu ne hai ${armF(topP.stormCredits || 0)} al mese` : ''}.</small>
            ${a ? `<p class="ag-armu">Usati questo mese: <b>${armF(a.stormUsed || 0)}</b>${+P.stormCredits ? ` su ${armF(P.stormCredits)}` : ''}</p>` : ''}</div>
        </div>
      </div>
      ${[['ro', 'Realott', '📡'], ['slt', 'SLT', '📡']].map(([k, n, ic]) => `<div class="ag-c ag-arm" id="agEx_${k}" style="grid-column:1/-1"><h4>${ic} Pannello ${n}</h4><small>Spento di base. Se lo accendi l'agente usa ${n} da KAIROS <b>con il suo account sub-reseller ${n}</b>: vede solo le sue linee e i suoi crediti, crea e rinnova scalando <b>i suoi</b> crediti. Non vede il tuo account né il DNS.</small>
        <div class="ag-armg">
          <div class="ag-chk">${chk('perm', k, `<b>Può usare il pannello ${n}</b>`, !!P[k], topP && !topP[k], `Linee, rinnovi e crediti del suo account ${n}`)}</div>
          ${sub ? `<p class="mut" style="font-size:12.5px;margin:0">Utente e password ${n} li inserisce lui nella sua sezione «Pannello ${n}».</p>` : `<div><div class="row"><div><label class="lbl" style="margin-top:0">Utente ${n} dell'agente</label><input class="inp mono" id="agExU_${k}" maxlength="120" value="${esc(extAcc[k] ? extAcc[k].user : '')}" autocomplete="off" placeholder="come su ${n}"></div>
            <div><label class="lbl" style="margin-top:0">Password ${n}</label><input class="inp mono" id="agExP_${k}" type="password" maxlength="200" autocomplete="new-password" placeholder="${extAcc[k] ? 'lascia vuoto per non cambiarla' : ''}"></div></div>
            <small class="mut" style="display:block;margin-top:6px">${extAcc[k] ? 'Account collegato. Svuota l\'utente per scollegarlo.' : `Facoltativo: se lo lasci vuoto l'agente lo inserisce da solo. KAIROS controlla che ${n} lo accetti.`}</small></div>`}
        </div></div>`).join('')}
      <div class="ag-c ag-arm" id="agEx_atx" style="grid-column:1/-1"><h4>🛰️ Pannello Atlantix</h4><small>Spento di base. Se lo accendi l'agente usa Atlantix da KAIROS <b>con il suo account sottovenditore e i suoi crediti</b>: vede solo le sue linee e crea o rinnova scalando <b>i suoi</b> crediti. Non vede il tuo account, DNS o indirizzi dei pannelli.</small>
        <div class="ag-armg">
          <div class="ag-chk">${chk('perm', 'atx', '<b>Può usare il pannello Atlantix</b>', !!P.atx, topP && !topP.atx, 'Linee, rinnovi e crediti del suo account Atlantix')}</div>
          ${sub ? '<p class="mut" style="font-size:12.5px;margin:0">Utente, password e codice di accesso Atlantix li inserisce lui nella sua sezione «Pannello Atlantix».</p>' : `<div>
            ${atxMasterConnected && atxSubs.length ? `<label class="lbl" style="margin-top:0">Scegli tra i tuoi sottovenditori<select class="inp" id="agExSel_atx"><option value="">— scegli un sottovenditore —</option>${atxSubs.map((x) => `<option value="${esc(String(x.id || ''))}">${esc(x.username || x.user || x.name || '')}</option>`).join('')}</select></label>` : ''}
            <div class="row"><div><label class="lbl" style="margin-top:0">Utente Atlantix dell'agente</label><input class="inp mono" id="agExU_atx" maxlength="80" value="${esc(extAcc.atx ? extAcc.atx.user : '')}" autocomplete="off" placeholder="come su Atlantix"></div>
              <div><label class="lbl" style="margin-top:0">Password Atlantix</label><input class="inp mono" id="agExP_atx" type="password" maxlength="200" autocomplete="new-password" placeholder="${extAcc.atx ? 'lascia vuoto per non cambiarla' : ''}"></div>
              <div><label class="lbl" style="margin-top:0">Codice di accesso Atlantix</label><input class="inp mono" id="agExC_atx" type="password" maxlength="80" autocomplete="new-password" placeholder="${extAcc.atx ? 'lascia vuoto per non cambiarlo' : ''}"></div></div>
            <small class="mut" style="display:block;margin-top:6px">${extAcc.atx ? 'Account collegato. Svuota l\'utente per scollegarlo.' : 'Facoltativo: se lo lasci vuoto l\'agente lo inserisce da solo. Il codice di accesso è richiesto da Atlantix.'}</small></div>`}
        </div>
      </div>
      <div class="ag-c ag-arm" id="agWf" style="grid-column:1/-1"><h4>🐺 Pannello WOLF</h4><small>Spento di base. Se lo accendi l'agente usa il pannello WOLF da KAIROS <b>con il suo account reseller WOLF</b>: vede le sue linee e i suoi sotto-reseller e crea o rinnova scalando <b>i suoi</b> crediti, come su WOLF. Non vede il tuo account. Ogni operazione resta nel registro attività.</small>
        <div class="ag-armg">
          <div class="ag-chk">${chk('perm', 'wolf', '<b>Può usare il pannello WOLF</b>', !!P.wolf, topP && !topP.wolf, 'Linee, rinnovi e sotto-reseller del suo account WOLF')}</div>
          ${sub ? '<p class="mut" style="font-size:12.5px;margin:0">Utente e password WOLF li inserisce lui nella sua sezione «Pannello WOLF».</p>' : `<div><div class="row"><div><label class="lbl" style="margin-top:0">Utente WOLF dell'agente</label><input class="inp mono" id="agWfU" maxlength="120" value="${esc(wolfAcc ? wolfAcc.user : '')}" autocomplete="off" placeholder="come su WOLF"></div>
            <div><label class="lbl" style="margin-top:0">Password WOLF</label><input class="inp mono" id="agWfP" type="password" maxlength="200" autocomplete="new-password" placeholder="${wolfAcc ? 'lascia vuoto per non cambiarla' : ''}"></div></div>
            <small class="mut" style="display:block;margin-top:6px">${wolfErr ? esc(wolfErr) : wolfAcc ? 'Account collegato. Svuota l\'utente per scollegarlo.' : 'Facoltativo: se lo lasci vuoto l\'agente lo inserisce da solo. KAIROS controlla che WOLF lo accetti; resta cifrato.'}</small></div>`}
        </div>
      </div>
      <div class="ag-c ag-arm" id="agMx" style="grid-column:1/-1"><h4>📺 Pannello MaxPlayer</h4><small>Spento di base. Se lo accendi l'agente usa il Pannello MaxPlayer da KAIROS con la tua chiave, ma vede e gestisce <b>solo i clienti dell'agente MaxPlayer</b> che scegli qui (e i suoi posti). Non vede gli altri clienti né le tue impostazioni.</small>
        <div class="ag-armg">
          <div class="ag-chk">${chk('perm', 'mxp', '<b>Può usare il Pannello MaxPlayer</b>', !!P.mxp, topP && !topP.mxp, 'Clienti, liste e sotto-agenti del suo agente MaxPlayer')}</div>
          ${sub ? '<p class="mut" style="font-size:12.5px;margin:0">L\'agente MaxPlayer lo sceglie il titolare.</p>' : `<div><div class="row"><div><label class="lbl" style="margin-top:0">Account MaxPlayer</label><select class="inp" id="agMxA"><option value="">— nessuno —</option>${mxAccs.map((x) => `<option value="${esc(x.id)}"${mxMap && mxMap.acc === x.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
            <div><label class="lbl" style="margin-top:0">Agente MaxPlayer</label><select class="inp" id="agMxG"><option value="">— nessuno —</option>${mxMap ? `<option value="${esc(mxMap.mx)}" selected>${esc(mxMap.name || 'ID ' + mxMap.mx)}</option>` : ''}</select></div></div>
            <small class="mut" style="display:block;margin-top:6px" id="agMxS">${mxAccs.length ? 'Scegli l\'account e poi il suo agente MaxPlayer.' : 'Collega prima un account in Linee e DNS → Pannello MaxPlayer.'}</small></div>`}
        </div>
      </div>
      <div class="ag-c ag-arm" id="agOx" style="grid-column:1/-1"><h4>🟣 Pannello OrbixPlay</h4><small>Spento di base. Se lo accendi l'agente vede nel Pannello OrbixPlay <b>solo le playlist dei dispositivi dei suoi clienti</b> e delle liste create da lui (e dai suoi sotto-agenti), con la tua chiave. Può modificarle ed eliminarle; non vede le altre né i tuoi posti.</small>
        <div class="ag-chk">${chk('perm', 'oxp', '<b>Può usare il Pannello OrbixPlay</b>', !!P.oxp, topP && !topP.oxp, 'Playlist OrbixPlay dei suoi clienti')}${chk('perm', 'oxpNew', '<b>Può creare playlist</b>', !!P.oxpNew, topP && !topP.oxpNew, 'Su qualsiasi dispositivo OrbixPlay: usa i tuoi posti')}</div>
      </div>
      <div class="ag-c"><h4>Add-on che può assegnare</h4><small>Tra quelli che in Impostazioni → Store add-on sono «solo a chi assegno»</small>
        <div class="ag-chk" id="agAd" style="max-height:300px;overflow:auto">${adCat.length ? adCat.map((x) => chk('ad', x.id, esc(x.name), (P.addons || []).includes(x.id), topP && !(topP.addons || []).includes(x.id), x.price ? esc(x.price) : '')).join('') : '<p class="mut">Nessun add-on da assegnare.</p>'}</div>
      </div>
      ${a ? `<div class="ag-c"><h4>Sicurezza</h4><small>Verifica in due passaggi: facoltativa, la attiva l'agente dal suo pannello (Sicurezza)</small>
        <div class="sec"><i class="${a.totp ? 'y' : 'n'}">${a.totp ? '✓' : '!'}</i><div><b>${a.totp ? 'Attiva' : 'Non attiva'}</b><small>${a.totp ? 'Se l\'agente perde il telefono puoi azzerarla: entrerà solo con la password.' : 'L\'agente entra con nome utente e password.'}</small></div></div>
        ${a.totp ? '<button class="btn sm" id="agTz" style="margin-top:10px">Azzera verifica in due passaggi</button>' : ''}
        <p class="mut" style="font-size:12px;margin-top:12px">Creato ${esc(fmtD(a.createdAt))} · ultima attività ${esc(a.lastSeen ? ago(a.lastSeen) : 'mai')}</p></div>` : ''}
    </div>`;
    $('#agFt').innerHTML = `${a ? '<button class="btn danger" id="agDel">Elimina agente</button>' : ''}${a && a.active && !sub ? '<button class="btn" id="agAssist" title="Entra nel pannello di questo agente per fargli assistenza">🛟 Entra per assistenza</button>' : ''}<div style="flex:1"></div><button class="btn" id="agNo">Annulla</button><button class="btn pri" id="agOk">${isNew ? 'Crea agente' : 'Salva modifiche'}</button>`;
    $('#agAssist') && ($('#agAssist').onclick = () => { if (D.demo) { toast('In demo l\'assistenza non è disponibile', 1); return; } KXAssist.enter(a.id, a.username); });
    $('#agA').onclick = () => $('#agA').classList.toggle('on');
    const mxLoad = async () => {
      const sel = $('#agMxA'), g = $('#agMxG'); if (!sel || !g) return;
      const acc = sel.value, keep = g.value; if (!acc) { g.innerHTML = '<option value="">— nessuno —</option>'; return; }
      $('#agMxS').textContent = 'Carico gli agenti MaxPlayer…';
      try { const L = (await api('GET', `/admin/mxp/a/${acc}/agents`)).agents || []; g.innerHTML = '<option value="">— nessuno —</option>' + L.map((x) => `<option value="${esc(x.id)}"${x.id === keep ? ' selected' : ''}>${esc(x.name || x.username)} · ${esc(x.username)} (${x.users} clienti)</option>`).join(''); $('#agMxS').textContent = `${L.length} agenti MaxPlayer su questo account.`; }
      catch (e) { $('#agMxS').textContent = e.message; }
    };
    if ($('#agMxA')) { $('#agMxA').onchange = mxLoad; if ($('#agMxA').value) mxLoad(); }
    // elenchi con «Tutti»: quello che vedi spuntato è quello che vede l'agente.
    // «Tutti» acceso copre le voci (non spuntate, in grigio); scegliere una voce spegne «Tutti» e restano solo quelle spuntate
    const SYNC = {};
    for (const [bx, at, f] of [['agS', 'srv', 0], ['agSa', 'sapp', 1], ['agAa', 'aapp', 1], ['agDc', 'dlca', 0], ['agKa', 'kapp', 1], ['agOd', 'odns', 0], ['agMd', 'mdns', 0]]) {
      const el = $('#' + bx); if (!el) continue;
      const star = () => $(`#${bx} [data-${at}="*"]`), items = () => $$(`#${bx} [data-${at}]`).filter((i) => i.dataset[at] !== '*');
      const paint = () => {
        const st = star(), on = !!(st && st.checked), its = items(), n = its.filter((i) => i.checked).length;
        its.forEach((i) => { i.closest('label').style.opacity = on ? '.45' : ''; });
        let c = el.nextElementSibling; if (!c || !c.classList.contains('ag-cnt')) { c = document.createElement('small'); c.className = 'ag-cnt'; el.after(c); } // fuori dall'elenco (che può scorrere): sempre visibile
        c.textContent = !its.length && !on ? '' : on ? (f ? 'Le vede tutte, anche quelle che aggiungerai' : 'Li vede tutti, anche quelli che aggiungerai') : n ? `Ne vede ${n} su ${its.length}` : (f ? 'Non ne vede nessuna' : 'Non ne vede nessuno');
        c.classList.toggle('no', !on && !n && !!its.length);
      };
      el.onchange = (e) => {
        const t = e.target; if (!t || !t.matches || !t.matches(`[data-${at}]`)) return;
        const st = star();
        if (t.dataset[at] === '*') { if (t.checked) items().forEach((i) => (i.checked = false)); }
        else if (t.checked && st && st.checked) st.checked = false;
        paint();
      };
      paint(); SYNC[bx] = paint;
    }
    const saSync = () => SYNC.agSa && SYNC.agSa();
    const orcpAll = $('#agOrcpSrv [data-orcp-all]');
    if (orcpAll) orcpAll.onchange = () => $$('#agOrcpSrv [data-orcp-srv]').forEach((x) => { x.checked = orcpAll.checked; });
    $('#agSaAdd').onclick = () => { const n = $('#agSaN').value.trim(); if (!n) return; if (!$$('#agSa [data-sapp]').some((i) => i.dataset.sapp.toLowerCase() === n.toLowerCase())) $('#agSa').insertAdjacentHTML('beforeend', chk('sapp', n, esc(n), true, false, '')); else $$('#agSa [data-sapp]').forEach((i) => { if (i.dataset.sapp.toLowerCase() === n.toLowerCase()) i.checked = true; }); const all = $('#agSa [data-sapp="*"]'); if (all) all.checked = false; $('#agSaN').value = ''; saSync(); };
    if (!sub && a) {
      const renderLedgerPanelChips = () => {
        const selected = new Set(ledgerPanelsValue === null ? LEDGER_PANEL_OPTIONS.map(([key]) => key) : ledgerPanelsValue);
        return LEDGER_PANEL_OPTIONS.map(([key, label, color]) => {
          const on = selected.has(key);
          return `<button type="button" class="btn sm" data-ledger-panel="${key || 'generic'}" aria-pressed="${on}" style="border:1px solid ${color};color:${on ? color : '#aab4c3'};background:${on ? `${color}22` : 'transparent'}">${label}</button>`;
        }).join('');
      };
      $('#agB').insertAdjacentHTML('beforeend', `<div class="ag-c" id="agLedgerBox" style="margin:0 28px 18px"><h4>💰 Debito</h4><div id="agLedgerSummary" class="mut">Carico il registro…</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0"><button type="button" class="btn sm" data-ledger-add="debt">➕ Aggiungi debito</button><button type="button" class="btn sm pri" data-ledger-add="pay">✅ Registra pagamento</button></div><div style="margin:12px 0"><b style="display:block;margin-bottom:7px">Pannelli dei crediti che vede l'agente</b><div id="agLedgerPanelToggles" style="display:flex;gap:7px;flex-wrap:wrap">${renderLedgerPanelChips()}</div><small id="agLedgerPanelNote" class="mut" style="display:block;margin-top:6px">${ledgerPanelsValue === null ? 'Non ancora scelto: vede tutti i pannelli' : ''}</small></div><div id="agLedgerHistory"></div></div>`);
      $('#agLedgerPanelToggles').onclick = (event) => {
        const button = event.target.closest('[data-ledger-panel]'); if (!button) return;
        if (ledgerPanelsValue === null) ledgerPanelsValue = LEDGER_PANEL_OPTIONS.map(([key]) => key);
        const key = button.dataset.ledgerPanel === 'generic' ? '' : button.dataset.ledgerPanel;
        ledgerPanelsValue = ledgerPanelsValue.includes(key) ? ledgerPanelsValue.filter((x) => x !== key) : [...ledgerPanelsValue, key];
        $('#agLedgerPanelToggles').innerHTML = renderLedgerPanelChips();
        $('#agLedgerPanelNote').textContent = '';
      };
      loadAgentLedger(a);
    }
    $('#agPwEye') && ($('#agPwEye').onclick = () => { const i = $('#agPwNow'); i.type = i.type === 'password' ? 'text' : 'password'; });
    $('#agPwCp') && ($('#agPwCp').onclick = () => navigator.clipboard.writeText(a.password).then(() => toast('Password copiata'), () => toast('Copia non consentita', 1)));
    $('#agScCp') && ($('#agScCp').onclick = () => navigator.clipboard.writeText($('#agSc').value.trim().toUpperCase()).then(() => toast('Codice venditore copiato'), () => toast('Copia non consentita', 1)));
    $('#agLink') && ($('#agLink').onclick = () => linkBox(a));
    $('#agScNew') && ($('#agScNew').onclick = () => { const AL = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let c = ''; for (let i = 0; i < 4; i++) c += AL[Math.floor(Math.random() * AL.length)]; $('#agSc').value = c; $('#agSc').focus(); });
    $('#agSc') && ($('#agSc').oninput = () => { const v = $('#agSc').value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); if ($('#agSc').value !== v) $('#agSc').value = v; });
    $$('#agR label').forEach((l) => (l.onclick = () => { $$('#agR label').forEach((x) => x.classList.toggle('on', x === l)); $('input', l).checked = true; }));
    if (sub && !top.canAgents) $$('#agR input').forEach((i) => (i.disabled = true));
    $('#agNo').onclick = closePage;
    const atxPermInputs = $$('#agPg [data-perm="atx"], #agEx_atx [data-perm="atx"]');
    atxPermInputs.forEach((input) => input.addEventListener('change', () => atxPermInputs.forEach((other) => { other.checked = input.checked; })));
    if ($('#agExSel_atx')) $('#agExSel_atx').onchange = () => {
      const selected = atxSubs.find((x) => String(x.id || '') === $('#agExSel_atx').value);
      if (selected) {
        const atxUser = selected.username || selected.user || selected.name || '';
        $('#agExU_atx').value = atxUser;
        const kairosUser = String(atxUser).replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40);
        if ($('#agU') && !$('#agU').value.trim() && kairosUser.length >= 3) $('#agU').value = kairosUser;
        const permission = $('#agEx_atx [data-perm="atx"]');
        if (permission && !permission.checked) { permission.checked = true; permission.dispatchEvent(new Event('change', { bubbles: true })); }
      }
    };
    const read = () => ({
      email: $('#agE').value.trim(), notes: $('#agN').value, active: $('#agA').classList.contains('on'), maxClients: +$('#agM').value || 0,
      ...($('#agSc') && $('#agSc').value.trim() ? { storeCode: $('#agSc').value.trim().toUpperCase() } : {}),
      ...($('#agSm') ? { storeMax: $('#agSm').value.trim() === '' ? null : +$('#agSm').value } : {}),
      canAgents: $('#agR input:checked') ? $('#agR input:checked').value === '1' : false,
      servers: $$('#agS [data-srv]').filter((i) => i.checked).map((i) => i.dataset.srv),
      perms: { ...Object.fromEntries([...FL, ...FP, ['armadaTrial'], ['stormTrial'], ['oxpNew']].map(([k]) => [k, !!($(`#agPm [data-perm="${k}"], #agPg [data-perm="${k}"], .ag-apps [data-perm="${k}"], #agAr [data-perm="${k}"], #agSt [data-perm="${k}"], #agWf [data-perm="${k}"], #agMx [data-perm="${k}"], #agOx [data-perm="${k}"], #agEx_atx [data-perm="${k}"]`) || {}).checked])), armadaCredits: Math.max(0, +(($('#agArC') || {}).value || 0) || 0), stormCredits: Math.max(0, +(($('#agStC') || {}).value || 0) || 0), dlcAllow: listRead('agDc', 'dlca'), kAllow: listRead('agKa', 'kapp'), orbDns: listRead('agOd', 'odns'), mxDns: listRead('agMd', 'mdns'), maxConn: +$('#agC').value || 1, addons: $$('#agAd [data-ad]').filter((i) => i.checked).map((i) => i.dataset.ad),
        storeApps: $('#agSa [data-sapp="*"]') && $('#agSa [data-sapp="*"]').checked ? ['*'] : $$('#agSa [data-sapp]').filter((i) => i.checked && i.dataset.sapp !== '*').map((i) => i.dataset.sapp),
        actApps: $$('#agActApps [data-actapp]:checked').map((i) => i.dataset.actapp),
        appsAllow: $('#agAa [data-aapp="*"]') && $('#agAa [data-aapp="*"]').checked ? ['*'] : $$('#agAa [data-aapp]').filter((i) => i.checked && i.dataset.aapp !== '*').map((i) => i.dataset.aapp),
        orcpSrv: $$('#agOrcpSrv [data-orcp-srv]:checked').map((i) => i.dataset.orcpSrv),
        ...(!sub && $('#agLedgerBox') ? { ledgerPanels: ledgerPanelsValue === null ? null : [...ledgerPanelsValue] } : {}) },
    });
    $('#agOk').onclick = async () => {
      const b = read(), pw = $('#agP').value;
      if ($('#agParentSel')) b.parentId = +$('#agParentSel').value || 0;
      try {
        let id = a && a.id;
        if (isNew) id = (await api('POST', '/admin/agents', { ...b, username: $('#agU').value.trim(), password: pw })).id;
        else await api('PUT', '/admin/agents/' + a.id, { ...b, ...(pw ? { password: pw } : {}) });
        let wErr = '';
        for (const k of ['ro', 'slt']) { const U = $('#agExU_' + k), Pw = $('#agExP_' + k); if (!U || !id) continue; const u = U.value.trim(), pw = Pw ? Pw.value : '', cur = extAcc[k]; try { if (!u && cur) await api('DELETE', `/admin/${k}/agents/${id}`); else if (u && (pw || !cur || cur.user !== u)) await api('PUT', `/admin/${k}/agents/${id}`, { user: u, pass: pw }); } catch (e) { toast(e.message, 1); } }
        const atxU = $('#agExU_atx'), atxP = $('#agExP_atx'), atxC = $('#agExC_atx'), atxUser = atxU ? atxU.value.trim() : '', atxPass = atxP ? atxP.value : '', atxCode = atxC ? atxC.value.trim() : '', oldAtx = extAcc.atx;
        if (atxU && id) {
          try {
            if (!atxUser && oldAtx) await api('DELETE', `/admin/atx/agents/${id}`);
            else if (atxUser && (atxPass || atxCode || !oldAtx || oldAtx.user !== atxUser)) await api('PUT', `/admin/atx/agents/${id}`, { user: atxUser, pass: atxPass, code: atxCode });
          } catch (e) { wErr = 'Atlantix: ' + e.message; }
        }
        const wu = $('#agWfU') ? $('#agWfU').value.trim() : '', wp = $('#agWfP') ? $('#agWfP').value : '';
        if ($('#agWfU') && id) {
          try {
            if (wu && (wp || !wolfAcc || wolfAcc.user !== wu)) await api('PUT', '/admin/wolf/agents/' + id, { user: wu, pass: wp });
            else if (!wu && wolfAcc) await api('DELETE', '/admin/wolf/agents/' + id);
          } catch (e) { wErr = (wErr ? wErr + ' · ' : '') + 'WOLF: ' + e.message; }
        }
        if ($('#agMxA') && id) {
          const ma = $('#agMxA').value, mg = $('#agMxG').value;
          try {
            if (ma && mg && (!mxMap || mxMap.acc !== ma || mxMap.mx !== mg)) await api('PUT', '/admin/mxp/agents/' + id, { acc: ma, mx: mg });
            else if ((!ma || !mg) && mxMap) await api('DELETE', '/admin/mxp/agents/' + id);
          } catch (e) { wErr = (wErr ? wErr + ' · ' : '') + 'MaxPlayer: ' + e.message; }
        }
        closePage(); await load(); toast(wErr ? 'Agente salvato, ma: ' + wErr : isNew ? 'Agente creato' : 'Agente aggiornato', !!wErr);
      } catch (e) { toast(e.message, 1); }
    };
    $('#agTz') && ($('#agTz').onclick = async () => {
      if (!(await ask('Azzerare la verifica in due passaggi?', `<b>${esc(a.username)}</b> entrerà solo con la password e potrà riattivarla dal suo pannello.`, 'Azzera'))) return;
      try { await api('PUT', '/admin/agents/' + a.id, { resetTotp: true }); closePage(); await load(); toast('2FA azzerata'); } catch (e) { toast(e.message, 1); }
    });
    $('#agMoveBtn') && ($('#agMoveBtn').onclick = async () => {
      const parentId = +$('#agMoveParent').value || 0;
      if (parentId === (a.parentId || 0)) return;
      const oldBoss = parentById.get(a.parentId) ? parentById.get(a.parentId).username : 'Master';
      const newBoss = parentById.get(parentId) ? parentById.get(parentId).username : 'Master';
      if (!(await ask('Spostare l’agente?', `<b>${esc(a.username)}</b> passerà da <b>${esc(oldBoss)}</b> a <b>${esc(newBoss)}</b>. I clienti, i pagamenti e gli account dei pannelli restano collegati all’agente.`, 'Sposta'))) return;
      try { await api('PUT', `/admin/agents/${a.id}/parent`, { parentId }); closePage(); await load(); toast(`${a.username} spostato sotto ${newBoss}`); }
      catch (e) { toast(e.message, 1); }
    });
    $('#agDel') && ($('#agDel').onclick = async () => {
      if (!(await askDanger('Eliminare l\'agente?', `<b>${esc(a.username)}</b> non potrà più entrare. I suoi ${a.clients} clienti e i suoi sotto-agenti passano a ${a.parentId ? 'chi stava sopra di lui' : 'te'}: nessun cliente smette di funzionare.`, a.username))) return;
      try { await api('DELETE', '/admin/agents/' + a.id); closePage(); await load(); toast('Agente eliminato'); } catch (e) { toast(e.message, 1); }
    });
    if (sub) onlyMine($('#agB'), topP);
    page.classList.add('on'); $('#agB').scrollTop = 0;
  }

  /* ---------- l'agente: scheda cliente semplice (server assegnato + utente e password) ---------- */
  function openClient(d) {
    const isNew = !d, m = me(), P = m.perms || {};
    const e = d ? JSON.parse(JSON.stringify(d)) : { code: '', name: '', notes: '', active: true, expires: addMonths('', 1), playlists: [], maxConn: 1, addons: [] };
    if (!e.playlists.length) e.playlists.push({ serverId: (D.servers[0] || {}).id || '', username: '', password: '' });
    const linked = !!e.parent;
    const canLineSync = !linked && !!P.renew;
    e.lineSync = null; e.lineSyncDirty = false;
    let lineSyncLoad = Promise.resolve(), lineSyncLoadFailed = false;
    let appSet = false;
    const adCat = (D.addonCat || []).filter((x) => x.mode === 'some');
    const roPl = !isNew && !P.playlists, roExp = !isNew && !P.renew;
    const showLinePick = !roPl && canLoadLines(P);
    const plRow = (p, i) => `<div class="pl" data-i="${i}"><div class="row3" style="grid-template-columns:1fr 1fr 1fr auto"><select class="inp" data-k="serverId" ${roPl ? 'disabled' : ''}>${D.servers.map((s) => `<option value="${esc(s.id)}" ${p.serverId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}${p.serverId || isNew ? '' : '<option value="" selected>' + esc(p.serverName || 'Altro server') + '</option>'}</select>
      <input class="inp" data-k="username" placeholder="Utente" value="${esc(p.username)}" ${roPl ? 'readonly' : ''} autocomplete="off"><input class="inp" data-k="password" type="password" placeholder="${isNew ? 'Password' : 'Password (vuota = invariata)'}" value="${esc(p._linePickPassword || '')}" ${roPl ? 'readonly' : ''} autocomplete="new-password">
      ${roPl ? '' : `<button class="icb" data-rm="${i}" title="Togli">✕</button>`}</div></div>`;
    $('#agT').innerHTML = isNew ? 'Nuovo cliente' : `${esc(e.name || e.code)} <span class="code" style="margin-left:6px">${esc(e.code)}</span>`;
    const lineaCard = () => `<div class="ag-c" style="grid-column:1/-1"><h4>Linea</h4><small>${linked ? 'Le linee di questa TV (gestione indipendente)' : 'Scegli il server e scrivi utente e password della linea del cliente'}</small>
        ${showLinePick ? `<div style="margin:10px 0"><b style="display:block;margin-bottom:6px">🔎 Cerca una linea già creata</b><div class="line-pick-controls"><div id="cLinePick" data-placeholder="🔎 Cerca una linea sui pannelli disponibili"></div>${e.playlists.length > 1 ? `<label class="line-pick-dest"><span>Metti in:</span><select class="inp line-pick-target" id="cLineTarget" aria-label="Playlist di destinazione">${e.playlists.map((_, i) => `<option value="${i}">Playlist ${i + 1}</option>`).join('')}${e.playlists.length < 10 ? '<option value="new">Nuova playlist</option>' : ''}</select></label>` : ''}</div></div>` : ''}
        ${!roPl && window.KXPaste ? `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px"><textarea class="inp mono" id="cPaste" rows="2" style="flex:1;min-width:220px;font-size:12.5px" placeholder="📋 Incolla linea: link M3U o utente e password — riempie utente e password qui sotto"></textarea><button class="btn sm" id="cPasteGo" type="button">Riconosci</button><span id="cPasteMsg" class="mut" style="font-size:12px;width:100%"></span></div>` : ''}
        <div id="cPls">${e.playlists.map(plRow).join('')}</div>${roPl || e.playlists.length >= 10 ? '' : '<button class="btn sm" id="cAddPl">+ Aggiungi linea</button>'}</div>
        ${!isNew && window.KXPay ? `<div class="ag-c" style="grid-column:1/-1"><h4>💰 Pagamento</h4><div id="cPayBadge">${KXPay.badge('device', '', e.id)}</div>${P.payments ? `<button class="btn sm" type="button" data-kxpay-open data-kind="device" data-panel="" data-ref="${esc(e.id)}" data-label="${esc(e.name || e.code)}" data-owner="${+e.ownerId || 0}" style="margin-top:8px">💰 Gestisci pagamento</button>` : ''}</div>` : ''}`;
    // TV collegata a un cliente: di base usa le sue linee; con «Gestione indipendente» ha linee sue (resta collegata)
    const ownCard = () => !linked || !P.playlists ? '' : `<div class="ag-c"><h4>Gestione indipendente</h4><small>Linee proprie per questa TV, restando collegata al cliente</small>
        <div class="tog ${e.own ? 'on' : ''}" id="cOwn"><div><b>${e.own ? 'Linee proprie' : 'Usa le linee del cliente'}</b><small>${e.own ? 'Scadenza, profili e connessioni restano quelli del cliente principale' : 'Accendi per dare a questa TV un\'altra linea (es. un\'altra app)'}</small></div><i></i></div></div>${e.own ? lineaCard() : ''}${e.own && d && d.own && P.players && window.KXPlayers ? `<div class="ag-c" style="grid-column:1/-1" id="cOth"><h4>Altre app</h4><small>Manda le linee di questa TV anche alle altre app</small>${KXPlayers.box(e)}</div>` : ''}`;
    const body = () => `<div class="ag-g">
      <div class="ag-c"><h4>Cliente</h4><small>${isNew ? 'Scrivi il codice che il cliente vede sulla TV quando apre l\'app' : 'Nome e note'}</small>
        ${isNew ? '<label class="lbl">Codice della TV</label><input class="inp mono" id="cCode" placeholder="KXAB-12CD" maxlength="9" style="text-transform:uppercase">' : ''}
        <label class="lbl">${linked ? 'Nome del dispositivo' : 'Nome cliente'}</label><input class="inp" id="cName" maxlength="60" value="${esc(e.name)}" placeholder="es. Mario Rossi">
        <label class="lbl">Note</label><textarea class="inp" id="cNotes" maxlength="500" placeholder="Pagamento, contatto…">${esc(e.notes || '')}</textarea>
        ${`<label class="lbl">App del cliente</label><select class="inp" id="cApp"><option value="tv">Kairos Pro</option><option value="ktv" ${e.app === 'ktv' ? 'selected' : ''}>Kairos TV</option><option value="prem" ${e.app === 'prem' ? 'selected' : ''}>Kairos Premium</option><option value="lite" ${e.app === 'lite' ? 'selected' : ''}>Kairos Lite</option><option value="xc" ${e.app === 'xc' ? 'selected' : ''}>Kairos XC</option><option value="plus" ${e.app === 'plus' ? 'selected' : ''}>Kairos Plus</option><option value="nova" ${e.app === 'nova' ? 'selected' : ''}>Kairos Nova</option></select>`}</div>
      ${linked ? ownCard() : `<div class="ag-c"><h4>Abbonamento</h4><small>${roExp ? 'Non puoi cambiare la scadenza' : 'Scadenza obbligatoria, massimo 3 anni'}</small>
        <div class="tog ${e.active ? 'on' : ''}" id="cAct" ${!isNew && !P.disable ? 'style="opacity:.5;pointer-events:none"' : ''}><div><b>Servizio attivo</b><small>Se spento il player mostra “dispositivo disattivato”</small></div><i></i></div>
        <label class="lbl">Scadenza</label><input class="inp" type="date" id="cExp" value="${esc(e.expires)}" ${roExp ? 'readonly' : ''}>
        ${canLineSync ? '<div id="cSyncInfo"></div>' : ''}
        ${roExp ? '' : periodQuickRow('agent-exp')}
        <label class="lbl">Connessioni (massimo ${P.maxConn || 1})</label><input class="inp" type="number" id="cConn" min="1" max="${P.maxConn || 1}" value="${Math.min(e.maxConn || 1, P.maxConn || 1)}"></div>
      ${lineaCard()}
      ${P.account ? `<div class="ag-c"><h4>Profili e visioni</h4><small>Quanti profili e quante visioni insieme</small>
        <div class="row"><div><label class="lbl">Profili massimi</label><input class="inp" type="number" id="cMaxP" min="0" max="10" value="${e.maxProfiles ?? 3}"></div><div><label class="lbl">Visioni insieme (0 = libere)</label><input class="inp" type="number" id="cMaxS" min="0" max="${P.maxConn || 1}" value="${e.maxStreams || 0}"></div></div></div>` : ''}
      ${P.ai && !['lite', 'ktv', 'prem', 'xc', 'plus', 'nova'].includes(e.app) ? `<div class="ag-c"><h4>Assistente IA</h4><small>Quale intelligenza artificiale e quante domande al giorno</small>
        <label class="lbl">Intelligenza artificiale</label><select class="inp" id="cAiP"><option value="">Quella predefinita</option><option value="claude" ${e.aiProvider === 'claude' ? 'selected' : ''}>Claude</option><option value="gm" ${e.aiProvider === 'gm' ? 'selected' : ''}>Gemini</option></select>
        <label class="lbl">Domande al giorno</label><input class="inp" type="number" id="cAiL" min="0" max="1000" placeholder="Predefinito" value="${(e.aiLimit ?? -1) >= 0 ? e.aiLimit : ''}">
        ${isNew ? '' : `<button class="btn sm" id="cAiX" style="margin-top:10px">+10 domande extra oggi</button>${e.aiExtra ? `<span class="mut" style="font-size:12px;margin-left:8px">${e.aiExtra} extra disponibili</span>` : ''}`}</div>` : ''}
      ${P.link && !isNew && !linked ? `<div class="ag-c"><h4>Collegare un altro dispositivo</h4><small>Sulla nuova TV il cliente sceglie «Ho già un abbonamento» e scrive il codice (vale 10 minuti)</small><button class="btn" id="cLink">🔗 Genera codice di collegamento</button><div id="cLinkOut" class="mono" style="font-size:22px;margin-top:10px"></div></div>` : ''}
      ${P.players && !linked && window.KXPlayers ? `<div class="ag-c" style="grid-column:1/-1" id="cOth"><h4>Altre app</h4><small>Manda le linee di questo cliente anche alle altre app</small>${KXPlayers.box(e)}</div>` : ''}
      ${adCat.length && !['lite', 'ktv', 'prem', 'xc', 'plus', 'nova'].includes(e.app) ? `<div class="ag-c"><h4>Add-on</h4><small>Temi e skin che puoi assegnare</small><div class="ag-chk">${adCat.map((x) => chk('cad', x.id, esc(x.name), (e.addons || []).includes(x.id), false, x.price ? esc(x.price) : '')).join('')}</div></div>` : ''}`}
    </div>`;
    const sync = () => {
      e.name = $('#cName').value; e.notes = $('#cNotes').value; if ($('#cExp')) e.expires = $('#cExp').value; if ($('#cConn')) e.maxConn = +$('#cConn').value || 1;
      $$('#cPls .pl').forEach((el) => { const p = e.playlists[+el.dataset.i]; $$('[data-k]', el).forEach((i) => (p[i.dataset.k] = i.value)); });
      if ($('.ag-chk [data-cad]')) e.addons = $$('[data-cad]').filter((i) => i.checked).map((i) => i.dataset.cad);
    };
    const updateSyncInfo = () => {
      const box = $('#cSyncInfo'); if (!box) return;
      box.innerHTML = e.lineSync ? `<small class="mut" style="display:block;margin-top:7px;font-size:12px">🔗 Allineata alla linea ${esc(String(e.lineSync.panel || '').toUpperCase())} <b>${esc(e.lineSync.username)}</b> · <button class="btn sm" id="cSyncUnlink">Scollega</button></small>` : '';
      const b = $('#cSyncUnlink');
      if (b) b.onclick = async () => {
        try { if (e.id) await api('DELETE', '/admin/line-sync', { deviceId: e.id }); e.lineSync = null; e.lineSyncDirty = true; updateSyncInfo(); toast('Allineamento scollegato'); }
        catch (err) { toast(err.message, 1); }
      };
    };
    const draw = () => {
      const code = $('#cCode') ? $('#cCode').value : '';
      $('#agB').innerHTML = body(); if ($('#cCode')) $('#cCode').value = code;
      updateSyncInfo();
      if (showLinePick) window.KXLinePick.mount($('#cLinePick'), async (line) => {
        sync();
        const clientName = KXTools.noteValue(line.note).trim().slice(0, 60), nameField = $('#cName');
        if (nameField && !nameField.value.trim() && clientName) { nameField.value = clientName; e.name = clientName; }
        const target = $('#cLineTarget') ? $('#cLineTarget').value : '0';
        const index = target === 'new' ? e.playlists.length : Math.max(0, +target || 0);
        if (target === 'new') e.playlists.push({ id: 'p' + Date.now(), serverId: (D.servers[0] || {}).id || '', username: '', password: '' });
        const playlist = e.playlists[index] || (e.playlists[index] = { serverId: (D.servers[0] || {}).id || '', username: '', password: '' });
        playlist.username = line.username || '';
        playlist.password = line.password || '';
        playlist._linePickPassword = line.password || '';
        const server = await matchLineServer(line.host, D.servers || [], line.p);
        if (server) playlist.serverId = server.id;
        if (canLineSync) {
          e.expires = line.exp || '';
          e.lineSync = { panel: line.p, username: line.username || '' }; e.lineSyncDirty = true;
        }
        draw();
        if (!server) toast('Scegli il server', 1);
      });
      $('#cApp') && ($('#cApp').onchange = () => { sync(); e.app = $('#cApp').value; appSet = true; draw(); });
      $('#cOth') && KXPlayers.bind($('#cOth'), e, () => { const x = D.devices.find((y) => y.id === e.id); if (x) e.orbix = x.orbix; sync(); draw(); });
      $('#cAct') && ($('#cAct').onclick = () => { e.active = !e.active; $('#cAct').classList.toggle('on', e.active); });
      bindPeriodQuick($('#agB'), 'agent-exp', (n, unit) => { $('#cExp').value = addPeriod($('#cExp').value, n, unit); });
      $('#cAddPl') && ($('#cAddPl').onclick = () => { sync(); e.playlists.push({ serverId: (D.servers[0] || {}).id || '', username: '', password: '' }); draw(); });
      $('#cOwn') && ($('#cOwn').onclick = () => {
        sync(); e.own = !e.own;
        // si parte dalle linee del cliente principale (stesso id: senza riscrivere la password resta la sua)
        if (e.own && !(d.playlists || []).length) { const par = D.devices.find((x) => x.id === e.parent); e.playlists = par && (par.playlists || []).length ? par.playlists.map((p) => ({ id: p.id, serverId: p.serverId || '', serverName: p.serverName, username: p.username, password: '' })) : [{ serverId: (D.servers[0] || {}).id || '', username: '', password: '' }]; }
        draw();
      });
      const cPasteGo = async (quiet) => {
        const r = window.KXPaste.parse($('#cPaste').value);
        if (!r || !r.username) { if (!quiet) toast('Incolla il link M3U, o utente e password della linea', 1); return; }
        sync();
        let sv = null;
        // prima prova: abbina il server sull'indirizzo vero (lato server, l'agente non vede gli host)
        if (r.host) { try { const mm = await api('POST', '/admin/match-server', { host: r.host }); if (mm && mm.server) sv = D.servers.find((s) => s.id === mm.server.id) || mm.server; } catch {} }
        // ripiego: abbina per nome del server dentro l'indirizzo
        if (!sv) { const host = (r.host || '').replace(/^https?:\/\//, '').toLowerCase(); sv = D.servers.find((s) => host && String(s.name).length >= 2 && host.includes(String(s.name).toLowerCase())) || null; }
        const p0 = e.playlists[0] || (e.playlists[0] = { serverId: '', username: '', password: '' });
        p0.username = r.username; p0.password = r.password || ''; if (sv) p0.serverId = sv.id;
        draw();
        // la password nel modulo parte sempre vuota: la riempio io, così resta al salvataggio
        const pf = $('#cPls .pl[data-i="0"] [data-k="password"]'); if (pf && r.password) pf.value = r.password;
        const m = $('#cPasteMsg'); if (m) m.innerHTML = sv ? `✓ Riconosciuta · server <b>${esc(sv.name)}</b> · utente <b>${esc(r.username)}</b>` : `✓ Utente <b>${esc(r.username)}</b> inserito · ora scegli il server assegnato qui sotto`;
      };
      $('#cPasteGo') && ($('#cPasteGo').onclick = () => cPasteGo(false));
      $('#cPaste') && $('#cPaste').addEventListener('paste', () => setTimeout(() => cPasteGo(true), 0)); // riconosce da sola appena incolli
      $$('[data-rm]').forEach((b) => (b.onclick = () => { sync(); e.playlists.splice(+b.dataset.rm, 1); draw(); }));
      $('#cAiX') && ($('#cAiX').onclick = async () => { try { await api('POST', '/admin/ai/grant', { deviceId: d.id, n: 10 }); toast('+10 domande extra'); } catch (err) { toast(err.message, 1); } });
      $('#cLink') && ($('#cLink').onclick = async () => { try { const r = await api('POST', '/admin/devices/' + d.id + '/linkcode'); $('#cLinkOut').textContent = r.pin ? r.pin.replace(/(\d{3})(\d{3})/, '$1 $2') : 'Codice non disponibile'; } catch (err) { toast(err.message, 1); } });
    };
    draw();
    if (canLineSync && !isNew) {
      lineSyncLoad = api('GET', '/admin/line-sync?deviceId=' + encodeURIComponent(e.id)).then((r) => {
        if (!e.lineSyncDirty) { e.lineSync = r.link || null; if (page.classList.contains('on')) updateSyncInfo(); }
      }).catch(() => { lineSyncLoadFailed = true; });
    }
    $('#agFt').innerHTML = `${!isNew && P.delete ? '<button class="btn danger" id="cDel">Elimina</button>' : ''}${!isNew && P.kick && d.status !== 'pending' ? '<button class="btn" id="cKick">Disconnetti</button>' : ''}<div style="flex:1"></div><button class="btn" id="cNo">Annulla</button><button class="btn pri" id="cOk">${isNew ? 'Attiva cliente' : 'Salva'}</button>`;
    $('#cNo').onclick = closePage;
    $('#cKick') && ($('#cKick').onclick = () => kickDev(d));
    $('#cDel') && ($('#cDel').onclick = async () => {
      if (!(await askDanger('Eliminare il cliente?', `<b class="mono">${esc(d.code)}</b> verrà rimosso e l'app tornerà alla schermata di attivazione.`, d.code))) return;
      try { await api('DELETE', '/admin/devices/' + d.id); closePage(); await load(); toast('Eliminato'); } catch (err) { toast(err.message, 1); }
    });
    $('#cOk').onclick = async () => {
      sync();
      const pls = e.playlists.map((p) => ({ id: p.id, serverId: p.serverId, username: p.username, password: p.password }));
      try {
        let saved;
        if (isNew) saved = await api('POST', '/admin/devices', { code: $('#cCode').value.trim().toUpperCase(), name: e.name, notes: e.notes, expires: e.expires, playlists: pls, maxConn: e.maxConn, addons: ['lite', 'ktv', 'xc', 'plus'].includes(e.app) ? [] : e.addons, app: ['lite', 'ktv', 'xc', 'plus'].includes(e.app) ? e.app : 'tv' });
        else {
          const b = { name: e.name, notes: e.notes, ...(appSet ? { app: e.app } : {}) };
          if (linked && P.playlists && (e.own || d.own)) { b.own = !!e.own; if (e.own) b.playlists = pls; }
          if (!linked) {
            if (P.renew && e.expires !== d.expires) b.expires = e.expires;
            if (P.disable && e.active !== d.active) b.active = e.active;
            if (P.playlists) b.playlists = pls;
            if (P.account && $('#cMaxP')) { b.maxProfiles = +$('#cMaxP').value || 0; b.maxStreams = +$('#cMaxS').value || 0; }
            if (P.ai && $('#cAiP')) { b.aiProvider = $('#cAiP').value; const v = $('#cAiL').value.trim(); b.aiLimit = v === '' ? -1 : +v; }
            b.maxConn = e.maxConn;
            if ($('.ag-chk [data-cad]')) b.addons = e.addons;
          }
          await api('PUT', '/admin/devices/' + d.id, b);
        }
        let syncError = '';
        if (canLineSync) {
          await lineSyncLoad;
          if (lineSyncLoadFailed && !e.lineSyncDirty) syncError = 'Non ho potuto controllare il collegamento alla linea';
          else {
            const deviceId = isNew ? saved && saved.id : e.id, link = e.lineSync;
            const matches = link && e.playlists.some((p) => String(p.username || '').trim().toLowerCase() === String(link.username || '').trim().toLowerCase());
            try {
              if (matches && deviceId) await api('PUT', '/admin/line-sync', { deviceId, panel: link.panel, username: link.username });
              else if (link && deviceId) await api('DELETE', '/admin/line-sync', { deviceId });
            } catch (err) { syncError = err.message; }
          }
        }
        closePage(); await load(); toast(syncError ? `Salvato, ma collegamento linea non aggiornato: ${syncError}` : isNew ? 'Cliente attivato' : 'Modifiche salvate', !!syncError);
      } catch (err) { toast(err.message, 1); }
    };
    page.classList.add('on'); $('#agB').scrollTop = 0;
  }
  function openWizard(preset) {
    preset = preset || {};
    const agent = isAgent(), P = me().perms || {}, players = () => D.players || {};
    const servers = Array.isArray(D.servers) ? D.servers : [];
    const maxC = agent ? Math.max(1, P.maxConn || 1) : 20;
    const showKairos = !agent || can('create');
    const showMax = !agent || (!!players().max && can('players'));
    const showOrbix = !agent || (!!players().orbix && can('players'));
    const showNanomid = !agent;
    const dynamicApps = KXActApps.dynamicApps(D.activationApps, agent, P);
    let orcpCfg = null;
    const availableTargets = () => new Set([...(showKairos ? ['kairos'] : []), ...(showMax ? ['max'] : []), ...(showOrbix ? ['orbix'] : []), ...(showNanomid ? ['nanomid'] : []), ...(orcpCfg && orcpCfg.servers && orcpCfg.servers.length ? ['orcp'] : []), ...dynamicApps.map((x) => x.key)]);
    const initialTargets = Array.isArray(preset.targets) ? preset.targets.filter((k) => availableTargets().has(k) || k === 'orcp') : [showKairos ? 'kairos' : (dynamicApps[0] && dynamicApps[0].key)].filter(Boolean);
    const st = {
      targets: new Set(initialTargets), code: '', look: null, app: 'tv', months: 1, expires: addMonths('', 1), payDue: false, payMonths: 1, payAmount: '',
      durationMode: 'months', durationN: '', durationUnit: 'd',
      pl: { serverId: (servers[0] || {}).id || '', username: '', password: '', host: '', ref: '', note: '', panel: '', picked: null }, expSource: '',
      name: '', nameAuto: '', maxConn: 1, mxDomain: '', orbixId: '', nmCode: '', oxDns: '0', orcpServer: '', appData: {}, busy: false, running: '', results: [],
      owner: !agent && +preset.ownerId > 0 ? +preset.ownerId : 0, // titolare: agente responsabile del nuovo cliente Kairos (0 = tu)
      linkOpen: false, linkName: '', // TV nuova di un cliente che c'è già: «Collega a un cliente» (cli-pick.js)
    };
    if (window.KXCliPick) KXCliPick.reset('wzLinkTo');
    const showLinePick = canLoadLines(P);
    const APPS_W = [['tv', 'Kairos Pro'], ['prem', 'Kairos Premium'], ['ktv', 'Kairos TV'], ['plus', 'Kairos Plus'], ['xc', 'Kairos XC'], ['lite', 'Kairos Lite'], ['nova', 'Kairos Nova']];
    const targets = () => [['kairos', 'App Kairos'], ['max', 'MaxPlayer'], ['orbix', 'OrbixPlay'], ...(showNanomid ? [['nanomid', 'Nanomid']] : []), ...(orcpCfg && orcpCfg.servers && orcpCfg.servers.length ? [['orcp', 'MirkoTeam']] : []), ...dynamicApps.map((x) => [x.key, x.name])];
    const targetNames = () => Object.fromEntries(targets().map(([k, n]) => [k, n]));
    const targetColor = KXActApps.targetColor, targetIcon = KXActApps.targetIcon;
    const preselectOrcp = () => {
      if (!orcpCfg || !st.pl.panel) return;
      const name = String((orcpCfg.map || {})[st.pl.panel] || '');
      const server = (orcpCfg.servers || []).find((x) => x.name === name);
      if (server) st.orcpServer = String(server.n);
    };
    const orbDns = (players().dns && players().dns.orbix) || [];
    let mxDomains = null, mxError = '', mxLoading = showMax, dnsSaved = [], alive = true;
    let lkT = 0, lkN = 0;
    const has = (k) => st.targets.has(k);
    /* titolare: «Responsabile» del nuovo cliente Kairos, anche un agente già esistente (il server lo accetta solo dal titolare) */
    const ownerPick = () => {
      const ags = !agent && has('kairos') ? (D.agents || []).filter((a) => a && a.active !== 0) : [];
      if (!ags.length) return '';
      return `<label class="lbl" style="margin-top:12px">Responsabile</label><select class="inp" id="wzOwner" style="max-width:340px;margin:0"><option value="0"${st.owner ? '' : ' selected'}>Tu (nessun agente)</option>${ags.map((a) => `<option value="${esc(a.id)}"${+st.owner === +a.id ? ' selected' : ''}>👤 ${esc(a.username)}</option>`).join('')}</select>
        <p class="wz-help">Con un agente il cliente Kairos è subito suo: lo vede e lo gestisce nel suo pannello. La linea sul pannello IPTV resta sul tuo account.</p>`;
    };
    const fmtCode = (v) => { let c = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); if (c.length === 6 && !c.startsWith('KX')) c = 'KX' + c; return c.length > 4 ? c.slice(0, 4) + '-' + c.slice(4) : c; };
    const okCode = () => /^KX[A-Z0-9]{2}-[A-Z0-9]{4}$/.test(st.code);
    const codeOk = () => !has('kairos') || (okCode() && st.look && !st.look.taken && !st.look.mine && st.look.ok !== false);
    const lineCredentialsOk = () => !!(st.pl.username.trim() && st.pl.password);
    const lineOk = () => lineCredentialsOk() && (agent ? (!has('kairos') || !!st.pl.serverId) : (!(has('kairos') || has('nanomid')) || !!st.pl.host.trim()));
    const durationOk = () => !has('kairos') || (st.durationMode === 'months' ? st.months > 0 : st.durationMode === 'date' ? !!st.expires : Number.isInteger(+st.durationN) && +st.durationN >= 1 && +st.durationN <= 999);
    const targetsOk = () => st.targets.size > 0 && [...st.targets].every((k) => availableTargets().has(k)) &&
      (!has('kairos') || codeOk()) &&
      (!has('nanomid') || /^[A-Za-z0-9]{4,16}$/.test(String(st.nmCode || '').replace(/\s+/g, ''))) &&
      (!has('max') || (!mxLoading && (mxDomains && mxDomains.length ? !!st.mxDomain : !!mxError))) &&
      (!has('orbix') || (!!String(st.orbixId || '').trim() && !!orbDns.length && !!orbDns[+st.oxDns]));
    const ago = (t) => { if (!t) return ''; const s = Math.max(0, (Date.now() - t) / 1000); return s < 90 ? 'adesso' : s < 3600 ? Math.round(s / 60) + ' min fa' : s < 86400 ? Math.round(s / 3600) + ' ore fa' : Math.round(s / 86400) + ' giorni fa'; };
    const dateIt = (iso) => { try { return new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return iso; } };
    const paintAgentExpiry = (warning = '') => {
      const date = $('#wzExpT'), source = $('#wzExpSource'), hint = $('#wzExpHint'), warn = $('#wzExpWarn');
      if (date) date.textContent = dateIt(st.expires);
      if (source) source.textContent = st.expSource ? ` · come la linea ${st.expSource}` : '';
      if (hint) hint.style.display = warning || st.expSource ? 'none' : '';
      if (warn) warn.innerHTML = warning ? `<div class="wz-st warn">${esc(warning)}</div>` : '';
    };
    const resetAgentExpiry = () => {
      st.expires = addMonths('', 1); st.months = 1; st.durationMode = 'months'; st.durationN = ''; st.expSource = '';
      paintAgentExpiry();
    };
    const detachChangedLine = () => {
      const picked = st.pl.picked;
      if (!agent || !picked || st.pl.username === picked.username && st.pl.password === picked.password) return;
      st.pl.panel = ''; st.pl.picked = null;
      resetAgentExpiry();
    };
    /* TV nuova di un cliente che hai già (10 novembre 2026): la colleghi a lui come dispositivo in più, senza linea nuova.
       Titolare sempre; agente con «Collegare altri dispositivi» (i dispositivi in più solo fino al suo tetto) */
    const canLink = () => !!window.KXCliPick && (!agent || can('link')) && KXCliPick.list('').length > 0;
    const linkBlock = () => {
      if (!canLink()) return '';
      if (!st.linkOpen) return '<div style="margin-top:8px"><button type="button" class="btn sm" id="wzLinkOpen">🔗 È la TV di un cliente che hai già? Collegala a lui</button></div>';
      return `<div class="lnk" style="margin-top:10px"><b>🔗 Collega questa TV a un cliente che hai già</b><small>Diventa un dispositivo in più del cliente: userà le sue linee, la sua scadenza e i suoi profili. Non serve scegliere una linea qui sotto.</small>${KXCliPick.html('wzLinkTo', { exclude: '', add: 1 })}<div class="row" style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap"><input class="inp" id="wzLinkName" maxlength="60" style="flex:1;min-width:180px;margin:0" placeholder="Nome di questa TV (es. Camera da letto)" value="${esc(st.linkName)}"><button type="button" class="btn pri" id="wzLinkGo">🔗 Collega</button><button type="button" class="btn" id="wzLinkNo">Annulla</button></div></div>`;
    };
    const statusAgain = () => { const s2 = $('#wzCodeSt'); if (s2) s2.innerHTML = codeStatus(); bindOpen(); foot(); };
    const linkGo = async () => {
      const L = st.look; if (!L || !L.free) return toast('Controlla prima il codice della TV', 1);
      const g = KXCliPick.info('wzLinkTo'); if (!g) { toast('Scegli il cliente a cui collegarla', 1); KXCliPick.open('wzLinkTo'); return; }
      if (g.full && !g.canGrow) return toast(g.why, 1);
      if (g.full && !g.growOn) return toast(`${g.c.name} ha già ${g.used} di ${g.max} dispositivi: accendi «aumenta i dispositivi» o scegli un altro cliente`, 1);
      const who = esc(g.c.name), code = esc(st.code);
      const msg = g.full ? `<b>${who}</b> ha già ${g.used} di ${g.max} dispositivi. Vuoi portarli a <b>${g.need}</b> per collegare la TV <b class="mono">${code}</b>? Userà le sue linee, la sua scadenza e i suoi profili.`
        : `La TV <b class="mono">${code}</b> diventa un dispositivo in più di <b>${who}</b> (${g.used + 1} di ${g.max}) e userà le sue linee, la sua scadenza e i suoi profili.`;
      if (!(await ask(g.full ? 'Aumentare i dispositivi e collegare?' : 'Collegare la TV al cliente?', msg, g.full ? `Aumenta a ${g.need} e collega` : 'Collega'))) return;
      // il titolare usa l'id della TV (da «Controlla codice»); l'agente il codice, che il server accetta solo per le TV nuove
      const ref = agent ? st.code : L.id || ((D.devices || []).find((d) => d.code === st.code) || {}).id || st.code;
      try {
        await api('POST', '/admin/devices/' + encodeURIComponent(ref) + '/link', { primary: g.c.id, name: (st.linkName || '').trim(), ...(g.full ? { grow: true } : {}) });
        alive = false; closePage(); await load(); toast(`TV collegata a ${g.c.name}${g.full ? ` · ora ha ${g.need} dispositivi` : ''}`);
      } catch (e) { toast(e.message, 1); }
    };
    const bindLink = () => {
      const o = $('#wzLinkOpen'); if (o) o.onclick = () => { st.linkOpen = true; statusAgain(); KXCliPick.open('wzLinkTo'); };
      if ($('#wzLinkToBox')) KXCliPick.bind('wzLinkTo', { exclude: '', add: 1 });
      const nm = $('#wzLinkName'); if (nm) nm.oninput = () => { st.linkName = nm.value; };
      const no = $('#wzLinkNo'); if (no) no.onclick = () => { st.linkOpen = false; statusAgain(); };
      const go = $('#wzLinkGo'); if (go) go.onclick = linkGo;
    };
    const codeStatus = () => {
      if (!has('kairos')) return '';
      const L = st.look;
      if (!st.code) return '<div class="wz-help">Il codice è sulla schermata che il cliente vede sull’app Kairos.</div>';
      if (!okCode()) return '<div class="wz-st bad">Il codice è come <b>KXAB-12CD</b>: KX seguito da altre 6 lettere o cifre.</div>';
      if (!L) return '<div class="wz-st">Controllo il codice…</div>';
      if (L.ok === false) return `<div class="wz-st bad">${esc(L.error || 'Codice non valido')}</div>`;
      if (L.taken) return '<div class="wz-st bad">Questo codice è già usato da un altro venditore. Controlla quello nella foto.</div>';
      if (L.mine) return `<div class="wz-st warn">Questa TV è già un tuo cliente${L.name ? ` (<b>${esc(L.name)}</b>)` : ''}. Per cambiarla aprila dall’elenco Clienti. <button class="btn sm" data-wzopen="${esc(L.id)}" style="margin-left:6px">Apri il cliente</button></div>`;
      if (L.free) return `<div class="wz-st good">✓ TV trovata: <b>${esc(L.appName || 'Kairos')}</b>${L.model ? ` su <b>${esc(L.model)}</b>` : ''}${L.seen ? ` · aperta ${esc(ago(L.seen))}` : ''}. Ora scegli la linea.</div>${linkBlock()}`;
      return '<div class="wz-st warn">Non trovo questa TV. Controlla il codice mentre l’app è aperta. Se sei sicuro che sia corretto, puoi attivarla lo stesso: si sbloccherà quando l’app si collega.</div>';
    };
    const missing = () => {
      const out = [];
      if (!st.targets.size || [...st.targets].some((k) => !availableTargets().has(k))) return ['scegli un’app disponibile'];
      if (has('kairos') && !codeOk()) out.push(!okCode() ? 'il codice della TV' : st.look && (st.look.taken || st.look.mine) ? 'un codice non ancora attivato' : 'il controllo del codice');
      if (has('nanomid') && !/^[A-Za-z0-9]{4,16}$/.test(String(st.nmCode || '').replace(/\s+/g, ''))) out.push('il codice Nanomid');
      if (has('kairos') && !durationOk()) out.push('la durata');
      if (!lineCredentialsOk()) out.push('la linea (utente e password)');
      if (has('kairos') && agent && !st.pl.serverId) out.push('il server');
      if ((has('kairos') || has('nanomid')) && !agent && !st.pl.host.trim()) out.push('il DNS della linea');
      if (has('max') && mxLoading) out.push('il caricamento dei DNS MaxPlayer');
      if (has('max') && !mxLoading && mxDomains && mxDomains.length && !st.mxDomain) out.push('il DNS MaxPlayer');
      if (has('max') && !mxLoading && mxDomains && !mxDomains.length && !mxError) out.push('un DNS MaxPlayer configurato');
      if (has('orbix') && !String(st.orbixId || '').trim()) out.push('il codice dispositivo OrbixPlay');
      if (has('orbix') && !orbDns.length) out.push('un DNS OrbixPlay configurato');
      if (has('orbix') && orbDns.length && !orbDns[+st.oxDns]) out.push('il DNS OrbixPlay');
      if (has('orcp') && !((orcpCfg && orcpCfg.servers) || []).some((x) => String(x.n) === String(st.orcpServer))) out.push('il server MirkoTeam');
      for (const app of dynamicApps) if (has(app.key) && !String((st.appData[app.key] || {}).mac || '').trim()) out.push(`il MAC / ID del dispositivo per ${app.name}`);
      return [...new Set(out)];
    };
    const syncForm = () => {
      const get = (id) => $('#' + id);
      if (get('wzCode')) st.code = get('wzCode').value;
      if (get('wzDurN')) st.durationN = get('wzDurN').value;
      if (get('wzDurUnit')) st.durationUnit = get('wzDurUnit').value;
      if (get('wzApp')) st.app = get('wzApp').value;
      if (get('wzSrv')) st.pl.serverId = get('wzSrv').value;
      if (get('wzHost')) st.pl.host = get('wzHost').value;
      if (get('wzUser')) st.pl.username = get('wzUser').value;
      if (get('wzPass')) st.pl.password = get('wzPass').value;
      if (get('wzName')) st.name = get('wzName').value;
      if (get('wzOwner')) st.owner = Math.max(0, +get('wzOwner').value || 0);
      if (get('wzConn')) st.maxConn = Math.max(1, Math.min(maxC, +get('wzConn').value || 1));
      if (get('wzMxDom')) st.mxDomain = get('wzMxDom').value;
      if (get('wzOrbixId')) st.orbixId = get('wzOrbixId').value;
      if (get('wzNmCode')) st.nmCode = get('wzNmCode').value;
      if (get('wzOxDns')) st.oxDns = get('wzOxDns').value;
      if (get('wzOrcpSrv')) st.orcpServer = get('wzOrcpSrv').value;
      for (const app of dynamicApps) {
        const data = st.appData[app.key] || (st.appData[app.key] = {});
        if (get('wzActMac-' + app.key)) data.mac = get('wzActMac-' + app.key).value;
        if (get('wzActKey-' + app.key)) data.deviceKey = get('wzActKey-' + app.key).value;
      }
    };
    const foot = () => {
      const mi = missing(), go = $('#wzGo');
      if (!go) return;
      go.disabled = !!mi.length || st.busy;
      const miss = $('#wzMiss');
      if (miss) miss.textContent = mi.length ? 'Per continuare: ' + mi.join(' · ') : 'Tutto pronto';
      const s1 = $('#wzS1'), s2 = $('#wzS2');
      if (s1) { s1.classList.toggle('ok', targetsOk()); s1.querySelector('.n').textContent = targetsOk() ? '✓' : '1'; }
      if (s2) { s2.classList.toggle('ok', lineOk()); s2.querySelector('.n').textContent = lineOk() ? '✓' : '2'; }
    };
    const updateDuration = () => {
      const count = $('#wzDurN'), unit = $('#wzDurUnit');
      if (!count || !unit) return;
      st.durationMode = 'custom'; st.durationN = count.value; st.durationUnit = unit.value; st.months = 0;
      st.expSource = '';
      const source = $('#wzExpSource'); if (source) source.textContent = '';
      $$('[data-wzm]').forEach((x) => x.classList.remove('on'));
      const n = Number(count.value);
      if (Number.isInteger(n) && n >= 1 && n <= 999) {
        st.expires = addPeriod('', n, unit.value);
        if ($('#wzExpT')) $('#wzExpT').textContent = dateIt(st.expires);
        if ($('#wzExp')) $('#wzExp').value = st.expires;
      }
      foot();
    };
    const lookup = (now = false) => {
      clearTimeout(lkT); st.look = null;
      const status = $('#wzCodeSt');
      if (status) status.innerHTML = codeStatus();
      foot();
      if (!okCode()) return;
      const n = ++lkN, run = async () => {
        let r;
        try { r = await api('GET', '/admin/devices/lookup?code=' + encodeURIComponent(st.code)); } catch (e) { r = { ok: false, error: e.message }; }
        if (n !== lkN || !alive) return;
        st.look = r;
        if (r && r.free && r.app) { st.app = r.app; const sa = $('#wzApp'); if (sa) sa.value = r.app; }
        const s = $('#wzCodeSt'); if (s) s.innerHTML = codeStatus();
        bindOpen(); foot();
      };
      if (now) run(); else lkT = setTimeout(run, 300);
    };
    const bindOpen = () => { $$('[data-wzopen]').forEach((b) => (b.onclick = () => { const x = (D.devices || []).find((y) => y.id === b.dataset.wzopen); if (x) openClient(x); })); bindLink(); };
    const fillLine = async (r, label) => {
      const sv = agent && r.p ? await matchLineServer(r.host, servers, r.p) : null;
      st.pl.username = r.username || '';
      st.pl.password = r.password || '';
      st.pl.ref = label || r.tag || 'Linea';
      st.pl.note = r.note || '';
      st.pl.panel = r.p || '';
      preselectOrcp();
      if (agent) {
        if (r.p) st.pl.serverId = sv ? sv.id : '';
        st.pl.picked = r.p ? { username: st.pl.username, password: st.pl.password } : null;
        resetAgentExpiry();
      }
      else st.pl.host = r.host || '';
      const dnsFallback = $('#wzLineDns');
      if (dnsFallback) dnsFallback.innerHTML = '';
      const today = new Date(); today.setHours(0, 0, 0, 0);
      let expiryWarning = '';
      if (agent && r.p) {
        const expDate = typeof r.exp === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.exp) ? new Date(r.exp + 'T00:00:00') : null;
        if (expDate && !Number.isNaN(expDate.getTime()) && expDate > today) {
          st.expires = r.exp; st.durationMode = 'date'; st.durationN = ''; st.months = 0; st.expSource = r.tag || ({ wolf: 'WOLF', armada: 'ARMADA', storm: 'STORM', ro: 'REALOTT', slt: 'SLT' })[r.p] || String(r.p).toUpperCase();
        } else expiryWarning = expDate && !Number.isNaN(expDate.getTime()) ? 'La linea è scaduta: rinnovala prima sul pannello' : 'Il pannello non indica la scadenza di questa linea: resta 1 mese';
        paintAgentExpiry(expiryWarning);
      } else if (!agent && r.exp && new Date(r.exp + 'T00:00:00') > today) {
        st.expires = r.exp; st.durationMode = 'date'; st.durationN = ''; st.months = 0; st.expSource = ({ wolf: 'WOLF', armada: 'Armada', storm: 'Storm', ro: 'Realott', slt: 'SLT' })[r.p] || String(r.p || '').toUpperCase();
        if ($('#wzExp')) $('#wzExp').value = st.expires;
        if ($('#wzExpT')) $('#wzExpT').textContent = dateIt(st.expires);
        if ($('#wzExpSource')) $('#wzExpSource').textContent = ` · come la linea ${st.expSource}`;
        if ($('#wzDurN')) $('#wzDurN').value = '';
        $$('[data-wzm]').forEach((x) => x.classList.remove('on'));
      }
      const clientName = KXTools.noteValue(r.name || r.note).trim().slice(0, 60), nameField = $('#wzName');
      const currentName = nameField ? nameField.value : st.name;
      if (clientName && (!currentName.trim() || (st.nameAuto && currentName === st.nameAuto))) {
        st.name = clientName;
        st.nameAuto = clientName;
        if (nameField) nameField.value = clientName;
      }
      if ($('#wzUser')) $('#wzUser').value = st.pl.username;
      if ($('#wzPass')) $('#wzPass').value = st.pl.password;
      if ($('#wzSrv')) $('#wzSrv').value = st.pl.serverId;
      if ($('#wzHost')) $('#wzHost').value = st.pl.host;
      const server = agent ? servers.find((x) => x.id === st.pl.serverId) : null;
      const where = agent ? server && server.name : st.pl.host;
      const user = esc(st.pl.username), chosen = label ? `Linea scelta · ${esc(label)} · ` : 'Linea riconosciuta · ';
      const msg = $('#wzPasteSt');
      if (msg) msg.innerHTML = where ? `<div class="wz-st good">✓ ${chosen}${agent ? 'server' : 'DNS'} <b>${esc(where)}</b> · utente <b>${user}</b></div>` : `<div class="wz-st warn">✓ Utente <b>${user}</b> inserito · ${agent ? 'scegli il server qui sotto' : r.p ? 'scegli il DNS nel menu qui sopra' : 'completa il campo DNS qui sotto'}</div>`;
      if (agent && has('kairos') && !sv) toast('Scegli il server', 1);
      if (!agent && !r.host && r.p && dnsFallback && window.KXLinePick && window.KXLinePick.mountDns) {
        await window.KXLinePick.mountDns(dnsFallback, r.p, r.tag, async (host) => {
          st.pl.host = host;
          if ($('#wzHost')) $('#wzHost').value = host;
          if (msg) msg.innerHTML = `<div class="wz-st good">✓ ${chosen}DNS <b>${esc(host)}</b> · utente <b>${user}</b></div>`;
          foot();
        });
      }
      foot();
    };
    const pasteGo = async (quiet) => {
      const paste = $('#wzPaste'), r = window.KXPaste && paste && window.KXPaste.parse(paste.value);
      if (!r || !r.username) { if (!quiet) toast('Incolla il link M3U o il messaggio con utente e password', 1); return; }
      await fillLine(r, '');
    };
    const body = () => {
      const targetButtons = targets().filter(([k]) => availableTargets().has(k)).map(([k, label]) =>
        `<button type="button" class="wz-target${has(k) ? ' on' : ''}" style="--wzt:${targetColor(k)}" data-wztarget="${k}" aria-pressed="${has(k)}"><i>✓</i><span class="wz-ico">${esc(targetIcon(k, label))}</span><span>${esc(label)}</span></button>`).join('');
      const kairos = has('kairos') ? `<div class="wz-st wz-app-st" style="--wzt:${targetColor('kairos')}"><b>Codice della TV</b><p class="wz-help">Il cliente apre l’app Kairos e ti manda una foto. Scrivi il codice: maiuscole e trattino li metto io.</p>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input class="inp wz-code" id="wzCode" placeholder="KXAB-12CD" maxlength="9" autocomplete="off" spellcheck="false" value="${esc(st.code)}"><button type="button" class="btn sm" id="wzCheck">Controlla codice</button></div>
        <div id="wzCodeSt">${codeStatus()}</div><p class="wz-help">Quale app Kairos usa il cliente?</p>
        <div class="wz-apps">${APPS_W.map(([k, n]) => `<button type="button" class="btn${st.app === k ? ' on' : ''}" data-wzapp="${k}" aria-pressed="${st.app === k}">${n}</button>`).join('')}</div></div>` : '';
      const max = has('max') ? `<div class="wz-st wz-app-st" style="--wzt:${targetColor('max')}"><b>MaxPlayer</b><p class="wz-help">Scegli il DNS MaxPlayer dove creare la linea.</p>
        <select class="inp" id="wzMxDom" ${mxLoading ? 'disabled' : ''}><option value="">${mxLoading ? 'Carico i DNS…' : mxDomains && mxDomains.length ? 'Scegli un DNS…' : 'Nessun DNS disponibile'}</option>${(mxDomains || []).map((x) => `<option value="${esc(x.id)}"${String(st.mxDomain) === String(x.id) ? ' selected' : ''}>${esc(x.label || 'DNS ' + x.id)}</option>`).join('')}</select>
        ${mxError ? `<div class="wz-st warn">Non riesco a caricare i DNS MaxPlayer: ${esc(mxError)}. Puoi provare l’attivazione e leggere l’esito qui sotto.</div>` : !mxLoading && !(mxDomains || []).length ? '<div class="wz-st warn">Non ci sono DNS MaxPlayer configurati.</div>' : ''}</div>` : '';
      const orbix = has('orbix') ? `<div class="wz-st wz-app-st" style="--wzt:${targetColor('orbix')}"><b>OrbixPlay</b><p class="wz-help">Scrivi il codice dispositivo che il cliente ti ha mandato e scegli il suo DNS.</p>
        <div class="wz-fields"><input class="inp" id="wzOrbixId" data-mac placeholder="Codice dispositivo OrbixPlay" autocomplete="off" value="${esc(st.orbixId)}">
        <select class="inp" id="wzOxDns" ${orbDns.length ? '' : 'disabled'}><option value="">Scegli il DNS OrbixPlay…</option>${orbDns.map((x, i) => `<option value="${i}"${String(st.oxDns) === String(i) ? ' selected' : ''}>${esc(x.name || 'DNS ' + (i + 1))}${!agent && x.host ? ' — ' + esc(x.host) : ''}</option>`).join('')}</select></div>
        ${!orbDns.length ? '<div class="wz-st warn">Non hai DNS OrbixPlay disponibili per il tuo account.</div>' : ''}</div>` : '';
      const nanomid = has('nanomid') ? `<div class="wz-st wz-app-st" style="--wzt:${targetColor('nanomid')}"><b>Nanomid</b><p class="wz-help">Scrivi il codice che il cliente vede sulla TV nell'app Nanomid: la lista arriva da sola, con utente e password nascosti.</p>
        <input class="inp" id="wzNmCode" maxlength="16" autocomplete="off" placeholder="Codice Nanomid sulla TV" value="${esc(st.nmCode)}"></div>` : '';
      const orcp = has('orcp') ? `<div class="wz-st wz-app-st" style="--wzt:${targetColor('orcp')}"><b>MirkoTeam</b><p class="wz-help">Scegli il server e scrivi solo utente e password della linea.</p>
        <label class="lbl">Server<select class="inp" id="wzOrcpSrv"><option value="">Scegli il server…</option>${((orcpCfg && orcpCfg.servers) || []).map((x) => `<option value="${esc(x.n)}"${String(st.orcpServer) === String(x.n) ? ' selected' : ''}>Server ${esc(x.n)} · ${esc(x.name)}</option>`).join('')}</select></label></div>` : '';
      const apps = dynamicApps.filter((x) => has(x.key)).map((x) => {
        const data = st.appData[x.key] || {};
        return `<div class="wz-st wz-app-st" style="--wzt:${targetColor(x.key)}"><b>${esc(x.name)}</b><p class="wz-help">Inserisci il MAC / ID del dispositivo per questa app.</p>
          <label class="lbl">MAC / ID del dispositivo<input class="inp" data-act-mac data-mac id="wzActMac-${x.key}" value="${esc(data.mac || '')}" maxlength="64" autocomplete="off"></label><label class="lbl">Device key (facoltativa)<input class="inp" id="wzActKey-${x.key}" value="${esc(data.deviceKey || '')}" maxlength="120"></label></div>`;
      }).join('');
      const picker = showLinePick ? '<div id="wzLinePick" data-placeholder="🔎 Cerca una linea già creata"></div>' : '';
      const dnsFallback = !agent && showLinePick ? '<div id="wzLineDns"></div>' : '';
      const paste = window.KXPaste ? '<textarea class="inp mono" id="wzPaste" rows="2" style="font-size:12.5px;margin-top:8px" placeholder="📋 Incolla un link M3U o il messaggio con server, utente e password"></textarea>' : '';
      const lineFields = agent
        ? `<select class="inp" id="wzSrv" title="Server"><option value="">Scegli il server…</option>${servers.map((x) => `<option value="${esc(x.id)}"${st.pl.serverId === x.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`
        : `<input class="inp" id="wzHost" list="wzDnsSaved" placeholder="DNS della linea, es. http://server:8080" autocomplete="off" value="${esc(st.pl.host)}"><datalist id="wzDnsSaved">${dnsSaved.filter((x) => x.host).map((x) => `<option value="${esc(x.host)}" label="${esc(x.name || x.host)}"></option>`).join('')}</datalist>`;
      const extra = `<div class="wz-s" id="wzS3"><span class="n">3</span><div><h4>Nome del cliente</h4>
        <p class="hint">Facoltativo: se lo lasci vuoto userò il nome utente della linea.</p>
        <input class="inp" id="wzName" maxlength="60" placeholder="es. Mario Rossi" value="${esc(st.name)}" style="margin:0">
        ${ownerPick()}
        ${has('kairos') ? `${agent
          ? `<div class="wz-exp">Scade il <b id="wzExpT">${esc(dateIt(st.expires))}</b><span id="wzExpSource">${st.expSource ? ` · come la linea ${esc(st.expSource)}` : ''}</span></div>
            <p class="wz-help" id="wzExpHint">La scadenza la prende dalla linea del pannello IPTV che scegli qui sopra (se scrivi la linea a mano: 1 mese).</p><div id="wzExpWarn"></div>`
          : `<p class="hint" style="margin-top:14px">Durata e visioni contemporanee valgono solo per l’app Kairos.</p>
          <div class="wz-dur">${[1, 3, 6, 12].map((n) => `<button type="button" class="btn${st.durationMode === 'months' && st.months === n ? ' on' : ''}" data-wzm="${n}">${n} ${n === 1 ? 'mese' : 'mesi'}</button>`).join('')}</div>
          <div class="wz-custom-duration"><span>Oppure scegli tu:</span><input class="inp" type="number" id="wzDurN" min="1" max="999" step="1" placeholder="es. 45" value="${esc(st.durationN)}"><select class="inp" id="wzDurUnit"><option value="d"${st.durationUnit === 'd' ? ' selected' : ''}>giorni</option><option value="m"${st.durationUnit === 'm' ? ' selected' : ''}>mesi</option><option value="y"${st.durationUnit === 'y' ? ' selected' : ''}>anni</option></select></div>
          <div class="wz-exp">Scade il <b id="wzExpT">${esc(dateIt(st.expires))}</b><span id="wzExpSource">${st.expSource ? ` · come la linea ${esc(st.expSource)}` : ''}</span> · <a href="#" id="wzExpOther">scegli un’altra data</a><input class="inp" type="date" id="wzExp" value="${esc(st.expires)}" style="display:none;max-width:200px;margin:8px 0 0"></div>`
        }<label class="lbl" style="margin-top:12px">Visioni contemporanee (massimo ${maxC})</label><input class="inp" type="number" id="wzConn" min="1" max="${maxC}" value="${st.maxConn}" style="max-width:180px;margin:0">
          ${(!agent || can('payments')) ? `<label class="ck" style="margin-top:14px"><input type="checkbox" id="wzPayDue"${st.payDue ? ' checked' : ''}><span>Non ha ancora pagato</span></label><div class="wz-fields" id="wzPayFields" style="${st.payDue ? '' : 'display:none'}"><input class="inp" type="number" id="wzPayMonths" min="0" max="120" value="${st.payMonths}" placeholder="Mesi"><input class="inp" type="number" id="wzPayAmount" min="0" max="100000" step="0.01" value="${esc(st.payAmount)}" placeholder="Importo € (facoltativo)"></div>` : ''}` : ''}</div></div>`;
      return `<div class="wz">
        <div class="wz-s${targetsOk() ? ' ok' : ''}" id="wzS1"><span class="n">${targetsOk() ? '✓' : '1'}</span><div><h4>Dove lo attivi</h4><p class="hint">Puoi attivare il cliente in una o più app. Scegli almeno un’app.</p>
          <div class="wz-targets">${targetButtons}</div>${kairos}${max}${orbix}${nanomid}${orcp}${apps}</div></div>
        <div class="wz-s${lineOk() ? ' ok' : ''}" id="wzS2"><span class="n">${lineOk() ? '✓' : '2'}</span><div><h4>Linea del cliente</h4>
          <p class="hint">Scegli una linea già creata, incollala oppure inserisci i dati a mano. Utente e password servono per tutte le app.</p>
          ${picker}${dnsFallback}${paste}<div id="wzPasteSt"></div>
          <div class="wz-pl">${lineFields}<input class="inp" id="wzUser" placeholder="Utente" autocomplete="off" value="${esc(st.pl.username)}"><input class="inp" id="wzPass" placeholder="Password" autocomplete="off" value="${esc(st.pl.password)}"></div>
          <p class="wz-help">${agent ? 'Scegli il server solo tra quelli assegnati a te; non vedrai i DNS del titolare.' : 'Il DNS della linea si compila dalla linea scelta o si può selezionare dall’elenco salvato.'}</p>
          ${agent && !servers.length ? '<div class="wz-st warn">Non hai server assegnati. Chiedi al titolare di assegnartene uno per attivare App Kairos.</div>' : ''}</div></div>
        ${extra}
        ${!agent ? '<a class="wz-full" href="#" id="wzFull">Modulo completo (tutte le opzioni)</a>' : ''}
      </div>`;
    };
    const draw = (focus = false) => {
      $('#agB').innerHTML = body();
      if (showLinePick) window.KXLinePick.mount($('#wzLinePick'), (line) => fillLine(line, line.tag));
      $$('[data-wztarget]').forEach((b) => (b.onclick = () => {
        syncForm();
        const k = b.dataset.wztarget;
        if (has(k)) st.targets.delete(k); else st.targets.add(k);
        draw(false);
      }));
      $$('[data-wzapp]').forEach((b) => (b.onclick = () => {
        st.app = b.dataset.wzapp;
        $$('[data-wzapp]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
      }));
      const c = $('#wzCode');
      if (c) {
        c.oninput = () => { const v = fmtCode(c.value); if (v !== c.value) c.value = v; st.code = v; lookup(); };
        $('#wzCheck').onclick = () => { syncForm(); lookup(true); };
        if (focus) setTimeout(() => c.focus(), 50);
      }
      const paste = $('#wzPaste');
      if (paste) { paste.addEventListener('paste', () => setTimeout(() => pasteGo(true), 0)); paste.oninput = () => { if (/\S{6,}/.test(paste.value)) pasteGo(true); }; }
      ['wzDurN', 'wzDurUnit', 'wzSrv', 'wzHost', 'wzUser', 'wzPass', 'wzName', 'wzOwner', 'wzConn', 'wzMxDom', 'wzOrbixId', 'wzNmCode', 'wzOxDns', 'wzOrcpSrv'].forEach((id) => {
        const el = $('#' + id);
        if (el && id === 'wzDurN') el.addEventListener('input', updateDuration);
        else if (el && id !== 'wzDurUnit') el.addEventListener('input', () => { syncForm(); if (id === 'wzUser' || id === 'wzPass') detachChangedLine(); foot(); });
        if (el && el.tagName === 'SELECT') el.addEventListener('change', () => {
          if (id === 'wzDurUnit') updateDuration();
          else { syncForm(); foot(); }
        });
      });
      $$('[data-act-mac]').forEach((el) => { el.oninput = () => { syncForm(); foot(); }; });
      dynamicApps.forEach((app) => { const el = $('#wzActKey-' + app.key); if (el) el.oninput = () => syncForm(); });
      const payDue = $('#wzPayDue');
      if (payDue) payDue.onchange = () => { st.payDue = payDue.checked; $('#wzPayFields').style.display = st.payDue ? '' : 'none'; };
      $('#wzPayMonths') && ($('#wzPayMonths').oninput = () => { st.payMonths = +$('#wzPayMonths').value; });
      $('#wzPayAmount') && ($('#wzPayAmount').oninput = () => { st.payAmount = $('#wzPayAmount').value; });
      $$('[data-wzm]').forEach((b) => (b.onclick = () => {
        st.durationMode = 'months'; st.durationN = ''; st.months = +b.dataset.wzm; st.expires = addMonths('', st.months);
        st.expSource = ''; if ($('#wzExpSource')) $('#wzExpSource').textContent = '';
        if ($('#wzDurN')) $('#wzDurN').value = '';
        $$('[data-wzm]').forEach((x) => x.classList.toggle('on', x === b));
        if ($('#wzExpT')) $('#wzExpT').textContent = dateIt(st.expires);
        if ($('#wzExp')) $('#wzExp').value = st.expires;
        foot();
      }));
      const expOther = $('#wzExpOther');
      if (expOther) expOther.onclick = (e) => { e.preventDefault(); const x = $('#wzExp'); if (x) x.style.display = x.style.display === 'none' ? '' : 'none'; };
      const exp = $('#wzExp');
      if (exp) exp.onchange = () => { if (exp.value) { st.durationMode = 'date'; st.durationN = ''; st.expires = exp.value; st.months = 0; st.expSource = ''; if ($('#wzExpSource')) $('#wzExpSource').textContent = ''; if ($('#wzDurN')) $('#wzDurN').value = ''; $$('[data-wzm]').forEach((x) => x.classList.remove('on')); if ($('#wzExpT')) $('#wzExpT').textContent = dateIt(st.expires); foot(); } };
      const full = $('#wzFull');
      if (full) full.onclick = (e) => { e.preventDefault(); alive = false; closePage(); origOpen(null); };
      bindOpen(); foot();
      const section3 = $('#wzS3');
      const completed = missing().length === 0;
      if (section3) { section3.classList.toggle('ok', completed); section3.querySelector('.n').textContent = completed ? '✓' : '3'; }
    };
    const renderResults = () => {
      const finished = st.results.length && st.results.every((r) => r.status === 'ok' || r.status === 'error');
      const succeeded = st.results.filter((r) => r.status === 'ok').length;
      const failed = st.results.filter((r) => r.status === 'error').length;
      $('#agB').innerHTML = `<div class="wz"><div class="wz-s"><span class="n">${finished && !failed ? '✓' : '⚡'}</span><div><h4>${finished ? 'Esito dell’attivazione' : 'Attivazione in corso'}</h4>
        <p class="hint">${finished ? `${succeeded} su ${st.results.length} attivati${failed ? ` · ${failed} da riprovare` : ''}.` : 'Eseguo un’app alla volta. Puoi leggere qui il risultato di ciascuna.'}</p>
        <div class="wz-results">${st.results.map((r, ri) => `<div class="wz-result${r.status === 'ok' ? ' ok' : r.status === 'error' ? ' ko' : ''}"><i>${r.status === 'ok' ? '✓' : r.status === 'error' ? '✕' : r.status === 'running' ? '…' : '·'}</i><div><b>${esc(targetNames()[r.key] || r.key)}</b><small>${esc(r.message || (r.status === 'running' ? 'Attivazione in corso…' : 'In attesa'))}</small>
          ${r.activationUrl ? `<a class="btn sm act-app-link" href="${esc(r.activationUrl)}" target="_blank" rel="noopener">Apri il sito di attivazione ↗</a>` : ''}
          ${r.copyText ? `<button type="button" class="btn sm" data-wz-copy="${ri}">Copia tutto</button>` : ''}
          ${r.copyItems && r.copyItems.length ? `<div class="wz-copy-items">${r.copyItems.map((x, xi) => `<button type="button" class="btn sm" data-wz-copyitem="${ri}:${xi}">Copia ${esc(x.label)}</button>`).join('')}</div>` : ''}
        </div>${finished && r.status === 'error' && !st.running ? `<button type="button" class="btn sm" data-wzretry="${r.key}">Riprova</button>` : ''}</div>`).join('')}</div>
        ${finished ? `<div class="wz-summary">${failed ? 'Alcuni target non sono riusciti. Puoi riprovare solo quelli contrassegnati.' : 'Tutti i target selezionati sono stati attivati.'}</div><div class="wz-done" style="padding:14px 0 0"><button type="button" class="btn pri" id="wzClose">Chiudi</button></div>` : ''}</div></div></div>`;
      $('#agFt').innerHTML = '';
      const close = $('#wzClose'); if (close) close.onclick = closePage;
      $$('[data-wz-copy]').forEach((b) => (b.onclick = () => navigator.clipboard.writeText(st.results[+b.dataset.wzCopy].copyText || '').then(() => toast('Messaggio copiato'), () => toast('Copia non consentita dal browser', 1))));
      $$('[data-wz-copyitem]').forEach((b) => (b.onclick = () => { const [ri, xi] = b.dataset.wzCopyitem.split(':').map(Number), item = (st.results[ri] || {}).copyItems?.[xi]; if (item) navigator.clipboard.writeText(item.value).then(() => toast(item.label + ' copiato'), () => toast('Copia non consentita dal browser', 1)); }));
      $$('[data-wzretry]').forEach((b) => (b.onclick = async () => {
        if (st.running) return;
        const r = st.results.find((x) => x.key === b.dataset.wzretry);
        if (!r) return;
        st.running = r.key; r.status = 'running'; r.message = ''; renderResults();
        try { const result = await runTarget(r.key); if (typeof result === 'string') r.message = result; else Object.assign(r, result); r.status = 'ok'; } catch (e) { r.message = e.message || 'Attivazione non riuscita'; r.status = 'error'; }
        st.running = ''; renderResults();
        if (r.key === 'kairos' && r.status === 'ok') load().catch(() => {});
      }));
      $('#agB').scrollTop = 0;
    };
    const runTarget = async (k) => {
      const username = st.pl.username.trim(), name = st.name.trim() || username, note = st.pl.ref || st.pl.note || '';
      const plName = String(st.pl.ref || '').split(/\s+/)[0] || 'Linea';
      if (k === 'kairos') {
        const playlist = agent
          ? { serverId: st.pl.serverId, name: plName, username, password: st.pl.password }
          : { id: 'p' + Date.now(), name: plName, type: 'xtream', url: '', host: st.pl.host.trim(), username, password: st.pl.password };
        const created = await api('POST', '/admin/devices', { code: st.code, name, notes: note, expires: st.expires, playlists: [playlist], active: true, maxConn: st.maxConn, app: st.app, ...(!agent && st.owner ? { ownerId: st.owner } : {}) });
        let linkWarning = '';
        if ((!agent || P.create || P.renew) && st.pl.panel) {
          try { await api('PUT', '/admin/line-sync', { deviceId: created.id, panel: st.pl.panel, username }); }
          catch (e) { linkWarning = `allineamento non attivato: ${e.message}`; }
        }
        if (st.payDue && window.KXPay) {
          try { await KXPay.saveDue('device', '', created.id, name, agent ? me().id : 0, +$('#wzPayMonths').value || 0, $('#wzPayAmount').value === '' ? null : +$('#wzPayAmount').value, ''); }
          catch (e) { return `Cliente ${st.code} attivato · pagamento non registrato: ${e.message}${linkWarning ? ' · ' + linkWarning : ''}`; }
        }
        return `Cliente ${st.code} attivato${linkWarning ? ' · ' + linkWarning : ''}`;
      }
      if (k === 'max') {
        await api('POST', '/admin/ext-lists', { app: 'max', name, username, password: st.pl.password, domain: st.mxDomain, note });
        return 'Linea inviata a MaxPlayer';
      }
      if (k === 'orbix') {
        await api('POST', '/admin/ext-lists', { app: 'orbix', name, orbixId: st.orbixId.trim(), username, password: st.pl.password, dns: +st.oxDns || 0, note });
        return 'Linea inviata a OrbixPlay';
      }
      if (k === 'nanomid') {
        await api('POST', '/admin/ext-lists', { app: 'nanomid', name, quickCode: st.nmCode.replace(/\s+/g, ''), host: st.pl.host.trim(), username, password: st.pl.password, note });
        return 'Lista inviata a Nanomid';
      }
      if (k === 'orcp') {
        return KXActApps.submitOrcp({ cfg: orcpCfg, serverNumber: st.orcpServer, username, password: st.pl.password, registerLinked: !agent || can('lines') });
      }
      const app = dynamicApps.find((x) => x.key === k);
      if (!app) throw new Error('App non disponibile');
      const data = st.appData[k] || {}, mac = String(data.mac || '').trim(), deviceKey = String(data.deviceKey || '').trim();
      return KXActApps.submitApp({ app, agent, username, password: st.pl.password, mac, deviceKey, serverId: st.pl.panel ? (st.pl.serverId || '') : '', dns: agent ? '' : st.pl.host.trim() });
    };
    const startActivation = async () => {
      syncForm();
      if (st.busy || missing().length) return;
      st.busy = true;
      st.results = targets().map(([k]) => k).filter((k) => has(k) && availableTargets().has(k)).map((key) => ({ key, status: 'pending', message: '' }));
      for (const r of st.results) {
        st.running = r.key; r.status = 'running'; renderResults();
        try { const result = await runTarget(r.key); if (typeof result === 'string') r.message = result; else Object.assign(r, result); r.status = 'ok'; } catch (e) { r.message = e.message || 'Attivazione non riuscita'; r.status = 'error'; }
      }
      st.running = ''; st.busy = false; renderResults();
      if (st.results.some((r) => r.key === 'kairos' && r.status === 'ok')) load().catch(() => {});
    };
    const loadOptions = async () => {
      const jobs = [];
      if (showMax) jobs.push(api('GET', '/admin/maxplayer/domains').then((r) => { mxDomains = r.domains || []; if (mxDomains.length && !st.mxDomain) st.mxDomain = String(mxDomains[0].id); }).catch((e) => { mxDomains = []; mxError = e.message || 'DNS MaxPlayer non disponibili'; }).finally(() => { mxLoading = false; }));
      jobs.push(KXActApps.loadOrcpConfig(agent).then((c) => { orcpCfg = c; preselectOrcp(); }).catch(() => { orcpCfg = null; }));
      if (!agent) jobs.push(api('GET', '/admin/dns').then((r) => { dnsSaved = r.saved || []; }).catch(() => { dnsSaved = []; }));
      if (jobs.length) { await Promise.all(jobs); if (!orcpCfg || !orcpCfg.servers || !orcpCfg.servers.length) st.targets.delete('orcp'); else if (!st.targets.size && !showKairos && !dynamicApps.length) st.targets.add('orcp'); if (alive) draw(false); }
    };
    const footMarkup = '<span class="wz-miss" id="wzMiss"></span><div style="flex:1"></div><button class="btn" id="wzNo">Annulla</button><button class="btn pri" id="wzGo" style="padding:13px 24px;font-size:16px">⚡ Attiva</button>';
    $('#agT').innerHTML = 'Nuovo cliente / Nuovo dispositivo';
    $('#agFt').innerHTML = footMarkup;
    $('#wzNo').onclick = () => { alive = false; closePage(); };
    $('#wzGo').onclick = startActivation;
    draw(true);
    page.classList.add('on'); $('#agB').scrollTop = 0;
    if (preset.line && preset.line.username) fillLine(preset.line, preset.line.tag || '');
    loadOptions();
  }
  window.KXNewClient = (preset) => {
    const targets = preset && Array.isArray(preset.targets) ? preset.targets : ['kairos'];
    const P = (me().perms || {}), allowed = (k) => k === 'kairos' ? can('create') : ['max', 'orbix'].includes(k) ? can('players') : k === 'nanomid' ? !isAgent() : k === 'orcp' ? !!P.orcpApp && Array.isArray(P.orcpSrv) && P.orcpSrv.length > 0 : (D.activationApps || []).some((x) => x.key === k && x.enabled && KXActApps.hasPermission(P, x));
    if (isAgent() && (!targets.length || targets.some((k) => !allowed(k)))) {
      return toast('Non hai il permesso per attivare questi target', 1);
    }
    return openWizard(preset);
  };
  window.KXOpenLineTarget = (target, line, pre) => {
    const panelCan = target === 'orbix' ? (!window.KXOxpCan || KXOxpCan()) : (!window.KXMxpCan || KXMxpCan());
    if (isAgent() && !panelCan && can('players')) {
      const expiry = window.KXLinePick && window.KXLinePick.expiryDate;
      return window.KXNewClient({ targets: [target], line: {
        p: line.p, tag: line.tag, username: line.username || '', password: line.password || '',
        exp: expiry ? expiry(line.exp || line.exp_date || line.expire_date || line.expTxt) : line.exp,
        note: line.note || '', name: pre && pre.name || line.name || '', host: '',
      } });
    }
    const params = pre || { user: line.username, pass: line.password, name: line.note || line.username, note: `${line.tag || ''} ${line.username || ''}`.trim() };
    return target === 'orbix' ? window.KXOxpNew(params) : window.KXMxpNew(params);
  };
  const origOpen = openDrawer, origQuick = openQuick;
  window.openDrawer = openDrawer = function (d, act) {
    if (isAgent()) return !d && canOpenActivationWizard() ? openWizard() : openClient(d);
    return !d && !window.__assist ? openWizard() : origOpen(d, act);
  };
  window.openQuick = openQuick = function (d) { if (isAgent()) return openClient(d); return origQuick(d); };
  $('#newDev').onclick = () => openDrawer(null);

  /* ---------- demo: agenti di esempio e accesso come agente (utente "agente") ---------- */
  if (typeof DEMO !== 'undefined') {
    const t = Date.now();
    const P0 = { create: true, renew: true, disable: true, kick: true, playlists: true, delete: false, clientPerms: false, vpn: false, link: true, lineView: false, account: true, ai: true, dash: true, online: true, errors: false, reports: true, contentReq: false, addonReq: true, messages: true, store: false, storeApps: ['OrbixPlay', 'IBO Player'], storeAll: false, subClients: true, maint: false, dlcodes: true, vod: false, activity: true, addons: ['tema-ghiaccio', 'tema-natale'], maxConn: 2 };
    DEMO.maintAg = { on: false, msg: '', allow: [] };
    DEMO.agents = [
      { id: 2, username: 'mario.rossi', storeCode: 'K7M4', stores: 6, storeMax: null, password: 'Mario-2026!', email: 'mario@esempio.it', parentId: 0, maxClients: 50, canAgents: true, perms: P0, servers: ['s1', 's2'], active: true, notes: 'Zona Napoli', lastSeen: t - 40 * 60e3, createdAt: t - 40 * 864e5, totp: true },
      { id: 3, username: 'luca.tv', storeCode: 'P3XZ', stores: 3, storeMax: 20, email: 'luca@esempio.it', parentId: 0, maxClients: 20, canAgents: false, perms: { ...P0, addons: [] }, servers: ['s1'], active: true, notes: '', lastSeen: t - 3 * 3600e3, createdAt: t - 22 * 864e5, totp: false },
      { id: 4, username: 'giulia.stream', storeCode: 'R8QA', stores: 1, storeMax: null, email: '', parentId: 2, maxClients: 10, canAgents: false, perms: { ...P0, addons: [] }, servers: ['s2'], active: true, notes: '', lastSeen: t - 2 * 864e5, createdAt: t - 9 * 864e5, totp: false },
      { id: 5, username: 'bar.sport', storeCode: 'T2NW', stores: 0, storeMax: null, email: 'info@barsport.it', parentId: 0, maxClients: 5, canAgents: false, perms: P0, servers: [], active: false, notes: 'Sospeso: pagamento', lastSeen: t - 20 * 864e5, createdAt: t - 60 * 864e5, totp: false },
    ];
    DEMO.srv = [{ id: 's1', name: 'NKI', host: 'http://nki.esempio.tv:8080' }, { id: 's2', name: 'ATLX', host: 'http://atlx.esempio.tv' }, { id: 's3', name: 'Riserva', host: 'http://backup.esempio.tv' }];
    DEMO.devices.forEach((d, i) => { if (!d.parent && d.playlists.length) d.ownerId = i % 5 === 1 ? 2 : i % 5 === 3 ? 3 : i % 7 === 2 ? 4 : 0; });
    let demoAgent = false;
    const out = (a) => { const tree = [a.id, ...DEMO.agents.filter((x) => x.parentId === a.id).map((x) => x.id)]; const own = DEMO.devices.filter((d) => !d.parent && d.ownerId === a.id).length;
      return { ...a, serverNames: a.servers.map((s) => (DEMO.srv.find((x) => x.id === s) || {}).name).filter(Boolean), clients: DEMO.devices.filter((d) => !d.parent && tree.includes(d.ownerId)).length, ownClients: own, subAgents: tree.length - 1 }; };
    const origDemo = demoApi;
    window.demoApi = demoApi = async function (m, p, b) {
      { const am = DEMO.settings && DEMO.settings.agMaint; // demo: manutenzione del pannello agenti
        if (am && am.on && p !== '/admin/logout' && (p === '/admin/login' ? /^agente/i.test((b && b.user) || '') : demoAgent)) { const msg = am.msg || 'Pannello in manutenzione: torniamo operativi a breve. Riprova tra poco.'; agMaintScreen(msg); throw new Error(msg); } }
      if (p === '/admin/login') { demoAgent = /^agente/i.test((b && b.user) || ''); return { ok: true, user: demoAgent ? 'mario.rossi' : b.user || 'admin', role: demoAgent ? 'agent' : 'owner' }; }
      if (p === '/admin/dns' && m === 'GET') return { saved: DEMO.srv, hosts: [], byDev: {} };
      if (p.startsWith('/admin/devices/lookup')) { // demo: controllo del codice della TV
        const code = decodeURIComponent((p.split('code=')[1] || '')).toUpperCase(), d = DEMO.devices.find((x) => x.code === code && !x.parent);
        if (!/^KX[A-Z0-9]{2}-[A-Z0-9]{4}$/.test(code)) return { ok: false, error: 'Il codice è come KXAB-12CD' };
        if (!d) return { ok: true, code, found: false };
        const pend = !(d.playlists && d.playlists.length) && !d.expires;
        if (pend) return { ok: true, code, found: true, free: true, app: 'tv', appName: 'Kairos Pro', model: d.model || 'Fire TV Stick 4K', seen: Date.now() - 120e3 };
        return [2, 4].includes(d.ownerId) ? { ok: true, code, found: true, mine: true, id: d.id, name: d.name, app: 'tv', appName: 'Kairos Pro' } : { ok: true, code, found: true, taken: true };
      }
      if (p === '/admin/match-server') { const end = (x) => { try { const u = new URL(/^https?:\/\//i.test(x) ? x : 'http://' + x); return `${u.hostname.toLowerCase()}:${u.port || (u.protocol === 'https:' ? '443' : '80')}`; } catch { return ''; } }; const h = end(b.host || ''); const sv = DEMO.srv.find((s) => s.host && h && h === end(s.host)); return { server: sv ? { id: sv.id, name: sv.name } : null }; }
      if (p === '/admin/state') {
        const r = await origDemo(m, p, b);
        if (!demoAgent) return { ...r, role: 'owner', agents: DEMO.agents.map(out), storeAppNames: ['IBO Player', 'IboOne', 'OrbixPlay', 'Smarters Pro', 'TiviMate'], maintAg: DEMO.maintAg.on ? [2] : [] };
        const A = DEMO.agents[0], tree = [2, 4];
        const devs = r.devices.filter((d) => tree.includes(d.ownerId) || (d.parent && r.devices.some((x) => x.id === d.parent && tree.includes(x.ownerId))))
          .map((d) => { const { hosts, vpnConf, ...safe } = d; if (safe.orbix) { const { h, ...ob } = safe.orbix; safe.orbix = ob; } return { ...safe, playlists: d.playlists.map((pl, i) => ({ id: pl.id, name: pl.name, type: 'xtream', serverId: i % 2 ? 's2' : 's1', serverName: i % 2 ? 'ATLX' : 'NKI', username: 'cliente' + d.id, password: 'xxxx' })) }; });
        return { role: 'agent', user: A.username, me: { ...out(A), clientsUsed: out(A).clients }, devices: devs, agents: DEMO.agents.filter((x) => x.parentId === 2).map(out), servers: DEMO.srv.slice(0, 2).map(({ id, name }) => ({ id, name })),
          addonCat: addonCatNow().filter((x) => A.perms.addons.includes(x.id) && x.mode === 'some'), settings: (() => { const ka = Array.isArray(A.perms.kAllow) ? A.perms.kAllow : ['*'], ok = (k) => ka.includes('*') || ka.includes(k), S = r.settings; return { brand: S.brand, accent: S.accent, downloaderCode: ok('pro') ? S.downloaderCode || '' : '', storeDownloaderCode: ok('store') ? S.storeDownloaderCode || '' : '', liteDownloaderCode: ok('lite') ? S.liteDownloaderCode || '' : '', ktvDownloaderCode: ok('tv') ? S.ktvDownloaderCode || '' : '', xcDownloaderCode: ok('xc') ? S.xcDownloaderCode || '' : '', apkUrl: ok('pro') ? S.apkUrl || '' : '' }; })(),
          kairosApps: [['pro', 'Kairos Pro', r.settings.apkUrl || 'https://github.com/tuo-utente/kairos-iptv/releases/latest/download/kairos.apk', r.settings.downloaderCode], ['tv', 'Kairos TV', 'https://github.com/mariopiccolo8562-lang/kairos-tv/releases/latest/download/kairos-tv.apk', r.settings.ktvDownloaderCode], ['lite', 'Kairos Lite', 'https://github.com/mariopiccolo8562-lang/kairos-lite/releases/latest/download/kairos-lite.apk', r.settings.liteDownloaderCode], ['xc', 'Kairos XC', 'https://github.com/mariopiccolo8562-lang/kairos-xc/releases/latest/download/kairos-xc.apk', r.settings.xcDownloaderCode], ['store', 'Kairos Store', '', r.settings.storeDownloaderCode]].filter(([k]) => { const ka = Array.isArray(A.perms.kAllow) ? A.perms.kAllow : ['*']; return ka.includes('*') || ka.includes(k); }).map(([key, name, apk, code]) => ({ key, name, apk: `https://panel-kairos.com/get/${key === 'prem' ? 'premium' : key}.apk`, code: code || '' })),
          security: { totp: true }, activity: [], messages: [], counts: {}, dlCodes: A.perms.dlcodes ? (r.dlCodes || []).filter((x) => !Array.isArray(A.perms.dlcAllow) || A.perms.dlcAllow.includes('*') || A.perms.dlcAllow.includes(x.name)) : [], storeAppNames: ['IBO Player', 'OrbixPlay'], maint: A.perms.maint ? { ...DEMO.maintAg } : null, appLinks: A.perms.appstore ? (DEMO.settings.appLinks || []).filter((x) => !Array.isArray(A.perms.appsAllow) || A.perms.appsAllow.includes('*') || A.perms.appsAllow.some((y) => y.toLowerCase() === x.name.toLowerCase())).map((x) => (/orbix|max\s*-?player/i.test(x.name) ? { ...x, url: '' } : x)) : [], players: A.perms.players ? (() => { const c = DEMO.settings.playersCfg || { orbix: [{ name: 'Principale', host: 'http://dns.kairos-esempio.tv:8080' }], max: [] }, hostLike = (x) => /^(?:https?:\/\/|localhost(?::\d+)?$|(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?$|[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?(?:\/|$))/i.test(String(x || '').trim()), v = (l) => (l || []).map((x, i) => ({ name: hostLike(x.name) ? `DNS ${i + 1}` : x.name })); const okO = (n) => !Array.isArray(A.perms.orbDns) || A.perms.orbDns.includes('*') || A.perms.orbDns.some((y) => y.toLowerCase() === String(n).toLowerCase());
            // come il worker: codici cliente solo dei fornitori dei DNS concessi (per host del link, o per nome se lo slot non ha link)
            const orbOk = (c.orbix || []).filter((x) => okO(x.name)), mxAl = A.perms.mxDns, allM = !Array.isArray(mxAl) || mxAl.includes('*');
            const mxOk = [DEMO.mx0 || { id: '1', domain: 'dns.kairos-esempio.tv', label: 'Principale' }, ...(DEMO.mxNew || [])].filter((x) => allM || mxAl.includes(x.id));
            const hn = (x) => String(x || '').trim().replace(/^https?:\/\//i, '').split(/[:/]/)[0].toLowerCase(), lc = (x) => String(x || '').toLowerCase();
            const slotOk = (x) => { const h = hn(x.link), n = lc(x.name); return x.app === 'orbix' ? (!Array.isArray(A.perms.orbDns) || A.perms.orbDns.includes('*') || orbOk.some((d) => (h ? hn(d.host) === h : !!n && lc(d.name).includes(n)))) : (allM || mxOk.some((d) => (h ? lc(d.domain) === h : !!n && lc(d.label).includes(n)))); };
            return { orbix: true, max: true, dns: { orbix: v(orbOk), max: [] }, showDnsAgents: false, codes: c.codes || { orbix: '265847', max: '265847' }, slots: (c.slots || [{ id: 'nki-max', name: 'NKI', app: 'max', link: 'maxplayer.nki-max.stream', code: '265847' }, { id: 'armada-max', name: 'Armada', app: 'max', link: 'maxplayer-armada.chasertv2.stream', code: '265847' }, { id: 'nki-orbix', name: 'NKI', app: 'orbix', link: 'orbx.nki-orbx.download', code: '265847' }]).filter(slotOk).map((x, i) => ({ ...x, name: hostLike(x.name) ? `DNS ${i + 1}` : x.name, link: '' })) }; })() : null };
      }
      if (p === '/admin/agent-maint' && m === 'PUT') { DEMO.maintAg = { on: !!b.on, msg: b.msg || '', allow: b.allow || [] }; return { ...DEMO.maintAg }; }
      if (/^\/admin\/agent-maint\/\d+$/.test(p) && m === 'DELETE') { DEMO.maintAg = { on: false, msg: '', allow: [] }; return { ok: true }; }
      if (p === '/admin/agents' && m === 'POST') {
        if (!b.username || !b.password || b.password.length < 10) throw new Error('Nome utente e password (almeno 10 caratteri)');
        const id = Math.max(...DEMO.agents.map((x) => x.id)) + 1; DEMO.agents.push({ id, username: b.username, email: b.email || '', parentId: demoAgent ? 2 : 0, maxClients: b.maxClients || 10, canAgents: !!b.canAgents, perms: b.perms, servers: b.servers || [], active: b.active !== false, storeCode: b.storeCode || ('N' + id + 'X'), notes: b.notes || '', lastSeen: 0, createdAt: Date.now(), totp: false });
        return { ok: true, id };
      }
      const sc = p.match(/^\/admin\/agents\/(\d+)\/store-code$/);
      if (sc && m === 'POST') { const a = DEMO.agents.find((x) => x.id === +sc[1]); a.storeCode = 'N' + Math.random().toString(36).slice(2, 5).toUpperCase().replace(/[01OIL]/g, '7'); return { ok: true, storeCode: a.storeCode }; }
      const am = p.match(/^\/admin\/agents\/(\d+)$/);
      if (am) {
        const a = DEMO.agents.find((x) => x.id === +am[1]);
        if (m === 'DELETE') { DEMO.agents = DEMO.agents.filter((x) => x !== a); DEMO.devices.forEach((d) => { if (d.ownerId === a.id) d.ownerId = a.parentId; }); DEMO.agents.forEach((x) => { if (x.parentId === a.id) x.parentId = a.parentId; }); return { ok: true }; }
        const { password, resetTotp, ...rest } = b; if (rest.storeCode && DEMO.agents.some((x) => x !== a && x.storeCode === rest.storeCode)) throw new Error('Il codice ' + rest.storeCode + ' è già di un altro agente'); Object.assign(a, rest); if (resetTotp) a.totp = false; return { ok: true };
      }
      if (demoAgent && p === '/admin/devices' && m === 'POST') { const r = await origDemo(m, p, { ...b, active: true, playlists: (b.playlists || []).map((x) => ({ name: 'Linea', type: 'xtream', host: 'http://nki.esempio.tv:8080', username: x.username, password: x.password })) }); const d = DEMO.devices.find((x) => x.code === b.code) || DEMO.devices[0]; d.ownerId = 2; return r; }
      if (b && b.ownerId !== undefined) { const dm = p.match(/^\/admin\/devices\/(.+)$/); const d = dm && DEMO.devices.find((x) => x.id === dm[1]); if (d) d.ownerId = b.ownerId; const { ownerId, ...rest } = b; b = rest; }
      if (demoAgent && b && b.playlists) {
        if (b.own) b = { ...b, playlists: b.playlists.map((x, i) => ({ id: x.id || 'po' + i, name: 'Linea', type: 'xtream', host: 'http://nki.esempio.tv:8080', username: x.username, password: x.password || 'xxxx' })) }; // demo: linee proprie della TV collegata
        else { const { playlists, ...r } = b; b = r; }
      }
      return origDemo(m, p, b);
    };
  }
  /* «Entra per assistenza»: il titolare opera nel pannello di un suo agente. Un banner fisso lo ricorda e permette di uscire.
     Tutte le richieste portano l'header X-Assist (vedi api() in app.js); le azioni restano registrate come assistenza. */
  function assistBanner(name) {
    let b = document.getElementById('assistBar');
    if (!b) { b = document.createElement('div'); b.id = 'assistBar'; b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:linear-gradient(90deg,#b45309,#d97706);color:#fff;display:flex;align-items:center;gap:12px;padding:9px 16px;font-size:13.5px;font-weight:600;box-shadow:0 2px 12px #0007'; document.body.appendChild(b); }
    b.innerHTML = `🛟 Stai assistendo l'agente <b>${esc(name)}</b> — ogni modifica agisce sul <b>suo</b> pannello<span style="flex:1"></span><button class="btn sm" id="assistOut" style="background:#fff;color:#92400e;font-weight:700">Esci dall'assistenza</button>`;
    document.body.style.paddingTop = '42px';
    document.getElementById('assistOut').onclick = () => KXAssist.exit();
  }
  const KXAssist = (window.KXAssist = {
    on: () => !!window.__assist,
    // entra/esci ricaricando la pagina: così tutti i moduli ripartono come l'agente (o come titolare) senza residui dell'altro pannello
    enter(id, name) { try { sessionStorage.setItem('kxAssist', JSON.stringify({ id, name })); } catch {} window.__assist = id; toast('Entro nel pannello di ' + name + '…'); setTimeout(() => location.reload(), 300); },
    exit() { if (!window.__assist) return; try { sessionStorage.removeItem('kxAssist'); } catch {} window.__assist = null; toast('Torno al tuo pannello…'); setTimeout(() => location.reload(), 300); },
  });
  try { const _as = JSON.parse(sessionStorage.getItem('kxAssist') || 'null'); if (_as && window.__assist === +_as.id) assistBanner(_as.name || ('#' + _as.id)); } catch {}

  // sessione scaduta o uscita durante l'assistenza: si torna sempre al proprio pannello al prossimo accesso
  const origLogout = logout;
  window.logout = logout = function () { if (window.__assist) return KXAssist.exit(); return origLogout.apply(this, arguments); };
  if ($('#logout')) $('#logout').onclick = logout;
  const origShowLogin = showLogin;
  window.showLogin = showLogin = function () { if (window.__assist) { window.__assist = null; try { sessionStorage.removeItem('kxAssist'); } catch {} const b = document.getElementById('assistBar'); if (b) b.remove(); document.body.style.paddingTop = ''; } return origShowLogin.apply(this, arguments); };

  layoutMenu();
  if ($('#app').classList.contains('on')) renderAll();
})();
