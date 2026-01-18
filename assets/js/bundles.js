/*
  Bundles page (Amazon free shipping helper)
  - Shows curated bundles that roughly reach Amazon US free shipping threshold ($49+)
  - Each bundle opens a modal where the user can swap items using a cool product picker + filters

  Data sources:
    - data/products.json (already Vegan-only by site policy)
    - data/bundles.json (curated bundle definitions)

  Notes:
    - Prices are *estimates*. Final totals depend on Amazon checkout, taxes, shipping, etc.
    - We prefer storeRegion === 'us' items when the goal is the $49 threshold.
*/
(function () {
  'use strict';

  var FREE_SHIP_USD = 49;

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $all(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function siteBaseFromScript(scriptName) {
    try {
      var src = '';
      try {
        src = (document.currentScript && document.currentScript.src) ? document.currentScript.src : '';
      } catch (e) {
        src = '';
      }
      if (!src) {
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

      // Strip language segment at the end (e.g. /en)
      var parts = base.split('/').filter(Boolean);
      var langs = { en: 1, he: 1, iw: 1, ar: 1, fr: 1, es: 1, de: 1, ru: 1 };
      if (parts.length && langs[parts[parts.length - 1]]) parts.pop();
      return '/' + parts.join('/');
    } catch (e) {
      return '/';
    }
  }

  function resolveFromBase(relPath, scriptName) {
    if (!relPath) return relPath;
    var p = String(relPath);
    if (/^https?:\/\//i.test(p)) return p;
    p = p.replace(/^\.\//, '');
    var base = siteBaseFromScript(scriptName) || '/';
    if (base === '/') return '/' + p.replace(/^\//, '');
    return base + '/' + p.replace(/^\//, '');
  }

  function toNumber(v) {
    var n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function normalizeProduct(p) {
    var out = Object.assign({}, p || {});
    // normalize booleans
    out.isVegan = out.isVegan === true || out.vegan === true;
    out.isPeta = out.isPeta === true || out.peta === true;
    out.isLB = out.isLB === true || out.lb === true;
    out.storeRegion = String(out.storeRegion || '').toLowerCase().trim();
    out.category = String(out.category || '').toLowerCase().trim();
    out.brand = String(out.brand || '').trim();
    out.name = String(out.name || '').trim();
    out.image = String(out.image || '').trim();
    out.affiliateLink = String(out.affiliateLink || '').trim();
    out.offers = Array.isArray(out.offers) ? out.offers : [];
    return out;
  }

  function bestPrice(p) {
    // Prefer offers with numeric price
    var prices = [];
    if (p && Array.isArray(p.offers)) {
      p.offers.forEach(function (o) {
        var n = toNumber(o && o.price);
        if (n > 0) prices.push(n);
      });
    }
    if (prices.length) return Math.min.apply(Math, prices);
    var pm = toNumber(p && p.priceMin);
    if (pm > 0) return pm;
    var px = toNumber(p && p.priceMax);
    if (px > 0) return px;
    return 0;
  }

  function formatUSD(n) {
    var v = Math.round(toNumber(n) * 100) / 100;
    return '$' + v.toFixed(2);
  }

  function tierFromPriceUSD(price) {
    var p = toNumber(price);
    if (p <= 0) return 3;
    if (p < 15) return 1;
    if (p < 35) return 2;
    if (p < 70) return 3;
    if (p < 120) return 4;
    return 5;
  }

  function priceTierHtml(tier) {
    var t = Math.max(1, Math.min(5, toNumber(tier) || 3));
    var cls = 'price-tier price-tier--t' + t + ' price-tier--sm';
    var label = 'רמת מחיר: ' + t + ' מתוך 5';
    var s = '<span aria-label="' + label + '" class="' + cls + '">';
    for (var i = 1; i <= 5; i++) {
      s += '<span class="dollar' + (i <= t ? '' : ' inactive') + '">$</span>';
    }
    s += '</span>';
    return s;
  }

  function dedupeById(arr) {
    var seen = new Set();
    var out = [];
    (arr || []).forEach(function (p) {
      var id = String(p && p.id || '');
      if (!id) return;
      if (seen.has(id)) return;
      seen.add(id);
      out.push(p);
    });
    return out;
  }

  function loadJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function safeText(s) {
    return String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  
  // FX: USD -> ILS (client-side fetch, with fallback)
  var FX = { rate: null, updatedAt: null };
  function formatILS(n){
    var v = Math.round(toNumber(n) * 100) / 100;
    try{ return '₪' + v.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }catch(e){ return '₪' + v.toFixed(2); }
  }
  function setFxNote(msg){
    var el = document.getElementById('fxNote');
    if (el) el.textContent = msg || '';
  }
  function updateIlsOut(){
    var input = document.getElementById('usdInput');
    var out = document.getElementById('ilsOut');
    if (!input || !out) return;
    var usd = toNumber(input.value);
    if (!FX.rate){ out.textContent = '₪—'; return; }
    out.textContent = formatILS(usd * FX.rate);
  }
  function bindFxInput(){
    var input = document.getElementById('usdInput');
    if (!input) return;
    input.addEventListener('input', updateIlsOut);
  }
  function loadFxRate(){
    // exchangerate.host is usually keyless. If it fails, fall back to stored rate.
    var stored = null;
    try{ stored = JSON.parse(localStorage.getItem('kbwg_fx_usd_ils') || 'null'); }catch(e){ stored = null; }
    if (stored && stored.rate){ FX.rate = stored.rate; FX.updatedAt = stored.updatedAt || null; setFxNote('שער אחרון: ' + (stored.rate.toFixed ? stored.rate.toFixed(3) : stored.rate)); updateIlsOut(); }

    fetch('https://api.exchangerate.host/latest?base=USD&symbols=ILS', { cache: 'no-store' })
      .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .then(function(data){
        var rate = data && data.rates ? toNumber(data.rates.ILS) : 0;
        if (rate > 0){
          FX.rate = rate;
          FX.updatedAt = (data && data.date) ? data.date : new Date().toISOString();
          try{ localStorage.setItem('kbwg_fx_usd_ils', JSON.stringify({ rate: rate, updatedAt: FX.updatedAt })); }catch(e){}
          setFxNote('שער USD/ILS: ' + rate.toFixed(3));
          updateIlsOut();
        }else{ setFxNote('לא ניתן לטעון שער.'); }
      })
      .catch(function(){
        if (!FX.rate) setFxNote('לא ניתן לטעון שער כרגע.');
      });
  }

var state = {
    products: [],
    productsById: {},
    bundles: [],
    activeBundle: null,
    activeSlotIndex: 0,
    // Picker filters: search + price tier + chips (category dropdown removed)
    picker: { q: '', tier: '', chips: { peta: false, lb: false, us: true } }
  };

  function buildIndex(products) {
    var map = {};
    products.forEach(function (p) {
      map[String(p.id)] = p;
    });
    return map;
  }

  function bundleSubtotal(bundle) {
    var sum = 0;
    bundle.items.forEach(function (it) {
      sum += bestPrice(it.product);
    });
    return sum;
  }

  function amazonSearchUrl(bundle) {
    // We can't add-to-cart without Amazon API. We open a search that includes the brands / keywords.
    var parts = bundle.items
      .map(function (it) {
        var p = it.product || {};
        return (p.brand || '') + ' ' + (p.name || '');
      })
      .join(' | ')
      .slice(0, 160);
    var q = encodeURIComponent(parts || bundle.title || 'vegan cruelty free');
    return 'https://www.amazon.com/s?k=' + q;
  }

  function renderBundlesGrid() {
    var grid = $('#bundleGrid');
    if (!grid) return;
    grid.innerHTML = '';

    state.bundles.forEach(function (b) {
      var subtotal = bundleSubtotal(b);
      var tier = tierFromPriceUSD(subtotal);
      var toFree = Math.max(0, FREE_SHIP_USD - subtotal);
      var tags = [];
      tags.push('Amazon US');
      tags.push('Vegan');
      if (b.tags && b.tags.length) tags = tags.concat(b.tags);

      var card = document.createElement('article');
      card.className = 'contentCard bundleCard';
      card.innerHTML =
        '<div class="bundleTop">' +
          '<div>' +
            '<h3 class="bundleTitle">' + safeText(b.title) + '</h3>' +
            '<p class="bundleSubtitle">' + safeText(b.subtitle || '') + '</p>' +
            '<div class="bundleMeta">' + tags.map(function (t) { return '<span class="tag">' + safeText(t) + '</span>'; }).join('') + '</div>' +
          '</div>' +
          priceTierHtml(tier) +
        '</div>' +
        '<div class="bundleCta">' +
          '<div>' +
            '<div class="bundlePrice">' + formatUSD(subtotal) + '</div>' +
            '<div class="noteTiny">' + (toFree > 0 ? ('עוד ' + formatUSD(toFree) + ' כדי להגיע ל־$49') : 'מעולה! הבאנדל מעל $49') + '</div>' +
          '</div>' +
          '<button type="button" class="bundleBtn" data-bundle-id="' + safeText(b.id) + '">פתחי באנ‏דל</button>' +
        '</div>';
      grid.appendChild(card);
    });

    $all('.bundleBtn', grid).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = String(btn.getAttribute('data-bundle-id') || '');
        openBundle(id);
      });
    });
  }

  function openBundle(bundleId) {
    var b = state.bundles.find(function (x) { return x.id === bundleId; });
    if (!b) return;
    state.activeBundle = b;
    state.activeSlotIndex = 0;
    $('#bundleModalTitle').textContent = b.title;
    // reset picker
    state.picker.q = '';
    state.picker.tier = '';
    state.picker.chips = { peta: false, lb: false, us: true };
    $('#pickQ').value = '';
    $('#pickTier').value = '';
    $all('.pickerChip').forEach(function (c) {
      var key = c.getAttribute('data-chip');
      var on = Boolean(state.picker.chips[key]);
      c.classList.toggle('active', on);
    });

    renderBundleModal();
    showModal();
  }

  function renderBundleModal() {
    var b = state.activeBundle;
    if (!b) return;
    var itemsWrap = $('#bundleItems');
    itemsWrap.innerHTML = '';

    b.items.forEach(function (slot, idx) {
      var p = slot.product;
      var price = bestPrice(p);
      var img = p.image ? p.image : 'assets/img/photos/pink-flatlay.jpg';
      var el = document.createElement('div');
      el.className = 'bundleItem' + (idx === state.activeSlotIndex ? ' isActive' : '');
      el.setAttribute('data-slot', String(idx));
      el.innerHTML =
        '<img alt="" src="' + safeText(img) + '" loading="lazy" />' +
        '<div>' +
          '<p class="bundleItemName">' + safeText(p.brand || '') + ' — ' + safeText(p.name || '') + '</p>' +
          '<div class="bundleItemMeta">' +
            '<span class="miniTag">' + formatUSD(price) + '</span>' +
            (p.isPeta ? '<span class="miniTag">PETA</span>' : '') +
            (p.isLB ? '<span class="miniTag">ליפינג באני</span>' : '') +
            '<button type="button" class="miniBtn" data-action="replace" data-slot="' + idx + '">החליפי</button>' +
            (p.affiliateLink ? '<a class="miniBtn secondary" href="' + safeText(p.affiliateLink) + '" target="_blank" rel="noopener">מוצר</a>' : '') +
          '</div>' +
        '</div>';
      itemsWrap.appendChild(el);
    });

    $all('[data-action="replace"]', itemsWrap).forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        var i = toNumber(btn.getAttribute('data-slot'));
        if (!Number.isFinite(i)) return;
        state.activeSlotIndex = i;
        renderBundleModal();
      });
    });

    var subtotal = bundleSubtotal(b);
    $('#bundleSubtotal').textContent = formatUSD(subtotal);
    var usdInput = document.getElementById('usdInput');
    if (usdInput){ usdInput.value = (Math.round(subtotal*100)/100).toFixed(2); updateIlsOut(); }
    $('#bundleToFree').textContent = formatUSD(Math.max(0, FREE_SHIP_USD - subtotal));
    $('#shopAllBtn').href = amazonSearchUrl(b);

    renderPicker();
  }

  function productMatchesPicker(p) {
    if (!p || !p.isVegan) return false;

    // Chips
    if (state.picker.chips.us && p.storeRegion && p.storeRegion !== 'us') return false;
    if (state.picker.chips.peta && !p.isPeta) return false;
    if (state.picker.chips.lb && !p.isLB) return false;

    // Tier
    if (state.picker.tier) {
      var t = tierFromPriceUSD(bestPrice(p));
      if (String(t) !== String(state.picker.tier)) return false;
    }

    // Search
    if (state.picker.q) {
      var q = state.picker.q.toLowerCase().trim();
      var hay = (p.brand + ' ' + p.name + ' ' + (p.size || '') + ' ' + (p.productTypeLabel || '')).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }

  function selectedProductIds() {
    var b = state.activeBundle;
    if (!b) return [];
    return b.items.map(function (it) { return String(it.product && it.product.id || ''); }).filter(Boolean);
  }

  function renderPicker() {
    var grid = $('#pickerGrid');
    if (!grid) return;

    var selected = new Set(selectedProductIds());
    // allow keeping the currently active slot product in list by removing it from exclusion
    var currentSlot = state.activeBundle && state.activeBundle.items[state.activeSlotIndex];
    if (currentSlot && currentSlot.product && currentSlot.product.id) {
      selected.delete(String(currentSlot.product.id));
    }

    var list = state.products
      .filter(productMatchesPicker)
      .filter(function (p) { return !selected.has(String(p.id)); })
      .slice(0, 60);

    if (!list.length) {
      grid.innerHTML = '<div class="noteTiny">לא נמצאו מוצרים לפי הסינון. נסי להסיר פילטרים.</div>';
      return;
    }

    grid.innerHTML = '';
    list.forEach(function (p) {
      var price = bestPrice(p);
      var img = p.image ? p.image : 'assets/img/photos/pink-flatlay.jpg';
      var card = document.createElement('div');
      card.className = 'pickCard';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('data-pid', String(p.id));
      card.innerHTML =
        '<img alt="" src="' + safeText(img) + '" loading="lazy" />' +
        '<div>' +
          '<p class="pickName">' + safeText(p.brand || '') + ' — ' + safeText(p.name || '') + '</p>' +
          '<div class="pickMeta">' +
            '<span class="pickPrice">' + formatUSD(price) + '</span>' +
            (p.isPeta ? '<span class="miniTag">PETA</span>' : '') +
            (p.isLB ? '<span class="miniTag">ליפינג באני</span>' : '') +
          '</div>' +
        '</div>';
      card.addEventListener('click', function () { replaceActiveSlot(p.id); });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          replaceActiveSlot(p.id);
        }
      });
      grid.appendChild(card);
    });
  }

  function replaceActiveSlot(productId) {
    var b = state.activeBundle;
    if (!b) return;
    var p = state.productsById[String(productId)];
    if (!p) return;
    if (!p.isVegan) return;

    b.items[state.activeSlotIndex].product = p;
    renderBundleModal();
  }

  function showModal() {
    var overlay = $('#bundleOverlay');
    var modal = $('#bundleModal');
    overlay.classList.add('isOpen');
    modal.classList.add('isOpen');
    overlay.setAttribute('aria-hidden', 'false');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // focus
    setTimeout(function () {
      var q = $('#pickQ');
      if (q) q.focus();
    }, 10);
  }

  function closeModal() {
    var overlay = $('#bundleOverlay');
    var modal = $('#bundleModal');
    overlay.classList.remove('isOpen');
    modal.classList.remove('isOpen');
    overlay.setAttribute('aria-hidden', 'true');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    state.activeBundle = null;
  }

  function wireModalEvents() {
    var overlay = $('#bundleOverlay');
    var closeBtn = $('#bundleCloseBtn');
    if (overlay) overlay.addEventListener('click', closeModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var modal = $('#bundleModal');
        if (modal && modal.classList.contains('isOpen')) closeModal();
      }
    });
  }

  function wirePickerControls() {
    var q = $('#pickQ');
    var tier = $('#pickTier');
    if (q) {
      q.addEventListener('input', function () {
        state.picker.q = q.value || '';
        renderPicker();
      });
    }
    if (tier) {
      tier.addEventListener('change', function () {
        state.picker.tier = tier.value || '';
        renderPicker();
      });
    }
    $all('.pickerChip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var key = chip.getAttribute('data-chip');
        if (!key) return;
        state.picker.chips[key] = !state.picker.chips[key];
        // keep US on by default; allow user to turn off
        chip.classList.toggle('active', Boolean(state.picker.chips[key]));
        renderPicker();
      });
    });
  }

  function normalizeBundles(rawBundles) {
    var bundles = Array.isArray(rawBundles) ? rawBundles : [];
    return bundles
      .map(function (b, idx) {
        var id = String(b.id || ('bundle-' + (idx + 1)));
        var title = String(b.title || 'באנדל');
        var subtitle = String(b.subtitle || '');
        var tags = Array.isArray(b.tags) ? b.tags : [];
        var itemIds = Array.isArray(b.items) ? b.items : [];
        var items = itemIds
          .map(function (pid) {
            var p = state.productsById[String(pid)];
            return p ? ({ product: p }) : null;
          })
          .filter(Boolean);
        return { id: id, title: title, subtitle: subtitle, tags: tags, items: items };
      })
      .filter(function (b) { return b.items && b.items.length >= 2; });
  }

  function boot() {
    wireModalEvents();
    wirePickerControls();

    var productsUrl = resolveFromBase('data/products.json', 'bundles.js');
    var bundlesUrl = resolveFromBase('data/bundles.json', 'bundles.js');

    Promise.all([loadJson(productsUrl), loadJson(bundlesUrl)])
      .then(function (res) {
        var rawProducts = res[0];
        var rawBundles = res[1];

        state.products = dedupeById((rawProducts || []).map(normalizeProduct)).filter(function (p) {
          return p && p.isVegan; // Policy: Vegan only
        });
        state.productsById = buildIndex(state.products);
        state.bundles = normalizeBundles(rawBundles);

        renderBundlesGrid();
      })
      .catch(function (err) {
        console.warn('[bundles] Could not load data', err);
        var grid = $('#bundleGrid');
        if (grid) grid.innerHTML = '<div class="contentCard">לא הצלחנו לטעון נתונים כרגע. נסו לרענן.</div>';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
