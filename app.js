/* RSVP Desk — dashboard logic. No secrets live in this file. */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const DOMAIN = 'edu.escp.eu';
  const POLL_MS = 15000;
  const CFG_KEY = 'rsvpdesk-config';

  let cfg = loadCfg();
  let guests = [];
  let settings = {};
  let filter = 'all';
  let draft = [];
  let pollTimer = null;
  let lastSync = null;

  /* ---------------- utilities ---------------- */
  function loadCfg() { try { return JSON.parse(localStorage.getItem(CFG_KEY)) || {}; } catch (e) { return {}; } }
  function saveCfg() { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {} }
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 3200);
  }
  function setStatus(el, msg, kind) { el.textContent = msg || ''; el.className = 'status' + (kind ? ' ' + kind : ''); }
  function fmt(iso) {
    if (!iso) return '—';
    const d = new Date(iso); if (isNaN(d)) return '—';
    return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v);
    });
    kids.flat().forEach(k => n.append(k instanceof Node ? k : document.createTextNode(k)));
    return n;
  }
  const fullName = (g) => [g.firstName, g.lastName].filter(Boolean).join(' ');
  const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());

  /* ---------------- API ---------------- */
  async function api(action, payload) {
    if (!cfg.url || !cfg.key) throw new Error('Not connected. Open Setup first.');
    // text/plain avoids a CORS preflight, which Apps Script doesn't support
    const res = await fetch(cfg.url, { method: 'POST', body: JSON.stringify(Object.assign({ key: cfg.key, action }, payload || {})) });
    const data = await res.json().catch(() => { throw new Error('The backend did not answer properly. Check the Web App URL and that it is deployed for “Anyone”.'); });
    if (!data.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  async function sync(quiet) {
    try {
      const data = await api('list');
      guests = data.guests || [];
      settings = data.settings || {};
      lastSync = new Date();
      cfg.quota = data.quota;
      setLive(true);
      renderAll();
    } catch (e) {
      setLive(false);
      if (!quiet) toast(e.message);
    }
  }
  function startPolling() {
    clearInterval(pollTimer);
    pollTimer = setInterval(() => { if (document.visibilityState === 'visible') sync(true); }, POLL_MS);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && cfg.url) sync(true); });

  function setLive(on) {
    $('liveState').classList.toggle('on', on);
    $('liveText').textContent = on ? 'Live · updated ' + lastSync.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : (cfg.url ? 'Can’t reach backend' : 'Offline');
  }

  /* ---------------- navigation ---------------- */
  function show(view) {
    document.querySelectorAll('.view').forEach(v => v.hidden = v.id !== 'view-' + view);
    document.querySelectorAll('.nav').forEach(b => {
      if (b.dataset.view === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (view === 'email') { fillSettingsForm(); renderPreview(); renderSendInfo(); }
    if (view === 'setup') { $('cfgUrl').value = cfg.url || ''; $('cfgKey').value = cfg.key || ''; }
    if (location.hash !== '#' + view) history.replaceState(null, '', '#' + view);
  }
  document.querySelectorAll('.nav').forEach(b => b.addEventListener('click', () => show(b.dataset.view)));

  /* ---------------- dashboard ---------------- */
  function counts() {
    const sent = guests.filter(g => g.sentCount > 0);
    const c = {
      total: guests.length,
      contacted: sent.length,
      confirmed: guests.filter(g => g.status === 'confirmed').length,
      declined: guests.filter(g => g.status === 'declined').length,
      pending: sent.filter(g => g.status === 'pending').length,
      unsent: guests.filter(g => !g.sentCount && g.status === 'pending').length
    };
    c.rate = c.contacted ? Math.round(c.confirmed / c.contacted * 100) : 0;
    c.declRate = c.contacted ? Math.round(c.declined / c.contacted * 100) : 0;
    return c;
  }
  function statusOf(g) { return (g.status === 'pending' && !g.sentCount) ? 'unsent' : g.status; }
  const LABEL = { confirmed: '✓ Confirmed', declined: '✕ Declined', pending: '◷ Pending', unsent: 'Not emailed' };

  function renderAll() {
    const ev = settings.eventName || 'Attendance';
    $('brandEvent').textContent = cfg.url ? ev : 'Not connected';
    $('dashTitle').textContent = ev;
    document.title = ev + ' – RSVP Desk';
    const c = counts();
    $('dashSub').textContent = cfg.url
      ? (c.total ? c.total + ' people on the list. Updates automatically every 15 seconds.' : 'No one on the list yet. Go to “Add people” to start.')
      : 'Connect your backend in Setup to get started.';
    $('sContacted').textContent = c.contacted;
    $('sConfirmed').textContent = c.confirmed;
    $('sDeclined').textContent = c.declined;
    $('sPending').textContent = c.pending;
    $('sRate').textContent = c.rate + '%';
    $('barYes').style.width = c.rate + '%';
    $('barNo').style.width = c.declRate + '%';
    $('fAll').textContent = c.total; $('fConfirmed').textContent = c.confirmed;
    $('fDeclined').textContent = c.declined; $('fPending').textContent = c.pending; $('fUnsent').textContent = c.unsent;
    $('resendBtn').textContent = 'Resend to pending (' + c.pending + ')';
    $('resendBtn').disabled = !c.pending;
    renderTable();
    renderSummary(c);
    if (!$('view-email').hidden) renderSendInfo();
  }

  function renderTable() {
    const q = $('search').value.trim().toLowerCase();
    const rows = guests
      .filter(g => filter === 'all' || statusOf(g) === filter)
      .filter(g => !q || fullName(g).toLowerCase().includes(q) || String(g.email).toLowerCase().includes(q))
      .sort((a, b) => fullName(a).localeCompare(fullName(b)));
    const tb = $('guestRows'); tb.textContent = '';
    if (!rows.length) {
      tb.append(el('tr', { class: 'empty-row' }, el('td', { colspan: '6', text: guests.length ? 'No one matches this view.' : 'Your guest list is empty.' })));
      return;
    }
    rows.forEach(g => {
      const st = statusOf(g);
      const sel = el('select', { class: 'mini', 'aria-label': 'Change status for ' + fullName(g), title: 'Set status manually' },
        el('option', { value: '', text: 'Set…' }),
        el('option', { value: 'confirmed', text: 'Confirmed' }),
        el('option', { value: 'declined', text: 'Declined' }),
        el('option', { value: 'pending', text: 'Pending' }));
      sel.addEventListener('change', async () => {
        if (!sel.value) return;
        try { await api('setStatus', { id: g.id, status: sel.value }); toast('Status updated'); sync(true); }
        catch (e) { toast(e.message); }
      });
      const edit = el('button', { class: 'icon-btn', title: 'Edit', 'aria-label': 'Edit ' + fullName(g), onclick: () => editGuest(g) }, '✎');
      const del = el('button', { class: 'icon-btn', title: 'Remove', 'aria-label': 'Remove ' + fullName(g), onclick: () => removeGuest(g) }, '🗑');
      tb.append(el('tr', null,
        el('td', { text: fullName(g) || '(no name)' }),
        el('td', { class: 'email', text: g.email }),
        el('td', null, el('span', { class: 'pill ' + st, text: LABEL[st] })),
        el('td', { class: 'num', text: fmt(g.respondedAt) }),
        el('td', { class: 'num', text: String(g.sentCount || 0) + (g.lastSentAt ? ' · last ' + fmt(g.lastSentAt) : '') }),
        el('td', null, el('div', { class: 'row-actions' }, sel, edit, del))
      ));
    });
  }

  async function editGuest(g) {
    const first = prompt('First name', g.firstName); if (first === null) return;
    const last = prompt('Last name', g.lastName); if (last === null) return;
    const email = prompt('Email', g.email); if (email === null) return;
    try { await api('updateGuest', { guest: { id: g.id, firstName: first, lastName: last, email } }); toast('Saved'); sync(true); }
    catch (e) { toast(e.message); }
  }
  async function removeGuest(g) {
    if (!confirm('Remove ' + (fullName(g) || g.email) + ' from the list? Their response link will stop working.')) return;
    try { await api('removeGuests', { ids: [g.id] }); toast('Removed'); sync(true); }
    catch (e) { toast(e.message); }
  }

  function renderSummary(c) {
    if (!c.total) { $('summaryText').textContent = 'No data yet.'; return; }
    const last = guests.map(g => g.respondedAt).filter(Boolean).sort().pop();
    let s = c.contacted + ' of ' + c.total + ' people have been emailed. ' +
      c.confirmed + ' confirmed (' + c.rate + '% of those contacted), ' +
      c.declined + ' declined, and ' + c.pending + ' haven’t replied yet.';
    if (c.unsent) s += ' ' + c.unsent + ' haven’t been emailed.';
    if (last) s += ' Latest response: ' + fmt(last) + '.';
    $('summaryText').textContent = s;
  }

  document.querySelectorAll('.filters button').forEach(b => b.addEventListener('click', () => {
    filter = b.dataset.f;
    document.querySelectorAll('.filters button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    renderTable();
  }));
  $('search').addEventListener('input', renderTable);
  $('refreshBtn').addEventListener('click', () => sync(false).then(() => toast('Up to date')));

  $('resendBtn').addEventListener('click', async () => {
    const targets = guests.filter(g => g.sentCount > 0 && g.status === 'pending');
    if (!targets.length) return;
    if (!confirm('Send a reminder to ' + targets.length + ' people who haven’t replied?\n\nAnyone emailed in the last hour is skipped automatically.')) return;
    $('resendBtn').disabled = true;
    try {
      const r = await api('send', { ids: targets.map(g => g.id), mode: 'resend', baseUrl: cfg.url });
      toast(sendSummary(r));
    } catch (e) { toast(e.message); }
    sync(true);
  });

  /* ---------------- export ---------------- */
  $('exportBtn').addEventListener('click', () => {
    if (!window.XLSX) { toast('Excel export is still loading. Try again in a moment.'); return; }
    if (!guests.length) { toast('Nothing to export yet.'); return; }
    const rows = guests.slice().sort((a, b) => fullName(a).localeCompare(fullName(b))).map(g => ({
      'First name': g.firstName, 'Last name': g.lastName, 'Email': g.email,
      'Attendance status': LABEL[statusOf(g)].replace(/^[✓✕◷]\s/, ''),
      'Responded at': g.respondedAt ? new Date(g.respondedAt).toLocaleString() : '',
      'Emails sent': g.sentCount || 0,
      'Last emailed': g.lastSentAt ? new Date(g.lastSentAt).toLocaleString() : ''
    }));
    const c = counts();
    const summary = [
      { Item: 'Event', Value: settings.eventName || '' },
      { Item: 'People on list', Value: c.total },
      { Item: 'Contacted', Value: c.contacted },
      { Item: 'Confirmed', Value: c.confirmed },
      { Item: 'Declined', Value: c.declined },
      { Item: 'No reply', Value: c.pending },
      { Item: 'Not emailed', Value: c.unsent },
      { Item: 'Confirmation rate', Value: c.rate + '%' },
      { Item: 'Exported', Value: new Date().toLocaleString() }
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 16 }, { wch: 18 }, { wch: 34 }, { wch: 18 }, { wch: 20 }, { wch: 12 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Summary');
    const safe = (settings.eventName || 'attendance').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-');
    XLSX.writeFile(wb, safe + '-attendance.xlsx');
  });

  /* ---------------- import & name parsing ---------------- */
  function stripAccents(s) { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function tidyCase(s) {
    // Only fix ALL CAPS / all lower; leave mixed case (e.g. McDonald) alone
    if (s === s.toUpperCase() || s === s.toLowerCase()) {
      return s.toLowerCase().replace(/(^|[\s\-'])([a-zà-ÿ])/g, (m, p, c) => p + c.toUpperCase());
    }
    return s;
  }
  function emailPart(s) {
    return stripAccents(s).replace(/['’`]/g, '').replace(/[^A-Za-z\s\-]/g, '').trim().replace(/\s+/g, '-');
  }
  function makeEmail(first, last) {
    const f = emailPart(first), l = emailPart(last);
    if (!f || !l) return '';
    return f + '.' + l + '@' + DOMAIN;
  }
  function splitFull(raw) {
    let s = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!s) return null;
    if (s.includes(',')) { const [last, first] = s.split(',').map(x => x.trim()); s = (first + ' ' + last).trim(); }
    const parts = s.split(' ');
    return { first: tidyCase(parts[0]), last: tidyCase(parts.slice(1).join(' ')) };
  }

  function rowsToPeople(rows) {
    rows = rows.map(r => (r || []).map(c => String(c == null ? '' : c).trim())).filter(r => r.some(Boolean));
    if (!rows.length) return [];
    const head = rows[0].map(h => h.toLowerCase());
    let iFirst = head.findIndex(h => /^(first|given|pr[ée]nom)/.test(h) || h === 'first name' || h === 'firstname');
    let iLast = head.findIndex(h => /^(last|surname|family|nom$)/.test(h) || h === 'last name' || h === 'lastname');
    let iFull = head.findIndex(h => /(full )?name|^nom complet|student/.test(h) && !/first|last|sur/.test(h));
    const hasHeader = iFirst > -1 || iLast > -1 || iFull > -1;
    const body = hasHeader ? rows.slice(1) : rows;
    const out = [];
    body.forEach(r => {
      let p;
      if (iFirst > -1 && iLast > -1) p = { first: tidyCase(r[iFirst] || ''), last: tidyCase(r[iLast] || '') };
      else if (iFull > -1) p = splitFull(r[iFull]);
      else if (!hasHeader && r.filter(Boolean).length >= 2 && !r[0].includes(' ') && !r[1].includes('@')) p = { first: tidyCase(r[0]), last: tidyCase(r[1]) };
      else p = splitFull(r.find(Boolean));
      if (p && (p.first || p.last)) out.push(p);
    });
    return out;
  }

  function addToDraft(people) {
    people.forEach(p => draft.push({ uid: Math.random().toString(36).slice(2), first: p.first, last: p.last, email: makeEmail(p.first, p.last), emailEdited: false }));
    renderDraft();
    $('draftPanel').hidden = false;
    $('draftPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function draftIssues() {
    const onList = new Set(guests.map(g => String(g.email).toLowerCase()));
    const seen = {};
    draft.forEach(d => { const k = d.email.toLowerCase(); if (k) seen[k] = (seen[k] || 0) + 1; });
    const nameSeen = {};
    draft.forEach(d => { const k = (d.first + ' ' + d.last).toLowerCase(); nameSeen[k] = (nameSeen[k] || 0) + 1; });
    return draft.map(d => {
      const list = [];
      const k = d.email.toLowerCase();
      if (!d.email) list.push(['err', 'Missing email']);
      else if (!isEmail(d.email)) list.push(['err', 'Invalid email']);
      if (k && seen[k] > 1) list.push(['err', 'Duplicate']);
      if (k && onList.has(k)) list.push(['err', 'Already on list']);
      if (!d.first || !d.last) list.push(['warn', 'Missing name']);
      if (nameSeen[(d.first + ' ' + d.last).toLowerCase()] > 1 && !(k && seen[k] > 1)) list.push(['warn', 'Same name twice']);
      if (/\s|-/.test(d.last) && !d.emailEdited) list.push(['warn', 'Check last name']);
      if (d.email && isEmail(d.email) && !k.endsWith('@' + DOMAIN)) list.push(['warn', 'Not ESCP']);
      return list;
    });
  }

  function renderDraft() {
    const issues = draftIssues();
    const tb = $('draftRows'); tb.textContent = '';
    let bad = 0, warn = 0;
    draft.forEach((d, i) => {
      const iss = issues[i];
      if (iss.some(x => x[0] === 'err')) bad++; else if (iss.length) warn++;
      const fi = el('input', { value: d.first, 'aria-label': 'First name' });
      const li = el('input', { value: d.last, 'aria-label': 'Last name' });
      const ei = el('input', { value: d.email, 'aria-label': 'Email', type: 'email' });
      const regen = () => { if (!d.emailEdited) { d.email = makeEmail(d.first, d.last); ei.value = d.email; } };
      fi.addEventListener('input', () => { d.first = fi.value.trim(); regen(); });
      li.addEventListener('input', () => { d.last = li.value.trim(); regen(); });
      ei.addEventListener('input', () => { d.email = ei.value.trim(); d.emailEdited = true; });
      [fi, li, ei].forEach(inp => inp.addEventListener('change', renderDraft));
      const cell = el('td', null, iss.length ? iss.map(x => el('span', { class: 'issue ' + x[0], text: x[1] }), ' ') : el('span', { class: 'issue ok', text: 'OK' }));
      tb.append(el('tr', null, el('td', null, fi), el('td', null, li), el('td', null, ei), cell,
        el('td', null, el('button', { class: 'icon-btn', 'aria-label': 'Remove row', onclick: () => { draft.splice(i, 1); renderDraft(); if (!draft.length) $('draftPanel').hidden = true; } }, '✕'))));
    });
    const ready = draft.length - bad;
    $('draftTitle').textContent = 'Review ' + draft.length + ' ' + (draft.length === 1 ? 'person' : 'people');
    $('draftNote').textContent = (bad ? bad + ' need fixing before they can be added (red). ' : '') +
      (warn ? warn + ' worth a quick check (yellow), e.g. names with more than one last name. ' : '') +
      (ready ? ready + ' ready to add.' : '');
    $('draftSave').textContent = 'Add ' + ready + ' to guest list';
    $('draftSave').disabled = !ready;
  }

  $('fileInput').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (!window.XLSX) { toast('File reader is still loading. Try again in a moment.'); return; }
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const people = rowsToPeople(XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }));
      if (!people.length) toast('No names found in that file.'); else { addToDraft(people); toast('Found ' + people.length + ' names'); }
    } catch (err) { toast('Couldn’t read that file. Save it as .xlsx or .csv and try again.'); }
    e.target.value = '';
  });
  $('pasteBtn').addEventListener('click', () => {
    const lines = $('pasteBox').value.split(/\r?\n/).map(l => l.includes('\t') ? l.split('\t') : [l]);
    const people = rowsToPeople(lines);
    if (!people.length) { toast('Paste at least one name first.'); return; }
    addToDraft(people); $('pasteBox').value = '';
  });
  $('draftClear').addEventListener('click', () => { draft = []; $('draftPanel').hidden = true; });
  $('draftSave').addEventListener('click', async () => {
    const issues = draftIssues();
    const ok = draft.filter((d, i) => !issues[i].some(x => x[0] === 'err'));
    if (!ok.length) return;
    $('draftSave').disabled = true;
    try {
      const r = await api('addGuests', { guests: ok.map(d => ({ firstName: d.first, lastName: d.last, email: d.email })) });
      const keep = new Set(draft.filter((d, i) => issues[i].some(x => x[0] === 'err')).map(d => d.uid));
      draft = draft.filter(d => keep.has(d.uid));
      toast('Added ' + r.added + (r.skipped ? ', skipped ' + r.skipped : ''));
      await sync(true);
      if (draft.length) renderDraft(); else { $('draftPanel').hidden = true; show('dashboard'); }
    } catch (e) { toast(e.message); $('draftSave').disabled = false; }
  });

  /* ---------------- email settings, preview, send ---------------- */
  const FIELDS = { setEvent: 'eventName', setSubject: 'subject', setMessage: 'message', setClosing: 'closing', setOrg: 'organisation', setReplyTo: 'replyTo' };
  function fillSettingsForm() { Object.entries(FIELDS).forEach(([id, k]) => { $(id).value = settings[k] || ''; }); }
  function formSettings() { const s = {}; Object.entries(FIELDS).forEach(([id, k]) => { s[k] = $(id).value; }); return s; }
  Object.keys(FIELDS).forEach(id => $(id).addEventListener('input', renderPreview));

  function fill(t, g, s) {
    return String(t || '').replace(/\{firstName\}/g, g.firstName).replace(/\{lastName\}/g, g.lastName)
      .replace(/\{eventName\}/g, s.eventName || '').replace(/\{organisation\}/g, s.organisation || '');
  }
  function renderPreview() {
    const s = formSettings();
    const g = guests[0] || { firstName: 'John', lastName: 'Smith', email: 'John.Smith@' + DOMAIN };
    const p = $('preview'); p.textContent = '';
    p.append(
      el('div', { class: 'subj', text: 'Subject: ' + fill(s.subject, g, s) }),
      ...fill(s.message, g, s).split(/\n{2,}/).map(t => el('p', { text: t })),
      el('div', { class: 'btns' },
        el('span', { style: 'background:#17803D', text: 'YES, I WILL ATTEND' }),
        el('span', { style: 'background:#B42318', text: 'NO, I CANNOT ATTEND' })),
      ...fill(s.closing, g, s).split(/\n{2,}/).map(t => el('p', { text: t }))
    );
  }
  $('saveSettings').addEventListener('click', async () => {
    try { const r = await api('saveSettings', { settings: formSettings() }); settings = r.settings; setStatus($('settingsStatus'), 'Saved.', 'ok'); renderAll(); }
    catch (e) { setStatus($('settingsStatus'), e.message, 'err'); }
  });
  $('testBtn').addEventListener('click', async () => {
    const to = $('testTo').value.trim();
    if (!isEmail(to)) { setStatus($('testStatus'), 'Enter your email address first.', 'err'); return; }
    try {
      await api('saveSettings', { settings: formSettings() });
      await api('sendTest', { to, baseUrl: cfg.url });
      setStatus($('testStatus'), 'Test sent to ' + to + '. Its buttons open a test page and record nothing.', 'ok');
    } catch (e) { setStatus($('testStatus'), e.message, 'err'); }
  });

  function unsentGuests() { return guests.filter(g => !g.sentCount && g.status === 'pending'); }
  function renderSendInfo() {
    const n = unsentGuests().length;
    const quota = typeof cfg.quota === 'number' ? ' Your account can send about ' + cfg.quota + ' more emails today.' : '';
    $('sendInfo').textContent = n
      ? n + (n === 1 ? ' person hasn’t' : ' people haven’t') + ' been emailed yet. Each gets their own email with personal YES/NO links. People already emailed are never emailed twice from here.' + quota
      : 'Everyone on the list has already been emailed. Use “Resend to pending” on the dashboard for reminders.';
    $('approveLabel').textContent = 'I’ve checked the preview and want to email ' + n + (n === 1 ? ' person.' : ' people.');
    $('approveBox').disabled = !n;
    if (!n) $('approveBox').checked = false;
    $('sendBtn').disabled = !n || !$('approveBox').checked;
    $('sendBtn').textContent = 'Send ' + n + ' email' + (n === 1 ? '' : 's');
  }
  $('approveBox').addEventListener('change', renderSendInfo);
  function sendSummary(r) {
    let s = 'Sent ' + r.sent + (r.skipped ? ', skipped ' + r.skipped + ' already emailed' : '');
    if (r.failed && r.failed.length) s += ', ' + r.failed.length + ' failed';
    if (r.stoppedForQuota) s += '. Daily email limit reached, send the rest tomorrow';
    if (r.stoppedForTime) s += '. Stopped to stay within the time limit, press send again for the rest';
    return s + '.';
  }
  $('sendBtn').addEventListener('click', async () => {
    const list = unsentGuests();
    if (!list.length || !$('approveBox').checked) return;
    if (!confirm('Send the attendance email to ' + list.length + ' people now?')) return;
    $('sendBtn').disabled = true; $('approveBox').checked = false;
    setStatus($('sendStatus'), 'Sending… keep this page open.');
    try {
      await api('saveSettings', { settings: formSettings() });
      const r = await api('send', { ids: list.map(g => g.id), mode: 'initial', baseUrl: cfg.url });
      setStatus($('sendStatus'), sendSummary(r) + (r.failed && r.failed.length ? ' Failed: ' + r.failed.map(f => f.email).join(', ') : ''), r.failed && r.failed.length ? 'err' : 'ok');
      cfg.quota = r.quota;
    } catch (e) { setStatus($('sendStatus'), e.message, 'err'); }
    await sync(true);
    renderSendInfo();
  });

  /* ---------------- setup ---------------- */
  $('connectBtn').addEventListener('click', async () => {
    const url = $('cfgUrl').value.trim(), key = $('cfgKey').value.trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(url)) { setStatus($('connectStatus'), 'The Web App URL should start with https://script.google.com/macros/s/ and end with /exec.', 'err'); return; }
    if (!key) { setStatus($('connectStatus'), 'Paste your admin key.', 'err'); return; }
    cfg = { url, key }; setStatus($('connectStatus'), 'Connecting…');
    try {
      const r = await api('ping');
      saveCfg();
      setStatus($('connectStatus'), 'Connected. Emails will be sent from ' + r.account + '.', 'ok');
      await sync(false); startPolling();
    } catch (e) { setStatus($('connectStatus'), e.message, 'err'); }
  });
  $('disconnectBtn').addEventListener('click', () => {
    if (!confirm('Forget the connection on this device? Your data stays safe in the Google Sheet.')) return;
    cfg = {}; saveCfg(); try { localStorage.removeItem(CFG_KEY); } catch (e) {}
    guests = []; settings = {}; clearInterval(pollTimer); setLive(false); renderAll();
    $('cfgUrl').value = ''; $('cfgKey').value = ''; setStatus($('connectStatus'), 'Forgotten.');
  });

  /* ---------------- start ---------------- */
  renderAll();
  const start = (location.hash || '').slice(1);
  if (cfg.url && cfg.key) { show(['dashboard', 'import', 'email', 'setup'].includes(start) ? start : 'dashboard'); sync(false); startPolling(); }
  else show('setup');
})();
