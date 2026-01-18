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

  // Unified categories – must match the Products page filters.
  var CAT_LABELS = {
    face: 'טיפוח פנים',
    hair: 'שיער',
    body: 'גוף ורחצה',
    makeup: 'איפור',
    fragrance: 'בישום',
    'mens-care': 'גברים',
    baby: 'תינוקות',
    health: 'בריאות'
  };

  // Map legacy/varied categories from JSON into the unified set.
  var INTL_TO_UNIFIED = {
    skincare: 'face',
    'natural-skin': 'face',
    eyes: 'face',

    haircare: 'hair',
    'curly-hair': 'hair',
    'hair-color': 'hair',

    'body-care': 'body',
    deodorant: 'body',
    soap: 'body',
    'soap-bars': 'body',
    sun: 'body',
    tanning: 'body',
    'tattoo-care': 'body',

    cosmetics: 'makeup',
    'makeup tools': 'makeup',
    'makeup tools ': 'makeup',
    nails: 'makeup',

    fragrance: 'fragrance',

    'mens-care': 'mens-care',

    'baby-child': 'baby',

    wellness: 'health',
    health: 'health',
    'personal care': 'health',
    'personal-care': 'health',
    cleaning: 'health',
    paper: 'health',
    wipes: 'health',
    'pet-care': 'health'
  };

  var CAT_PRICE_TIER = {
    face: 3,
    hair: 3,
    body: 3,
    makeup: 3,
    fragrance: 4,
    'mens-care': 3,
    baby: 2,
    health: 2
  };

  function toUnifiedCat(pageKind, raw) {
    var k = String(raw || '').trim();
    if (!k) return '';

    // Already unified?
    if (CAT_LABELS[k]) return k;

    var lower = k.toLowerCase().trim();
    if (CAT_LABELS[lower]) return lower;

    if (pageKind === 'intl') {
      return INTL_TO_UNIFIED[lower] || '';
    }

    // Israel page categories are Hebrew labels; map by keywords.
    var he = k;
    if (he.indexOf('פנים') !== -1 || he.indexOf('עור') !== -1) return 'face';
    if (he.indexOf('שיער') !== -1) return 'hair';
    if (he.indexOf('גוף') !== -1 || he.indexOf('רחצה') !== -1 || he.indexOf('סבון') !== -1 || he.indexOf('דאוד') !== -1) return 'body';
    if (he.indexOf('איפור') !== -1 || he.indexOf('ציפור') !== -1) return 'makeup';
    if (he.indexOf('בישום') !== -1 || he.indexOf('בושם') !== -1 || he.indexOf('בושמי') !== -1) return 'fragrance';
    if (he.indexOf('גבר') !== -1) return 'mens-care';
    if (he.indexOf('תינוק') !== -1 || he.indexOf('ילד') !== -1) return 'baby';
    if (he.indexOf('בריאות') !== -1 || he.indexOf('שיניים') !== -1 || he.indexOf('היגיינ') !== -1 || he.indexOf('וולנס') !== -1) return 'health';
    return '';
  }

  function normalizeCats(pageKind, cats) {
    var out = [];
    (cats || []).forEach(function (c) {
      var u = toUnifiedCat(pageKind, c);
      if (u) out.push(u);
    });
    return uniq(out);
  }

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

  function normalizeCats(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(function (x) { return String(x || '').trim(); }).filter(Boolean);
    if (typeof raw === 'string') {
      // Allow comma / slash separated strings.
      return raw.split(/[,/]/g).map(function (x) { return String(x || '').trim(); }).filter(Boolean);
    }
    // Handle objects like {a:true, b:true}
    if (typeof raw === 'object') {
      return Object.keys(raw).map(function (k) { return String(k || '').trim(); }).filter(Boolean);
    }
    return [String(raw).trim()].filter(Boolean);
  }

  // ------------------------------
  // Product-type alignment (match Products page "כל סוגי המוצרים" dropdown)
  // We derive the same optgroup + sub-type structure from data/products.json,
  // and also compute, for each brand, which type-keys it has products for.
  // typeKey format: "<Group>::<SubType>"

  function containsAny(haystackLower, words) {
    if (!haystackLower) return false;
    for (var i = 0; i < words.length; i++) {
      if (haystackLower.indexOf(String(words[i]).toLowerCase()) !== -1) return true;
    }
    return false;
  }

  function getCatsRawFromProduct(p) {
    if (!p) return [];
    var raw = [];
    if (Array.isArray(p.categories)) raw = p.categories;
    else if (p.category != null) raw = [p.category];
    else if (p.cat != null) raw = [p.cat];
    return raw.map(function (x) { return String(x || '').toLowerCase().trim(); }).filter(Boolean);
  }

  function getPrimaryCategoryKeyFromProduct(p) {
    var cats = getCatsRawFromProduct(p);
    return cats[0] || '';
  }

  function getTypeGroupLabelFromProduct(p) {
    var catKey = getPrimaryCategoryKeyFromProduct(p);
    var nameLower = String(p.productTypeLabel || p.name || '').toLowerCase();

    // Teeth / whitening
    var isTeeth = containsAny(nameLower, ['tooth','teeth','שן','שיניים','toothpaste','whitening']);
    if (isTeeth) return 'הלבנה וטיפוח השיניים';

    var isMen = /גבר|גברים|men's|for men|for him|pour homme/i.test(nameLower);

    if (catKey === 'makeup') return 'מוצרי איפור';
    if (catKey === 'face') return isMen ? 'טיפוח לגבר' : 'טיפוח לפנים';
    if (catKey === 'body') return isMen ? 'טיפוח לגבר' : 'טיפוח לגוף';
    if (catKey === 'hair') return isMen ? 'טיפוח לגבר' : 'עיצוב שיער';
    if (catKey === 'fragrance') return 'בשמים';
    if (catKey === 'sun' || catKey === 'suncare' || catKey === 'spf') return 'הגנה מהשמש';
    if (isMen) return 'טיפוח לגבר';
    return 'אחר';
  }

  function getTypeDisplayLabelFromProduct(p) {
    var group = getTypeGroupLabelFromProduct(p);
    var name = String(p.productTypeLabel || p.name || '').trim();
    if (!name) return '';
    var lower = name.toLowerCase();

    // Makeup
    if (group === 'מוצרי איפור') {
      if (containsAny(lower, ['lip','שפתיים','שפתון','gloss'])) return 'שפתיים';
      if (containsAny(lower, ['eye','eyes','עיניים','ריסים','מסקרה','eyeliner','brow'])) return 'עיניים';
      if (containsAny(lower, ['nail','ציפורניים','לק'])) return 'ציפורניים';
      if (containsAny(lower, ['brush','מברשת','sponge','applicator','tools','אביזר'])) return 'אביזרי איפור';
      if (containsAny(lower, ['kit','מארז','ערכת'])) return 'סטים ומארזים';
      if (containsAny(lower, ['palette','פלטה'])) return 'פנים';
      return 'פנים';
    }

    // Face care
    if (group === 'טיפוח לפנים') {
      if (containsAny(lower, ['eye','eyes','עיניים','אזור העיניים','שפתיים','lip'])) return 'עיניים ושפתיים';
      if (containsAny(lower, ['mask','מסכה','peel','פילינג','exfoli','scrub'])) return 'מסכות ופילינג';
      if (containsAny(lower, ['cleanser','clean','wash','soap','סבון','ניקוי','cleansing'])) return 'ניקוי פנים';
      if (containsAny(lower, ['moist','cream','קרם','hydr'])) return 'קרמים ולחות';
      if (containsAny(lower, ['serum','סרום'])) return 'סרומים';
      if (containsAny(lower, ['toner','essence','מי פנים','טונר','אסנס'])) return 'טונרים ואסנס';
      return 'טיפוח כללי';
    }

    // Teeth
    if (group === 'הלבנה וטיפוח השיניים') return 'טיפוח השיניים';

    // Body
    if (group === 'טיפוח לגוף') {
      if (containsAny(lower, ['deodor','דאודורנט'])) return 'דאודורנט';
      if (containsAny(lower, ['body','גוף','lotion','קרם','butter','oil','שמן'])) return 'לחות וגוף';
      if (containsAny(lower, ['scrub','פילינג','exfoli'])) return 'פילינג גוף';
      if (containsAny(lower, ['soap','wash','gel','סבון','רחצה'])) return 'רחצה';
      return 'טיפוח כללי';
    }

    // Hair
    if (group === 'עיצוב שיער') {
      if (containsAny(lower, ['shampoo','שמפו'])) return 'שמפו';
      if (containsAny(lower, ['condition','מרכך'])) return 'מרכך';
      if (containsAny(lower, ['mask','מסכה'])) return 'מסכה לשיער';
      if (containsAny(lower, ['serum','oil','שמן','סרום'])) return 'שמנים וסרומים';
      return 'טיפוח/עיצוב';
    }

    // Sun
    if (group === 'הגנה מהשמש') return 'SPF';
    if (group === 'בשמים') return 'בישום';
    if (group === 'טיפוח לגבר') return 'טיפוח לגבר';

    return 'אחר';
  }

  function buildTypeSelect(selectEl, groupsByType) {
    if (!selectEl) return;

    var prev = String(selectEl.value || '');
    selectEl.innerHTML = '';

    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'כל סוגי המוצרים';
    selectEl.appendChild(placeholder);

    var groupOrder = [
      'מוצרי איפור',
      'טיפוח לפנים',
      'הלבנה וטיפוח השיניים',
      'טיפוח לגוף',
      'עיצוב שיער',
      'הגנה מהשמש',
      'בשמים',
      'טיפוח לגבר',
      'אחר'
    ];

    groupOrder.forEach(function (groupLabel) {
      var set = groupsByType.get(groupLabel);
      if (!set || !set.size) return;
      var optGroup = document.createElement('optgroup');
      optGroup.label = groupLabel;
      Array.from(set)
        .sort(function (a, b) { return String(a).localeCompare(String(b), 'he'); })
        .forEach(function (typeLabel) {
          var o = document.createElement('option');
          o.value = groupLabel + '::' + typeLabel;
          o.textContent = typeLabel;
          optGroup.appendChild(o);
        });
      selectEl.appendChild(optGroup);
    });

    selectEl.value = prev;
    if (String(selectEl.value || '') !== prev) selectEl.value = '';
  }

  function buildTypesIndexFromProducts(products) {
    var groupsByType = new Map(); // group -> Set(subType)
    var brandTypeKeys = new Map(); // brand -> Set(typeKey)

    (products || []).forEach(function (p) {
      if (!p) return;
      // Site policy: vegan-only
      if (p.isVegan === false) return;

      var brand = String(p.brand || '').trim();
      if (!brand) return;

      var group = getTypeGroupLabelFromProduct(p);
      var sub = getTypeDisplayLabelFromProduct(p);
      if (!group || !sub) return;
      if (!groupsByType.has(group)) groupsByType.set(group, new Set());
      groupsByType.get(group).add(sub);

      var key = group + '::' + sub;
      if (!brandTypeKeys.has(brand)) brandTypeKeys.set(brand, new Set());
      brandTypeKeys.get(brand).add(key);
    });

    return { groupsByType: groupsByType, brandTypeKeys: brandTypeKeys };
  }

  // Accept either labelForCategories(cats) or labelForCategories(kind, cats)
  // (older calls in the codebase pass a pageKind as first argument).
  function labelForCategories(kindOrCats, maybeCats) {
    var cats = Array.isArray(kindOrCats) || typeof kindOrCats !== 'string'
      ? kindOrCats
      : maybeCats;

    cats = normalizeCats(cats);
    if (!cats.length) return '';

    var labels = cats.map(function (k) { return CAT_LABELS[k] || k; });
    return labels.join(' / ');
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


  // =============================
  // Product-type dropdown (align with products page)
  // =============================
  function containsAny(haystackLower, words) {
    for (var i = 0; i < words.length; i++) {
      if (haystackLower.indexOf(String(words[i]).toLowerCase()) !== -1) return true;
    }
    return false;
  }

  function getCatsRawFromProduct(p) {
    if (!p) return [];
    if (Array.isArray(p.categories)) return p.categories.map(function(x){ return String(x||'').toLowerCase().trim(); }).filter(Boolean);
    if (p.category != null) return [String(p.category).toLowerCase().trim()].filter(Boolean);
    if (p.cat != null) return [String(p.cat).toLowerCase().trim()].filter(Boolean);
    return [];
  }

  function getPrimaryCategoryKeyFromProduct(p) {
    var cats = getCatsRawFromProduct(p);
    return cats[0] || '';
  }

  function getTypeGroupLabelFromProduct(p) {
    var catKey = getPrimaryCategoryKeyFromProduct(p); // face/hair/body/makeup/fragrance...
    var nameLower = String((p.productTypeLabel || p.name || '')).toLowerCase();

    var isTeeth = containsAny(nameLower, ['tooth','teeth','שן','שיניים','toothpaste','whitening']);
    if (isTeeth) return 'הלבנה וטיפוח השיניים';

    var isMen = /גבר|גברים|men's|for men|for him|pour homme/i.test(nameLower);

    if (catKey === 'makeup') return 'מוצרי איפור';
    if (catKey === 'face') return isMen ? 'טיפוח לגבר' : 'טיפוח לפנים';
    if (catKey === 'body') return isMen ? 'טיפוח לגבר' : 'טיפוח לגוף';
    if (catKey === 'hair') return isMen ? 'טיפוח לגבר' : 'עיצוב שיער';
    if (catKey === 'fragrance') return 'בשמים';
    if (catKey === 'sun' || catKey === 'suncare' || catKey === 'spf') return 'הגנה מהשמש';
    if (isMen) return 'טיפוח לגבר';
    return 'אחר';
  }

  function getTypeDisplayLabelFromProduct(p) {
    var group = getTypeGroupLabelFromProduct(p);
    var name = String((p.productTypeLabel || p.name || '')).trim();
    if (!name) return '';
    var lower = name.toLowerCase();

    if (group === 'מוצרי איפור') {
      if (containsAny(lower, ['lip','שפתיים','שפתון','gloss'])) return 'שפתיים';
      if (containsAny(lower, ['eye','eyes','עיניים','ריסים','מסקרה','eyeliner','brow'])) return 'עיניים';
      if (containsAny(lower, ['nail','ציפורניים','לק'])) return 'ציפורניים';
      if (containsAny(lower, ['brush','מברשת','sponge','applicator','tools','אביזר'])) return 'אביזרי איפור';
      if (containsAny(lower, ['kit','מארז','ערכת'])) return 'סטים ומארזים';
      if (containsAny(lower, ['palette','פלטה'])) return 'פנים';
      return 'פנים';
    }

    if (group === 'טיפוח לפנים') {
      if (containsAny(lower, ['eye','eyes','עיניים','אזור העיניים','שפתיים','lip'])) return 'עיניים ושפתיים';
      if (containsAny(lower, ['mask','מסכה','peel','פילינג','exfoli','scrub'])) return 'מסכות ופילינג';
      if (containsAny(lower, ['serum','סרום','ampoule'])) return 'סרומים';
      if (containsAny(lower, ['cleanser','wash','soap','clean','gel','foam','micellar','מים מיסלריים','ניקוי'])) return 'ניקוי פנים';
      if (containsAny(lower, ['toner','טונר','essence','מיסט'])) return 'טונרים ומיסט';
      if (containsAny(lower, ['cream','קרם','moistur'])) return 'קרמים ולחות';
      if (containsAny(lower, ['oil','שמן'])) return 'שמנים';
      return 'כללי';
    }

    if (group === 'טיפוח לגוף') {
      if (containsAny(lower, ['deodor','דאודורנט'])) return 'דאודורנט';
      if (containsAny(lower, ['body wash','shower','bath','soap','סבון','רחצה'])) return 'רחצה';
      if (containsAny(lower, ['lotion','קרם גוף','body cream','butter','moistur'])) return 'לחות לגוף';
      if (containsAny(lower, ['hand','ידיים'])) return 'ידיים';
      if (containsAny(lower, ['foot','feet','רגל'])) return 'רגליים';
      return 'כללי';
    }

    if (group === 'עיצוב שיער') {
      if (containsAny(lower, ['shampoo','שמפו'])) return 'שמפו';
      if (containsAny(lower, ['conditioner','מרכך'])) return 'מרכך';
      if (containsAny(lower, ['mask','מסכה'])) return 'מסכה לשיער';
      if (containsAny(lower, ['serum','oil','שמן'])) return 'שמנים וסרומים';
      if (containsAny(lower, ['spray','ספריי','gel','wax','cream','mousse'])) return 'עיצוב';
      return 'כללי';
    }

    if (group === 'הגנה מהשמש') {
      return 'SPF';
    }

    if (group === 'בשמים') {
      return 'בישום';
    }

    if (group === 'הלבנה וטיפוח השיניים') {
      return 'שיניים';
    }

    if (group === 'טיפוח לגבר') {
      if (containsAny(lower, ['beard','זקן'])) return 'זקן';
      if (containsAny(lower, ['shave','גילוח'])) return 'גילוח';
      return 'כללי';
    }

    return 'אחר';
  }

  var PRODUCT_TYPE_GROUP_ORDER = [
    'מוצרי איפור',
    'טיפוח לפנים',
    'הלבנה וטיפוח השיניים',
    'טיפוח לגוף',
    'עיצוב שיער',
    'הגנה מהשמש',
    'בשמים',
    'טיפוח לגבר',
    'אחר'
  ];

  function buildTypeSelect(selectEl, products) {
    if (!selectEl) return;
    var prev = String(selectEl.value || '');
    selectEl.innerHTML = '';

    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'כל סוגי המוצרים';
    selectEl.appendChild(placeholder);

    var groupsByType = new Map();
    (products || []).forEach(function(p){
      var g = getTypeGroupLabelFromProduct(p);
      var t = getTypeDisplayLabelFromProduct(p);
      if (!g || !t) return;
      if (!groupsByType.has(g)) groupsByType.set(g, new Set());
      groupsByType.get(g).add(t);
    });

    PRODUCT_TYPE_GROUP_ORDER.forEach(function(groupLabel){
      var set = groupsByType.get(groupLabel);
      if (!set || set.size === 0) return;
      var optGroup = document.createElement('optgroup');
      optGroup.label = groupLabel;
      Array.from(set)
        .sort(function(a,b){ return String(a).localeCompare(String(b), 'he'); })
        .forEach(function(typeLabel){
          var o = document.createElement('option');
          o.value = groupLabel + '::' + typeLabel;
          o.textContent = typeLabel;
          optGroup.appendChild(o);
        });
      selectEl.appendChild(optGroup);
    });

    selectEl.value = prev;
    if (String(selectEl.value || '') !== prev) selectEl.value = '';
  }

  function createBrandCard(brand, pageKind, typeKeysForBrand) {
    var article = document.createElement('article');
    article.className = 'brandCard';

    // Categories in brand JSON are optional and may be empty; we never pass pageKind here.
    var cats = normalizeCats(brand.categories);
    var tier = Number(brand.priceTier);
    if (!(tier >= 1 && tier <= 5)) {
      tier = pageKind === 'intl' ? inferTierFromCategories(cats) : inferTierIsrael(cats);
    }

    article.setAttribute('data-price-tier', String(tier));
    // Type keys are used for filtering with the same dropdown as Products.
    var typeKeys = Array.isArray(typeKeysForBrand) ? typeKeysForBrand : [];
    if (typeKeys.length) article.setAttribute('data-typekeys', typeKeys.join('|'));

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
    // Prefer brand-provided categories; fallback to derived product groups.
    var catText = labelForCategories(cats);
    if (!catText && typeKeys.length) {
      var groups = {};
      typeKeys.forEach(function (k) {
        var g = String(k).split('::')[0] || '';
        if (g) groups[g] = 1;
      });
      catText = Object.keys(groups).join(' · ');
    }
    catsInline.textContent = catText;

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

        // Same dropdown as Products: value is "<Group>::<SubType>"
        if (ok && state.cat) {
          var keys = String(it.el.getAttribute('data-typekeys') || '');
          if (!keys) {
            ok = false;
          } else {
            var arr = keys.split('|');
            if (arr.indexOf(state.cat) === -1) ok = false;
          }
        }

        if (ok && state.priceTier) {
          var t = Number(it.el.getAttribute('data-price-tier')) || 3;
          // show up to the selected tier (cheap -> expensive)
          if (t > state.priceTier) ok = false;
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
      // Vegan-only filter removed (all brands on the site are Vegan + Cruelty‑Free)
    }

    function bind(state) {
      var handler = function () {
        readState(state);
        applyFilters(state);
      };

      if (searchInput) searchInput.addEventListener('input', handler);
      if (categorySelect) categorySelect.addEventListener('change', handler);
      if (priceSelect) priceSelect.addEventListener('change', handler);

      // initial
      handler();
    }

    // Load brand JSON and products.json (for shared category/type dropdown + brand->types index)
    var productsPath = 'data/products.json';
    var productsUrl = __kbwgResolveFromSiteBase(productsPath, 'brands-json.js');

    Promise.all([
      fetch(jsonUrl, { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('Failed to load ' + jsonUrl + ' (from ' + jsonPath + ')');
        return r.json();
      }),
      fetch(productsUrl, { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('Failed to load ' + productsUrl + ' (from ' + productsPath + ')');
        return r.json();
      })
    ])
      .then(function (arr) {
        var brands = arr[0];
        var products = arr[1];

        products = Array.isArray(products) ? products : [];
        var idx = buildTypesIndexFromProducts(products);
        // Build dropdown like the Products page.
        buildTypeSelect(categorySelect, idx.groupsByType);

        brands = Array.isArray(brands) ? brands : [];

        // Ensure normalization
        brands = brands.map(function (b) {
          var out = b || {};
          out.name = String(out.name || '').trim();
          out.categories = Array.isArray(out.categories) ? out.categories.filter(Boolean) : [];
          out.badges = Array.isArray(out.badges) ? out.badges.filter(Boolean) : [];
          return out;
        }).filter(function (b) { return b.name; });

        // Policy: show only Vegan-labeled brands.
        // Primary signal: boolean `vegan` in JSON. Fallback: a badge that contains "Vegan".
        brands = brands.filter(function (b) {
          if (b && b.vegan === true) return true;
          try {
            return Array.isArray(b.badges) && b.badges.some(function (x) {
              return String(x || '').toLowerCase().indexOf('vegan') !== -1;
            });
          } catch (e) { return false; }
        });

        // No separate category builder here; the dropdown is derived from Products.

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
          var keysSet = idx.brandTypeKeys.get(String(b.name || '').trim());
          var keysArr = keysSet ? Array.from(keysSet) : [];
          var res = createBrandCard(b, pageKind, keysArr);
          items.push(res);
          grid.appendChild(res.el);
        });

        var state = { items: items, q: '', cat: '', priceTier: 0 };
        bind(state);

        // Let Weglot (and other listeners) know dynamic content is ready.
        try { window.dispatchEvent(new Event('kbwg:content-rendered')); } catch (e) {}
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
