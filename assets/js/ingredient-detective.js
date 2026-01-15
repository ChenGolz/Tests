(function () {
  const input = document.getElementById('qIng');
  const out = document.getElementById('out');
  const hint = document.getElementById('hint');
  const sugs = document.getElementById('sugs');
  const ingList = document.getElementById('ingList');
  const ingAlerts = document.getElementById('ingAlerts');

  if (!input || !out || !hint || !sugs) return;

  // Canonical ingredient list (keys can include English/Hebrew aliases)
  const DB = [
    {
      name: 'Lanolin',
      he: 'לנולין',
      keys: ['lanolin', 'לנולין'],
      status: 'רכיב מן החי',
      why: 'לנולין מופק מצמר כבשים (שומן/שעווה טבעית). אם את מעדיפה להימנע — חפשי חלופות צמחיות או סינתטיות.'
    },
    {
      name: 'Carmine',
      he: 'קרמין',
      keys: ['carmine', 'cochineal', 'קרמין', 'קוכיניל'],
      status: 'רכיב מן החי',
      why: 'קרמין (E120) מופק מחרק הקוכיניל ונמצא לעיתים באיפור ומזון.',
      alt: 'חלופות נפוצות: iron oxides, red lake, beet extract.'
    },
    {
      name: 'Glycerin',
      he: 'גליצרין',
      keys: ['glycerin', 'גליצרין', 'glycerol'],
      status: 'תלוי מקור',
      why: 'גליצרין יכול להיות ממקור צמחי או מן החי. לרוב בתמרוקים הוא צמחי אבל לא תמיד מצוין.',
      alt: 'אם חשוב לך — חפשי “vegetable glycerin” או שאלי את המותג.'
    },
    {
      name: 'Squalene / Squalane',
      he: 'סקוואלן / סקוואלן',
      keys: ['squalene', 'squalane', 'סקוואלן', 'סקוואלן'],
      status: 'תלוי מקור',
      why: 'יכול להגיע מכריש (פחות נפוץ היום) או ממקור צמחי (קנה סוכר/זית).',
      alt: 'חפשי “plant-derived squalane”.'
    }
  ];

  function norm(s) {
    return (s || '')
      .toString()
      .trim()
      .toLowerCase()
      .replace(/["'`.,:;()\[\]{}<>!?]+/g, '')
      .replace(/\s+/g, ' ');
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function displayName(item) {
    const parts = [];
    if (item.name) parts.push(item.name);
    if (item.he) parts.push(item.he);
    return parts.join(' · ');
  }

  function clearUI() {
    out.innerHTML = '';
    sugs.innerHTML = '';
    if (ingAlerts) ingAlerts.innerHTML = '';
  }

  function tokenizeInci(text) {
    const raw = String(text || '');
    return raw
      .split(/[\n,;]+/)
      .map((t) => norm(t))
      .filter(Boolean);
  }

  function renderIngredientAlerts(tokens) {
    if (!ingAlerts) return;
    ingAlerts.innerHTML = '';
    if (!tokens || !tokens.length) return;

    const hits = [];
    tokens.forEach((tok) => {
      for (const item of DB) {
        const keys = (item.keys || []).map(norm).filter(Boolean);
        if (keys.some((k) => k === tok)) {
          hits.push(item);
          break;
        }
      }
    });

    if (!hits.length) {
      const d = document.createElement('div');
      d.className = 'hintText';
      d.textContent = 'לא זוהו דגלי רכיבים מהרשימה הידועה. (זה לא מבטיח טבעונות — תמיד כדאי לבדוק תווית)';
      ingAlerts.appendChild(d);
      return;
    }

    // Deduplicate by name
    const uniq = [];
    const seen = new Set();
    hits.forEach((h) => {
      const k = norm(h.name || h.he || (h.keys && h.keys[0]) || '');
      if (!k || seen.has(k)) return;
      seen.add(k);
      uniq.push(h);
    });

    uniq.forEach((item) => {
      const box = document.createElement('div');
      const st = String(item.status || '');
      const isAnimal = st.includes('מן החי');
      const isAmbig = st.includes('תלוי');
      box.className = 'ingAlertItem ' + (isAnimal ? 'orange' : (isAmbig ? 'red' : ''));
      box.innerHTML = `<strong>${displayName(item)}</strong><div>${escapeHtml(st)}</div>${item.why ? `<div style="margin-top:4px">${escapeHtml(item.why)}</div>` : ''}`;
      ingAlerts.appendChild(box);
    });
  }

  function renderHint(text) {
    hint.textContent = text;
  }

  function renderSuggestions(matches) {
    sugs.innerHTML = '';
    matches.slice(0, 12).forEach((m) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sugBtn';
      btn.textContent = displayName(m.item);
      btn.addEventListener('click', () => {
        // Fill with canonical English name if exists, otherwise first key
        input.value = (m.item.name || m.item.keys[0] || '').toString();
        showDetails(m.item);
      });
      sugs.appendChild(btn);
    });
  }

  function showDetails(item) {
    sugs.innerHTML = '';
    renderHint('');
    out.innerHTML = `
      <article class="resultCard">
        <h3>${displayName(item)}</h3>
        <p><strong>סטטוס:</strong> ${item.status || ''}</p>
        ${item.why ? `<p>${item.why}</p>` : ''}
        ${item.alt ? `<p><strong>חלופות:</strong> ${item.alt}</p>` : ''}
      </article>
    `;
  }

  function findMatches(q) {
    const nq = norm(q);
    if (!nq) return [];

    const scored = [];
    for (const item of DB) {
      const keys = (item.keys || []).map(norm).filter(Boolean);

      let best = Infinity;
      for (const k of keys) {
        if (!k) continue;
        if (k === nq) best = Math.min(best, 0);
        else if (k.startsWith(nq)) best = Math.min(best, 1);
        else if (k.includes(nq)) best = Math.min(best, 2);
      }
      if (best !== Infinity) scored.push({ item, score: best });
    }

    scored.sort((a, b) => a.score - b.score || displayName(a.item).localeCompare(displayName(b.item)));
    return scored;
  }

  function onInput() {
    const raw = input.value || '';
    const q = norm(raw);

    // < 2 chars: don't search; show prompt
    if (q.length < 2) {
      clearUI();
      renderHint('הזינו שתי אותיות לפחות להתחיל');
      return;
    }

    const matches = findMatches(q);

    if (!matches.length) {
      clearUI();
      renderHint('לא נמצאו תוצאות');
      return;
    }

    // If exact match to a key OR exact match to canonical name -> show details.
    const exact = matches.find((m) => {
      const nq = norm(raw);
      return (m.item.keys || []).some((k) => norm(k) === nq) || (m.item.name && norm(m.item.name) === nq);
    });

    if (exact) {
      showDetails(exact.item);
      return;
    }

    // Otherwise show suggestions with full ingredient names (so "lan" won't look like ingredient name)
    out.innerHTML = '';
    renderHint('בחרי רכיב מהרשימה');
    renderSuggestions(matches);
  }

  // --- INCI list scanner (paste full ingredient list) ---
  function splitIngredients(text) {
    return (text || '')
      .toString()
      .split(/[\n,;|]+/g)
      .map((t) => t.trim())
      .filter(Boolean);
  }

  function findByToken(token) {
    const t = norm(token);
    if (!t) return null;
    for (const item of DB) {
      const keys = (item.keys || []).map(norm).filter(Boolean);
      if (keys.some((k) => k === t || k.includes(t) || t.includes(k))) {
        return item;
      }
    }
    return null;
  }

  function renderInciAlerts(text) {
    if (!ingList || !ingAlerts) return;
    const tokens = splitIngredients(text);
    if (!tokens.length) {
      ingAlerts.innerHTML = '';
      return;
    }

    const hits = [];
    for (const tok of tokens) {
      const item = findByToken(tok);
      if (item) hits.push({ tok, item });
    }

    if (!hits.length) {
      ingAlerts.innerHTML = '<div class="ingAlertItem"><strong>לא נמצאו דגלים אדומים</strong><div class="muted">טיפ: עדיין כדאי לבדוק אם המותג מצהיר על מקור צמחי כשכתוב "glycerin"/"squalane" וכו׳.</div></div>';
      return;
    }

    // Deduplicate by canonical name
    const seen = new Set();
    const uniq = [];
    for (const h of hits) {
      const key = norm(h.item.name || h.item.he || h.tok);
      if (seen.has(key)) continue;
      seen.add(key);
      uniq.push(h);
    }

    ingAlerts.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'ingAlerts';

    uniq.slice(0, 20).forEach((h) => {
      const item = h.item;
      const status = String(item.status || '').trim();
      const el = document.createElement('div');
      el.className = 'ingAlertItem';

      // Color code: orange = animal-derived, red = "depends source" (red flag)
      if (status.includes('מן החי')) el.classList.add('orange');
      else if (status.includes('תלוי')) el.classList.add('red');

      el.innerHTML = '<strong>' + displayName(item) + '</strong>' +
        (status ? ('<div class="muted">' + escapeHtml(status) + '</div>') : '') +
        (item.why ? ('<div>' + escapeHtml(item.why) + '</div>') : '');
      wrap.appendChild(el);
    });

    ingAlerts.appendChild(wrap);
  }

  input.addEventListener('input', onInput);
  if (ingList) {
    ingList.addEventListener('input', function () {
      renderInciAlerts(ingList.value);
    });
  }
  // Initial
  clearUI();
  renderHint('הזינו שתי אותיות לפחות להתחיל');
  if (ingList) renderInciAlerts('');
})();
