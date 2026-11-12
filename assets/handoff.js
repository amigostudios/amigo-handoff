/* Amigo hand off: fillable fields saved to a Google Sheet via Apps Script. */
(function () {
  var API = 'https://script.google.com/macros/s/AKfycbwvBlGDkLj3W_x7tkkBHA6_yOlkOMYSq0D7ibmbzF-5zp6_HCx467NAMOktEjikyavq/exec';
  var K = '65_3msr2FMBSXzrQ';
  var REFRESH_MS = 30000, DEBOUNCE_MS = 1200;

  /* ---------- seed (what the page shows before the Sheet answers) ---------- */
  var TBD = '';
  var GROUPS = [
    ['agreement', 'Agreement'],
    ['lease', 'Lease & landlord'],
    ['branding', 'Remove Amigo branding', 'How the studio rebrands is up to Pat and the new partners. All that matters: <strong>Amigo branding comes off everything once Austin leaves.</strong>'],
    ['website', 'Website'],
    ['accounts', 'Accounts & listings to transfer'],
    ['suggested', 'Suggested accounts (Austin, delete what doesn’t fit)'],
    ['money', 'Money & close-out'],
    ['other', 'Anything else']
  ];
  var ITEMS = {
    agreement: [
      ['Write up buyer / seller agreement (simple, plain English)'],
      ['Agree price and payment'],
      ['Sign', '', 'Jan 1, 2027 (proposed)']
    ],
    lease: [
      ['Contact landlord about renewing the lease past May 31, 2027 (new rent, how many years)', '', 'ASAP'],
      ['Talk to landlord (Live Wire) about new lease in Pat’s company name past May 31, 2027'],
      ['Release Austin + past partners (Jeremiah, Beau) from the old lease'],
      ['Sort out the security deposit'],
      ['Rent: get Pat his own login for the rent portal'],
      ['Make Pat the main contact with the landlord'],
      ['Subtenant: confirm sublease continues under the new lease']
    ],
    branding: [
      ['Signage (inside and out)'],
      ['Website (forwards to the new brand, see Website)'],
      ['Google Business Profile, Peerspace, ShareGrid listings'],
      ['Instagram / socials'],
      ['Email, invoices, booking emails, Stripe statement name']
    ],
    website: [
      ['amigostudiosoceanside.com forwards to the new brand’s site (or Bookabl)'],
      ['Short “in-between” page: “Amigo Studios is now [new name], under new ownership” with a button through'],
      ['Lovable site: remix hand off to Pat’s own Lovable account'],
      ['Who keeps the amigostudiosoceanside.com domain, and for how long']
    ],
    accounts: [
      ['ShareGrid: ownership transfer'],
      ['Peerspace: rebrand listing + transfer host account'],
      ['amigostudios.media domain + website'],
      ['hello@amigostudios.media and other @amigostudios.media emails (Google account; Google Ads and booking emails use it)'],
      ['Google Ads: transfer account to Pat'],
      ['Stripe: hand off the account to Pat (or Pat opens his own)'],
      ['Stripe: switch the website’s booking checkout to Pat’s Stripe, then test one booking']
    ],
    suggested: [
      ['Bookabl'], ['Google Business Profile & reviews'], ['Instagram / socials'], ['Studio phone number(s)'],
      ['GoHighLevel (texts)'], ['Innago (subtenant rent)'], ['Mercury / business bank'],
      ['Utilities (SDG&E, internet)'], ['Business insurance']
    ],
    money: [
      ['Final numbers on hand off day (bank balance, bills, prepaid bookings)'],
      ['Take Austin off the LLC (ask CPA about taxes)'],
      ['Austin takes his personal stuff out of the studio (anything left stays with the studio)', 'Austin', 'Jan 15, 2027 (proposed)']
    ],
    other: []
  };
  var SEED = {
    'glance.handoff': 'Jan 15, 2027 (proposed)',
    'glance.lease': 'May 31, 2027',
    'glance.landlord': 'ASAP',
    'glance.partners': TBD,
    'glance.price': 'TBD',
    'glance.signed': 'Jan 1, 2027 (proposed)',
    'glance.branding': 'Feb 1, 2027 (proposed)',
    'glance.accounts': 'Jan 15, 2027 (proposed)',
    'people.01.name': 'Austin Faure', 'people.01.role': 'Current owner (75%), stepping out',
    'people.02.name': 'Pat Lang', 'people.02.role': 'New owner',
    'people.03.name': '', 'people.04.name': '', 'people.05.name': '',
    'tl.01.date': 'ASAP', 'tl.01.text': 'Landlord agrees to renew the lease to Pat',
    'tl.02.date': 'Nov–Dec 2026', 'tl.02.text': 'Agree terms, accounts list ready',
    'tl.03.date': 'Jan 1, 2027', 'tl.03.text': 'Buyer / seller agreement signed',
    'tl.04.date': 'Jan 15, 2027', 'tl.04.text': 'Hand off day: keys, accounts transferred, money',
    'tl.05.date': 'Feb 1, 2027', 'tl.05.text': 'Amigo branding off everything, website forwarding',
    'tl.06.date': 'May 31, 2027', 'tl.06.text': 'Current lease ends (new lease signed before this)',
    'ag.date.austin': 'Jan 15, 2027',
    'ag.brand.agreed': 'The new brand is up to Pat and the new partners. All Amigo branding comes off everything once Austin leaves. amigostudiosoceanside.com forwards to the new brand.'
  };
  Object.keys(ITEMS).forEach(function (g) {
    ITEMS[g].forEach(function (it, i) {
      var p = 'cl.' + g + '.' + (i < 9 ? '0' : '') + (i + 1) + '.';
      SEED[p + 'text'] = it[0]; SEED[p + 'who'] = it[1] || ''; SEED[p + 'by'] = it[2] || ''; SEED[p + 'done'] = '';
    });
  });
  window.HANDOFF_SEED = SEED;

  /* ---------- state ---------- */
  var vals = {};        // key -> {v, t, by}
  var pending = {};     // key -> value (not yet saved)
  var timer = null, saving = false, online = false, loadedOnce = false;
  var LS_NAME = 'amigoHandoffName', LS_CACHE = 'amigoHandoffCache';
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function val(k) { return k in pending ? pending[k] : vals[k] ? vals[k].v : (SEED[k] || ''); }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  function when(t) {
    var d = new Date(t); if (isNaN(d)) return '';
    var now = new Date(), s = (now - d) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    var time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return 'today ' + time;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + time;
  }
  function metaFor(keys) {
    var best = null;
    keys.forEach(function (k) { var m = vals[k]; if (m && m.by && m.by !== 'seed' && (!best || m.t > best.t)) best = m; });
    return best ? best.by + ', ' + when(best.t) : '';
  }

  /* ---------- status pill + name ---------- */
  var pill;
  function status(text, cls) {
    if (!pill) return;
    pill.className = 'ho-pill ' + (cls || '');
    $('.ho-pill-msg', pill).textContent = text;
    var n = ls(LS_NAME);
    $('.ho-pill-name', pill).textContent = n ? 'Editing as ' + n : '';
  }
  function lastEditText() {
    var best = null;
    Object.keys(vals).forEach(function (k) { var m = vals[k]; if (m.by && m.by !== 'seed' && (!best || m.t > best.t)) best = m; });
    return best ? 'Last edit: ' + best.by + ', ' + when(best.t) : 'Up to date';
  }
  var nameSkipped = false;
  function askName(cb) {
    if (ls(LS_NAME) || nameSkipped) return cb && cb();
    if ($('.ho-modal')) return;
    var m = el('div', 'ho-modal', '<form class="ho-card"><button type="button" class="ho-x" aria-label="Close">×</button><div class="kicker">Before you edit</div><h3>Who’s editing?</h3>' +
      '<p>Your name is saved next to what you change, so everyone can see who did what.</p>' +
      '<input name="n" autocomplete="name" placeholder="Your name" required maxlength="40">' +
      '<div class="ho-quick"><button type="button">Austin</button><button type="button">Pat</button></div>' +
      '<button type="submit" class="ho-go">Start editing</button></form>');
    document.body.appendChild(m);
    var f = $('form', m), inp = $('input', m);
    $$('.ho-quick button', m).forEach(function (b) { b.onclick = function () { inp.value = b.textContent; f.requestSubmit ? f.requestSubmit() : f.onsubmit(); }; });
    function skip() { nameSkipped = true; m.remove(); document.removeEventListener('keydown', onKey); if (Object.keys(pending).length) schedule(0); }
    function onKey(e) { if (e.key === 'Escape') skip(); }
    document.addEventListener('keydown', onKey);
    $('.ho-x', m).onclick = skip;
    m.addEventListener('mousedown', function (e) { if (e.target === m) skip(); });
    f.onsubmit = function (e) {
      if (e) e.preventDefault();
      var n = inp.value.trim(); if (!n) return;
      ls(LS_NAME, n); m.remove(); document.removeEventListener('keydown', onKey); status('Saving…', 'busy'); cb && cb(); schedule(0);
    };
    setTimeout(function () { inp.focus(); }, 30);
  }

  /* ---------- network ---------- */
  function load() {
    if (API.indexOf('https://') !== 0) return Promise.reject(new Error('no api'));
    return fetch(API + '?k=' + encodeURIComponent(K) + '&_=' + Date.now(), { redirect: 'follow' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) throw new Error(d.error || 'bad');
        vals = d.values || {}; online = true; loadedOnce = true;
        ls(LS_CACHE, JSON.stringify(vals));
        render();
        if (!Object.keys(pending).length) status(lastEditText(), 'ok');
      });
  }
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(flush, ms == null ? DEBOUNCE_MS : ms); }
  function flush() {
    var keys = Object.keys(pending);
    if (!keys.length || saving) return;
    var name = ls(LS_NAME) || (nameSkipped ? 'Someone' : '');
    if (!name) return askName();
    saving = true; status('Saving…', 'busy');
    var batch = keys.map(function (k) { return { key: k, value: pending[k] }; });
    fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ k: K, by: name, items: batch }) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) throw new Error(d.error || 'bad');
        batch.forEach(function (b) {
          vals[b.key] = { v: b.value, t: d.t, by: name };
          if (pending[b.key] === b.value) delete pending[b.key];
        });
        ls(LS_CACHE, JSON.stringify(vals));
        saving = false; online = true;
        refreshMeta();
        if (Object.keys(pending).length) schedule(300); else status('Saved', 'ok');
        setTimeout(function () { if (!Object.keys(pending).length && !saving) status(lastEditText(), 'ok'); }, 2500);
      })
      .catch(function () { saving = false; status('Not saved yet, retrying…', 'err'); schedule(5000); });
  }
  function change(key, value) {
    if (!online) return;
    pending[key] = value; status('Editing…', 'busy');
    if (!ls(LS_NAME) && !nameSkipped) return askName();
    schedule();
  }

  /* ---------- fields ---------- */
  function grow(t) { if (t.tagName !== 'TEXTAREA' || !t.offsetWidth) return; t.style.height = 'auto'; t.style.height = t.scrollHeight + 2 + 'px'; }
  function growAll() { $$('textarea[data-key]').forEach(grow); }
  function bind(root) {
    $$('[data-key]', root).forEach(function (f) {
      if (f._bound) return; f._bound = true;
      setField(f);
      if (f.type === 'checkbox') {
        f.addEventListener('change', function () { change(f.dataset.key, f.checked ? '1' : ''); var it = f.closest('.ho-item'); if (it) it.classList.toggle('done', f.checked); });
      } else {
        f.addEventListener('input', function () { grow(f); change(f.dataset.key, f.value); });
        f.addEventListener('blur', function () { if (f.dataset.key in pending) schedule(0); });
        f.addEventListener('focus', function () { if (online && !ls(LS_NAME) && !nameSkipped) askName(); });
        if (f.tagName === 'TEXTAREA') f.addEventListener('keydown', function (e) { if (e.key === 'Enter' && f.classList.contains('one')) { e.preventDefault(); f.blur(); } });
      }
    });
  }
  function setField(f) {
    var k = f.dataset.key;
    if (k in pending || document.activeElement === f) return;
    var v = val(k);
    if (f.type === 'checkbox') { f.checked = v === '1'; var it = f.closest('.ho-item'); if (it) it.classList.toggle('done', f.checked); }
    else if (f.value !== v) { f.value = v; }
    f.readOnly = !online; if (f.type === 'checkbox') f.disabled = !online;
    grow(f);
  }
  function refreshMeta() {
    $$('[data-meta]').forEach(function (m) { m.textContent = metaFor(m.dataset.meta.split(' ')); });
  }

  /* ---------- checklist ---------- */
  function ids(prefix, suffix) {
    var all = {}, re = new RegExp('^' + prefix.replace(/\./g, '\\.') + '([^.]+)\\.' + suffix + '$');
    Object.keys(SEED).concat(Object.keys(vals), Object.keys(pending)).forEach(function (k) { var m = k.match(re); if (m) all[m[1]] = 1; });
    return Object.keys(all).sort();
  }
  function newId() { return 'z' + Date.now().toString(36); }
  function itemEl(g, id) {
    var p = 'cl.' + g + '.' + id + '.';
    var li = el('li', 'ho-item');
    li.dataset.id = id;
    li.innerHTML =
      '<label class="ho-check"><input type="checkbox" data-key="' + p + 'done" aria-label="Done"><span></span></label>' +
      '<div class="ho-body">' +
      '<textarea class="ho-text one" rows="1" data-key="' + p + 'text" placeholder="New item…" aria-label="Item"></textarea>' +
      '<div class="ho-sub"><label>Who <input data-key="' + p + 'who" placeholder="—"></label>' +
      '<label>By <input data-key="' + p + 'by" placeholder="—"></label>' +
      '<span class="ho-meta" data-meta="' + ['done', 'text', 'who', 'by'].map(function (s) { return p + s; }).join(' ') + '"></span></div></div>' +
      '<button type="button" class="ho-x" title="Remove item" aria-label="Remove item">×</button>';
    var x = $('.ho-x', li);
    x.onclick = function () {
      if (!online) return;
      if (!x.classList.contains('sure')) { x.classList.add('sure'); x.textContent = 'Remove?'; setTimeout(function () { x.classList.remove('sure'); x.textContent = '×'; }, 3000); return; }
      change(p + 'removed', '1'); li.remove();
    };
    return li;
  }
  function renderGroup(sec) {
    var g = sec.dataset.group, ul = $('ul', sec);
    var list = ids('cl.' + g + '.', 'text').filter(function (id) { return val('cl.' + g + '.' + id + '.removed') !== '1'; });
    var have = $$('.ho-item', ul).map(function (li) { return li.dataset.id; });
    if (have.join() === list.join()) { $$('[data-key]', ul).forEach(setField); return; }
    if (ul.contains(document.activeElement)) return; // don't yank the list out from under a typist
    ul.innerHTML = '';
    list.forEach(function (id) { ul.appendChild(itemEl(g, id)); });
    bind(ul);
  }
  function buildChecklist(root) {
    GROUPS.forEach(function (gr) {
      var sec = el('section', 'ho-group' + (gr[0] === 'suggested' ? ' sub' : ''));
      sec.dataset.group = gr[0];
      sec.innerHTML = (gr[0] === 'suggested' ? '<h4>' : '<h3>') + gr[1] + (gr[0] === 'suggested' ? '</h4>' : '</h3>') +
        (gr[2] ? '<p class="ho-note">' + gr[2] + '</p>' : '') + '<ul class="ho-list"></ul>' +
        '<button type="button" class="ho-add">+ Add item</button>';
      $('.ho-add', sec).onclick = function () {
        if (!online) return;
        var id = newId(), ul = $('ul', sec), li = itemEl(gr[0], id);
        ul.appendChild(li); bind(li);
        var t = $('.ho-text', li); t.focus();
        change('cl.' + gr[0] + '.' + id + '.text', '');
      };
      root.appendChild(sec);
    });
  }

  /* ---------- people ---------- */
  function personRow(id) {
    var p = 'people.' + id + '.', tr = el('tr');
    tr.dataset.id = id;
    [['name', 'Name'], ['role', 'Role'], ['share', 'Share after hand off'], ['contact', 'Contact']].forEach(function (c) {
      var td = el('td'); td.dataset.label = c[1];
      td.innerHTML = '<textarea class="one" rows="1" data-key="' + p + c[0] + '" placeholder="—" aria-label="' + c[1] + '"></textarea>';
      tr.appendChild(td);
    });
    return tr;
  }
  function renderPeople(tb) {
    var list = ids('people.', 'name');
    var have = $$('tr', tb).map(function (r) { return r.dataset.id; });
    if (have.join() === list.join()) { $$('[data-key]', tb).forEach(setField); return; }
    if (tb.contains(document.activeElement)) return;
    tb.innerHTML = ''; list.forEach(function (id) { tb.appendChild(personRow(id)); }); bind(tb);
  }

  /* ---------- timeline ---------- */
  function tlRow(id) {
    var p = 'tl.' + id + '.', r = el('div', 'ho-tl-row');
    r.dataset.id = id;
    r.innerHTML =
      '<textarea class="one ho-tl-date" rows="1" data-key="' + p + 'date" placeholder="Date" aria-label="Date"></textarea>' +
      '<textarea class="one ho-tl-text" rows="1" data-key="' + p + 'text" placeholder="What happens" aria-label="What happens"></textarea>' +
      '<button type="button" class="ho-x" title="Remove date" aria-label="Remove date">×</button>';
    var x = $('.ho-x', r);
    x.onclick = function () {
      if (!online) return;
      if (!x.classList.contains('sure')) { x.classList.add('sure'); x.textContent = 'Remove?'; setTimeout(function () { x.classList.remove('sure'); x.textContent = '×'; }, 3000); return; }
      change(p + 'removed', '1'); r.remove();
    };
    return r;
  }
  function renderTimeline(box) {
    var list = ids('tl.', 'text').filter(function (id) { return val('tl.' + id + '.removed') !== '1'; });
    var have = $$('.ho-tl-row', box).map(function (r) { return r.dataset.id; });
    if (have.join() === list.join()) { $$('[data-key]', box).forEach(setField); return; }
    if (box.contains(document.activeElement)) return;
    box.innerHTML = ''; list.forEach(function (id) { box.appendChild(tlRow(id)); }); bind(box);
  }

  /* ---------- render ---------- */
  function render() {
    $$('.ho-group').forEach(renderGroup);
    var tb = $('#ho-people tbody'); if (tb) renderPeople(tb);
    var tlb = $('#ho-timeline'); if (tlb) renderTimeline(tlb);
    $$('[data-key]').forEach(setField);
    $$('.ho-add').forEach(function (b) { b.hidden = !online; });
    document.body.classList.toggle('ho-readonly', !online);
    refreshMeta();
    requestAnimationFrame(growAll);
  }

  function init() {
    var cl = $('#ho-checklist'); if (cl) buildChecklist(cl);
    var pt = $('#ho-people');
    if (pt) {
      var add = el('button', 'ho-add', '+ Add person'); add.type = 'button';
      add.onclick = function () { if (!online) return; var id = newId(); var r = personRow(id); $('tbody', pt).appendChild(r); bind(r); $('textarea', r).focus(); change('people.' + id + '.name', ''); };
      pt.parentNode.insertBefore(add, pt.nextSibling);
    }
    var tl = $('#ho-timeline');
    if (tl) {
      var addT = el('button', 'ho-add', '+ Add date'); addT.type = 'button';
      addT.onclick = function () { if (!online) return; var id = newId(); var r = tlRow(id); tl.appendChild(r); bind(r); $('textarea', r).focus(); change('tl.' + id + '.text', ''); };
      tl.parentNode.insertBefore(addT, tl.nextSibling);
    }
    pill = el('div', 'ho-pill', '<span class="ho-pill-msg">Loading…</span><button type="button" class="ho-pill-name" title="Change name"></button>');
    $('.ho-pill-name', pill).onclick = function () { try { localStorage.removeItem(LS_NAME); } catch (e) {} askName(function () { status(lastEditText(), 'ok'); }); };
    document.body.appendChild(pill);
    try { vals = JSON.parse(ls(LS_CACHE) || '{}') || {}; } catch (e) { vals = {}; }
    render(); bind(document);
    window.addEventListener('load', growAll); window.addEventListener('resize', growAll);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(growAll);
    load().catch(function () { online = false; render(); status('Can’t reach the sheet right now. Showing the last saved copy, read only.', 'err'); });
    setInterval(function () {
      if (saving || Object.keys(pending).length || document.hidden) return;
      var wasOff = !online;
      load().then(function () { if (wasOff) bind(document); }).catch(function () { if (loadedOnce) status('Offline, retrying…', 'err'); });
    }, REFRESH_MS);
    window.addEventListener('pagehide', function () {
      var keys = Object.keys(pending), name = ls(LS_NAME);
      if (!keys.length || !name || !navigator.sendBeacon) return;
      navigator.sendBeacon(API, new Blob([JSON.stringify({ k: K, by: name, items: keys.map(function (k) { return { key: k, value: pending[k] }; }) })], { type: 'text/plain;charset=utf-8' }));
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
