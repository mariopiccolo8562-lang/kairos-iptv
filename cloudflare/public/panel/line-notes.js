/* KAIROS Control — note sulle linee dei pannelli che non hanno un campo nota proprio: Armada, MirkoTeam (ORCP), MaxPlayer,
   OrbixPlay. WOLF, Atlantix, Realott e SLT usano la nota del loro pannello. Le note stanno in KAIROS (tabella line_notes),
   si vedono nella riga e si modificano con «+ nota / Modifica». Va dopo i pannelli. */
(() => {
  const css = document.createElement('style');
  css.textContent = `.ln-box{display:inline-flex;align-items:center;gap:6px;margin-top:4px;font-size:12px}.ln-box .ln-t{color:#ecc06f;font-weight:600;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ln-box button{font-size:11px;padding:2px 7px}`;
  document.head.appendChild(css);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const C = {}; // panel → { t, notes }
  async function notesOf(p) { const c = C[p]; if (c && Date.now() - c.t < 120e3) return c.notes; const r = await api('GET', '/admin/line-notes?panel=' + p).catch(() => ({ notes: {} })); C[p] = { t: Date.now(), notes: r.notes || {} }; return C[p].notes; }
  async function edit(p, ref, label) {
    const cur = ((C[p] || {}).notes || {})[ref.toLowerCase()] || '';
    if (!(await ask('Nota di ' + label, `<textarea class="inp" id="lnN" rows="3" maxlength="300" placeholder="es. Mario Rossi · 333 1234567">${esc(cur)}</textarea><p class="mut" style="font-size:12px;margin:8px 0 0">La nota resta in KAIROS: questo pannello non ha un campo nota.</p>`, 'Salva'))) return;
    const note = $('#lnN').value.trim();
    try { await api('PUT', '/admin/line-notes', { panel: p, ref, note }); if (C[p]) { if (note) C[p].notes[ref.toLowerCase()] = note; else delete C[p].notes[ref.toLowerCase()]; } toast(note ? 'Nota salvata' : 'Nota tolta'); } catch (e) { toast(e.message, 1); }
    document.querySelectorAll('.ln-box[data-ln-ref="' + CSS.escape(ref.toLowerCase()) + '"]').forEach((b) => b.remove());
  }
  /* dove sta la linea in ogni pannello: selettore delle righe e come leggere utente/etichetta */
  const SRC = {
    armada: { view: 'v-armada', rows: '.ar-row', ref: (r) => { const m = r.querySelector('.ar-v .mono'); return m ? m.textContent.trim() : ''; }, slot: (r) => r.querySelector('.ar-v') && r.querySelector('.ar-v').parentElement },
    orcp: { view: 'v-orcp', rows: '[data-ormsg]', ref: (b) => b.dataset.ormsg || '', slot: (b) => { const tr = b.closest('tr'); return tr ? tr.firstElementChild : b.closest('.card'); } },
    mxp: { view: 'v-mxp', rows: '.mx-row', ref: (r) => r.dataset.id || '', label: (r) => { const m = r.querySelector('.mono'); return m ? m.textContent.trim() : ''; }, slot: (r) => r.firstElementChild },
    oxp: { view: 'v-oxp', rows: '#v-oxp b.mono', ref: (m) => m.textContent.trim(), slot: (m) => m.parentElement },
  };
  async function tick() {
    for (const [p, s] of Object.entries(SRC)) {
      const v = document.getElementById(s.view); if (!v || !v.classList.contains('on')) continue;
      const els = [...v.querySelectorAll(s.rows)]; if (!els.length) continue;
      const notes = await notesOf(p);
      for (const el of els) {
        const slot = s.slot(el); if (!slot || slot.querySelector(':scope > .ln-box')) continue;
        const ref = s.ref(el); if (!ref) continue;
        const n = notes[ref.toLowerCase()] || '';
        const box = document.createElement('div'); box.className = 'ln-box'; box.dataset.lnRef = ref.toLowerCase();
        box.innerHTML = `${n ? `<span class="ln-t" title="${esc(n)}">📝 ${esc(n)}</span>` : ''}<button class="btn sm">${n ? 'Modifica nota' : '+ nota'}</button>`;
        box.querySelector('button').onclick = (e) => { e.stopPropagation(); edit(p, ref, (s.label && s.label(el)) || ref); };
        slot.appendChild(box);
      }
    }
  }
  setInterval(() => { tick().catch(() => {}); }, 600);
})();
