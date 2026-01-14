// Build: 2026-01-12-v6
try { window.KBWG_BRANDS_BUILD = '2026-01-12-v6'; console.info('[KBWG] KBWG_BRANDS_BUILD ' + window.KBWG_BRANDS_BUILD); } catch(e) {}

// Resolve URLs correctly when Weglot serves pages under /en/ (or when hosted under a subpath, e.g. GitHub Pages).
// If you fetch("data/...") from /en/page.html the browser will request /en/data/... (404). We normalize to the true site base.
function __kbwgSiteBaseFromScript(scriptName) {
  try {
    var src = '';
    try { src = (document.currentScript && document.currentScript.src) ? document.currentScript.src : ''; } catch (e) { src = ''; }
    if (!src) {
      // Fallback: find the script tag by name
      var scripts = document.getElementsByTagName('script');
      for (var i = scripts.length - 1; i >= 0; i--) {
        var ssrc = scripts[i] && scripts[i].src ? String(scripts[i].src) : '';
        if (ssrc.indexOf(scriptName) !== -1) { src = ssrc; break; }
      }
    }
    if (!src) return '/';

    var u = new URL(src, location.href);
    var p = u.pathname || '/';
    var idx = p.indexOf('/assets/js/');
    var base = idx >= 0 ? p.slice(0, idx) : p.replace(/\/[\w\-.]+$/, '');
    base = base.replace(/\/+$/, '');

    // Strip language segment at the end (e.g. /en, /he) so data files resolve to the real site root.
    var parts = base.split('/').filter(Boolean);
    var langs = { en: 1, he: 1, iw: 1, ar: 1, fr: 1, es: 1, de: 1, ru: 1 };
    if (parts.length && langs[parts[parts.length - 1]]) parts.pop();

    return '/' + parts.join('/');
  } catch (e) {
    return '/';
  }
}

function __kbwgResolveFromSiteBase(relPath, scriptName) {
  try {
    if (!relPath) return relPath;
    var p = String(relPath);
    if (/^https?:\/\//i.test(p)) return p;

    // Trim leading ./
    p = p.replace(/^\.\//, '');

    var base = __kbwgSiteBaseFromScript(scriptName) || '/';
    if (base === '/') return '/' + p.replace(/^\//, '');
    return base + '/' + p.replace(/^\//, '');
  } catch (e) {
    return relPath;
  }
}

/*
  Brands pages (intl + israel) JSON loader + renderer.
  Works on GitHub Pages (no build step).

  HTML requirements:
    - A container element with id="brandGrid" and data-json="data/xxx.json"
    - Controls (optional but supported):
        #brandSearch (search)
        #brandCategoryFilter (category select)
        #brandPriceFilter (price tier select)
        #brandVeganOnly (checkbox)
    - A count element: [data-brands-count]

  Data format (array of objects):
    {
      name: string,
      website?: string,
      amazonUk?: string,
      amazonUs?: string,
      categories?: string[],
      badges?: string[],
      vegan?: boolean,
      priceTier?: number (1..5)
    }

  Notes:
    - If priceTier is missing, we infer it from categories (intl keys) or default to 3.
    - Card click opens Amazon (prefer UK) if available; otherwise opens website.
*/
(function () {
  'use strict';

  var PT = (window.KBWGPriceTier || {});

  var CAT_LABELS_INTL = {
    'baby-child': 'תינוקות וילדים',
    'body-care': 'טיפוח הגוף',
    'deodorant': 'דאודורנט',
    'skincare': 'טיפוח עור',
    'cleaning': 'ניקיון',
    'cosmetics': 'קוסמטיקה',
    'curly-hair': 'שיער מתולתל',
    'eyes': 'עיניים',
    'hair-color': 'צבע לשיער',
    'haircare': 'טיפוח שיער',
    'luxury-care': 'טיפוח יוקרתי',
    'mens-care': 'טיפוח לגברים',
    'nails': 'ציפורניים',
    'natural-beauty': 'יופי טבעי',
    'natural-care': 'טיפוח טבעי',
    'natural-skin': 'טיפוח עור טבעי',
    'paper': 'נייר',
    'wipes': 'מגבונים',
    'pet-care': 'טיפוח לחיות מחמד',
    'soap': 'סבון',
    'soap-bars': 'סבון מוצק',
    'sun': 'הגנה מהשמש',
    'tanning': 'שיזוף',
    'tattoo-care': 'טיפול בקעקועים',
    'wellness': 'וולנס'
  };

  var CAT_PRICE_TIER = {
    'paper': 1,
    'wipes': 1,
    'cleaning': 1,
    'soap': 2,
    'soap-bars': 2,
    'baby-child': 2,
    'deodorant': 2,
    'body-care': 3,
    'skincare': 3,
    'cosmetics': 3,
    'haircare': 3,
    'curly-hair': 3,
    'eyes': 3,
    'hair-color': 3,
    'mens-care': 3,
    'nails': 3,
    'natural-beauty': 3,
    'natural-care': 3,
    'natural-skin': 3,
    'pet-care': 3,
    'sun': 3,
    'tanning': 3,
    'tattoo-care': 3,
    'wellness': 4,
    'luxury-care': 5
  };

  function norm(s) {
    return String(s || '').toLowerCase().trim();
  }

  function uniq(arr) {
    var seen = Object.create(null);
    var out = [];
    (arr || []).forEach(function (x) {
      var k = String(x || '').trim();
      if (!k) return;
      if (seen[k]) return;
      seen[k] = 1;
      out.push(k);
    });
    return out;
  }

  function inferTierFromCategories(cats) {
    var tiers = [];
    (cats || []).forEach(function (k) {
      var t = CAT_PRICE_TIER[k];
      if (t) tiers.push(t);
    });
    if (!tiers.length) return 3;
    var sum = tiers.reduce(function (a, b) { return a + b; }, 0);
    var avg = sum / tiers.length;
    var r = Math.round(avg);
    return Math.max(1, Math.min(5, r));
  }

  function inferTierIsrael(cats) {
    // Light heuristic from Hebrew category labels.
    var label = (cats && cats[0]) ? String(cats[0]) : '';
    if (!label) return 3;
    if (label.indexOf('תינוק') !== -1) return 2;
    if (label.indexOf('בישום') !== -1 || label.indexOf('בושם') !== -1) return 4;
    if (label.indexOf('איפור') !== -1) return 3;
    if (label.indexOf('שיער') !== -1) return 3;
    if (label.indexOf('רחצה') !== -1 || label.indexOf('גוף') !== -1) return 3;
    if (label.indexOf('טיפוח') !== -1) return 3;
    return 3;
  }

  function bestAmazonLink(b) {
    return b.amazonUk || b.amazonUs || null;
  }

  function stopLinkPropagation(el) {
    el.addEventListener('click', function (e) {
      e.stopPropagation();
    });
  }

  function logoTextFromName(name) {
    var s = String(name || '').trim();
    if (!s) return '•';
    // take first visible char
    return s[0].toUpperCase();
  }

  function labelForCategories(pageKind, cats) {
    if (!cats || !cats.length) return '';
    if (pageKind === 'intl') {
      var labels = cats.map(function (k) { return CAT_LABELS_INTL[k] || k; });
      return labels.join(' / ');
    }
    // israel: cats are already labels
    return cats.join(' / ');
  }

  function buildPriceSelect(selectEl) {
    if (!selectEl) return;

    // מחיר filter UX: selecting $$ should show brands up to that tier (<=),
    // not only the exact tier.
    var prev = String(selectEl.value || '');

    // Rebuild options deterministically (avoid duplicates / partial lists)
    selectEl.innerHTML = '';

    var all = document.createElement('option');
    all.value = '';
    all.textContent = 'כל הרמות';
    selectEl.appendChild(all);

    for (var t = 1; t <= 5; t++) {
      var op = document.createElement('option');
      op.value = String(t);
      op.textContent = '$'.repeat(t) + ' ומטה';
      selectEl.appendChild(op);
    }

    // Restore previous selection if possible
    selectEl.value = prev;
    if (String(selectEl.value || '') !== prev) {
      selectEl.value = '';
    }
  }


  function buildCategorySelectIfEmpty(selectEl, brands, pageKind) {
    if (!selectEl) return;
    // Intl page already contains a curated list in HTML.
    if (pageKind === 'intl') return;
    if (selectEl.options && selectEl.options.length > 0) return;

    var cats = [];
    brands.forEach(function (b) {
      (b.categories || []).forEach(function (c) {
        cats.push(c);
      });
    });
    cats = uniq(cats).sort(function (a, b) {
      return String(a).localeCompare(String(b), 'he');
    });

    var all = document.createElement('option');
    all.value = '';
    all.textContent = 'כל הקטגוריות';
    selectEl.appendChild(all);

    cats.forEach(function (c) {
      var op = document.createElement('option');
      op.value = c;
      op.textContent = c;
      selectEl.appendChild(op);
    });
  }

  function createBrandCard(brand, pageKind) {
    var article = document.createElement('article');
    article.className = 'brandCard';

    var cats = Array.isArray(brand.categories) ? brand.categories.slice() : [];
    var tier = Number(brand.priceTier);
    if (!(tier >= 1 && tier <= 5)) {
      tier = pageKind === 'intl' ? inferTierFromCategories(cats) : inferTierIsrael(cats);
    }

    article.setAttribute('data-price-tier', String(tier));
    if (cats.length) article.setAttribute('data-categories', cats.join(','));

    var badges = Array.isArray(brand.badges) ? brand.badges.slice() : [];
    // Remove any "מאומת" badge if it exists
    badges = badges.filter(function (x) { return String(x).indexOf('מאומת') === -1; });

    var vegan = Boolean(brand.vegan);
    if (!vegan) {
      vegan = badges.some(function (b) {
        var t = String(b || '').toLowerCase();
        return t.indexOf('טבעוני') !== -1 || t.indexOf('vegan') !== -1;
      });
    }

    var targetUrl = bestAmazonLink(brand) || brand.website || '#';
    if (targetUrl && targetUrl !== '#') {
      article.tabIndex = 0;
      article.setAttribute('role', 'link');
      article.setAttribute('aria-label', 'פתחי ' + (brand.name || 'מותג'));
      article.addEventListener('click', function () {
        window.open(targetUrl, '_blank', 'noopener');
      });
      article.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          window.open(targetUrl, '_blank', 'noopener');
        }
      });
    }

    // מותג top wrapper
    var top = document.createElement('div');
    top.className = 'brandTop';

    // Header
    var header = document.createElement('div');
    header.className = 'brandHeader';

    var logo = document.createElement('div');
    logo.className = 'brandLogo brandLogo--fallback';
    logo.textContent = logoTextFromName(brand.name);

    var titleBlock = document.createElement('div');
    titleBlock.className = 'brandTitleBlock';

    var nameLink = document.createElement('a');
    nameLink.className = 'brandName';
    nameLink.textContent = brand.name || '';
    nameLink.href = brand.website || targetUrl || '#';
    nameLink.target = '_blank';
    nameLink.rel = 'nofollow noopener';
    stopLinkPropagation(nameLink);

    var catsInline = document.createElement('div');
    catsInline.className = 'brandCatsInline';
    catsInline.textContent = labelForCategories(pageKind, cats);

    titleBlock.appendChild(nameLink);
    if (catsInline.textContent) titleBlock.appendChild(catsInline);

    header.appendChild(logo);
    header.appendChild(titleBlock);

    // מחיר tier UI
    if (PT && typeof PT.renderPriceTier === 'function') {
      var tierEl = PT.renderPriceTier(tier, { size: 'sm' });
      tierEl.classList.add('brandPriceTier');
      header.appendChild(tierEl);
    }

    // Badges row
    var badgesWrap = document.createElement('div');
    badgesWrap.className = 'brandBadges brandBadges--tight';

    function addBadge(text, cls) {
      if (!text) return;
      var s = document.createElement('span');
      s.className = 'brandBadge' + (cls ? (' ' + cls) : '');
      s.textContent = text;
      badgesWrap.appendChild(s);
    }

    // Keep a short, consistent set in compact cards
    // 1) cruelty-free program badge if present
    var prog = badges.find(function (b) {
      var t = String(b || '').toLowerCase();
      return t.indexOf('peta') !== -1 || t.indexOf('leaping') !== -1 || t.indexOf('cruelty') !== -1;
    });
    if (prog) addBadge(prog, 'brandBadge--approved');
    if (vegan) addBadge('טבעוני', 'brandBadge--vegan');

    // Links row
    var links = document.createElement('div');
    links.className = 'brandLinks';

    function addLink(label, url, extraCls) {
      if (!url || url === '#') return;
      var a = document.createElement('a');
      a.className = 'btn small' + (extraCls ? (' ' + extraCls) : '');
      a.href = url;
      a.target = '_blank';
      a.rel = 'nofollow noopener';
      a.textContent = label;
      stopLinkPropagation(a);
      links.appendChild(a);
    }

    addLink('Website', brand.website || null, 'brandLink--site');
    addLink('Amazon UK', brand.amazonUk || null, 'brandLink--amazon');
    addLink('Amazon US', brand.amazonUs || null, 'brandLink--amazon');

    top.appendChild(header);
    if (badgesWrap.childNodes.length) top.appendChild(badgesWrap);
    if (links.childNodes.length) top.appendChild(links);

    article.appendChild(top);

    // חיפוש haystack for filtering
    var hay = [brand.name, labelForCategories(pageKind, cats)].concat(badges).join(' ');
    article.setAttribute('data-search', hay);

    // Filtering attributes
    if (vegan) article.setAttribute('data-vegan', '1');

    return { el: article, tier: tier, cats: cats };
  }

  function initPage() {
    var grid = document.getElementById('brandGrid');
    if (!grid) return;

    var jsonPath = grid.getAttribute('data-json');
    if (!jsonPath) return;

    // Normalize JSON URL so it works under Weglot language paths (/en/...) and under subpaths.
    var jsonUrl = __kbwgResolveFromSiteBase(jsonPath, 'brands-json.js');

    var pageKind = grid.getAttribute('data-kind') || (document.documentElement.classList.contains('page-recommended-brands') ? 'intl' : 'israel');

    var searchInput = document.getElementById('brandSearch');
    var categorySelect = document.getElementById('brandCategoryFilter');
    var priceSelect = document.getElementById('brandPriceFilter');
    var veganInput = document.getElementById('brandVeganOnly');
    var countEl = document.querySelector('[data-brands-count]');

    buildPriceSelect(priceSelect);

    function setCount(n, total) {
      if (!countEl) return;
      if (typeof total === 'number') {
        countEl.textContent = 'מציג ' + n + ' מתוך ' + total;
      } else {
        countEl.textContent = 'מציג ' + n;
      }
    }

    function applyFilters(state) {
      var shown = 0;
      state.items.forEach(function (it) {
        var ok = true;

        if (state.q) {
          var hay = norm(it.el.getAttribute('data-search'));
          if (hay.indexOf(state.q) === -1) ok = false;
        }

        if (ok && state.cat) {
          var cats = (it.el.getAttribute('data-categories') || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
          if (cats.indexOf(state.cat) === -1) {
            // Israel uses label as category; in that case data-categories is label too.
            ok = false;
          }
        }

        if (ok && state.priceTier) {
          var t = Number(it.el.getAttribute('data-price-tier')) || 3;
          // show up to the selected tier (cheap -> expensive)
          if (t > state.priceTier) ok = false;
        }

        if (ok && state.veganOnly) {
          if (it.el.getAttribute('data-vegan') !== '1') ok = false;
        }

        it.el.toggleAttribute('hidden', !ok);
        it.el.setAttribute('aria-hidden', ok ? 'false' : 'true');
        if (ok) shown++;
      });

      setCount(shown, state.items.length);
    }

    function readState(state) {
      state.q = searchInput ? norm(searchInput.value) : '';
      state.cat = categorySelect ? String(categorySelect.value || '').trim() : '';
      state.priceTier = priceSelect ? Number(priceSelect.value || '') : 0;
      state.veganOnly = veganInput ? Boolean(veganInput.checked) : false;
    }

    function bind(state) {
      var handler = function () {
        readState(state);
        applyFilters(state);
      };

      if (searchInput) searchInput.addEventListener('input', handler);
      if (categorySelect) categorySelect.addEventListener('change', handler);
      if (priceSelect) priceSelect.addEventListener('change', handler);
      if (veganInput) veganInput.addEventListener('change', handler);

      // initial
      handler();
    }

    // Load JSON and render
    fetch(jsonUrl, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('Failed to load ' + jsonUrl + ' (from ' + jsonPath + ')');
        return r.json();
      })
      .then(function (brands) {
        brands = Array.isArray(brands) ? brands : [];

        // Ensure normalization
        brands = brands.map(function (b) {
          var out = b || {};
          out.name = String(out.name || '').trim();
          out.categories = Array.isArray(out.categories) ? out.categories.filter(Boolean) : [];
          out.badges = Array.isArray(out.badges) ? out.badges.filter(Boolean) : [];
          return out;
        }).filter(function (b) { return b.name; });

        // Build category select (israel)
        buildCategorySelectIfEmpty(categorySelect, brands, pageKind);

        // מיון default: cheapest tier first (then name)
        if (PT && typeof PT.sortBrandsCheapestFirst === 'function') {
          brands = PT.sortBrandsCheapestFirst(brands);
        } else {
          brands = brands.slice().sort(function (a, b) {
            var ta = Number(a.priceTier) || 3;
            var tb = Number(b.priceTier) || 3;
            if (ta !== tb) return ta - tb;
            return String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' });
          });
        }

        // Render
        grid.innerHTML = '';
        var items = [];
        brands.forEach(function (b) {
          var res = createBrandCard(b, pageKind);
          items.push(res);
          grid.appendChild(res.el);
        });

        // Hide vegan checkbox if none
        try {
          if (veganInput) {
            var anyVegan = items.some(function (it) { return it.el.getAttribute('data-vegan') === '1'; });
            if (!anyVegan) {
              var wrap = veganInput.closest('.brandsVeganControl');
              if (wrap) wrap.style.display = 'none';
            }
          }
        } catch (e) {}

        var state = { items: items, q: '', cat: '', priceTier: 0, veganOnly: false };
        bind(state);
      })
      .catch(function (err) {
        console.error(err);
        // Show a friendly message
        var isFile = false;
        try { isFile = location && location.protocol === 'file:'; } catch (e) { isFile = false; }

        if (isFile) {
          grid.innerHTML = [
            '<div class="infoCard">',
            '<strong>האתר רץ כרגע מקובץ מקומי (file://),</strong> ולכן הדפדפן חוסם טעינת JSON (CORS).',
            '<br>כדי שזה יעבוד מקומית, תריצי שרת קטן (Local Server) ואז תפתחי את האתר דרך <code>http://localhost</code>.',
            '<br><br><strong>Windows:</strong> בתיקייה של הפרויקט הריצי:',
            '<br><code>py -m http.server 8000</code>',
            '<br>ואז פתחי: <code>http://localhost:8000/recommended-brands.html</code>',
            '<br><br>ב־GitHub Pages / אתר אמיתי (https) זה יעבוד בלי בעיה.',
            '</div>'
          ].join('');
        } else {
          grid.innerHTML = '<div class="infoCard">לא הצלחנו לטעון את הרשימה כרגע.</div>';
        }
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPage);
  } else {
    initPage();
  }
})();
