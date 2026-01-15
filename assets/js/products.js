// מוצרים page logic (RTL-friendly, data-normalized, performant)
(function () {
  const qs = (s) => document.querySelector(s);

  const q = qs("#q");
  const grid = qs("#grid");
  const liveCount = qs("#liveCount");

  const brandSelect = qs("#brandSelect");
  const storeSelect = qs("#storeSelect");
  const typeSelect = qs("#typeSelect"); // ✅ סוג מוצר (קבוצות + תתי-קטגוריות)
  const sortSel = qs("#sort");
  const clearBtn = qs("#clearFilters");
  const priceMinInput = qs("#priceMin");
  const priceMaxInput = qs("#priceMax");
  const priceApplyBtn = qs("#priceApplyBtn");

  const onlyLB = qs("#onlyLB");
  const onlyPeta = qs("#onlyPeta");
  const onlyVegan = qs("#onlyVegan");
  const onlyIsrael = qs("#onlyIsrael");
  const onlyMen = qs("#onlyMen");
  const onlyFreeShip = qs("#onlyFreeShip");
  const onlyCFNotVegan = qs("#onlyCFNotVegan");
  const onlyIndependent = qs("#onlyIndependent");
  const avoidNonCFParent = null;
let currentCat = "all";

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  
  function cleanupProductName(name, brand) {
    if (!name) return "";
    let result = String(name);

    // הסרה של שם המותג מתוך שם המוצר (אם מופיע)
    if (brand) {
      const brandEsc = brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const brandRe = new RegExp("\\s*" + brandEsc + "\\s*", "gi");
      result = result.replace(brandRe, " ");
    }

    // מילים באנגלית שנוטות לחזור יחד עם המונח העברי (כמו Conditioner + מרכך)
    const duplicateEnglishWords = [
      "Conditioner",
      "Shampoo",
      "Mask",
      "Cream",
      "Serum",
      "Moisturizer",
      "Lotion",
      "Toner",
      "Cleanser",
      "Wash",
      "Scrub",
      "Peeling",
      "Gel",
      "Spray",
      "Mist",
      "Foam",
      "Mousse",
      "Oil",
      "Balm",
      "Exfoliant",
      "Pads",
      "Lipstick",
      "Lip Gloss",
      "Gloss",
      "Lip Color",
      "Foundation",
      "Primer",
      "Highlighter",
      "Blush",
      "Bronzer",
      "Concealer",
      "Palette",
      "Kit",
      "Set",
      "BB Cream",
      "CC Cream"
    ];

    duplicateEnglishWords.forEach((word) => {
      const re = new RegExp("\\s*" + word.replace(" ", "\\s+") + "\\s*", "gi");
      result = result.replace(re, " ");
    });

    // ניקוי רווחים כפולים
    result = result.replace(/\s+/g, " ").trim();
    return result;
  }

function normalizeProduct(p) {
    const offers = Array.isArray(p?.offers) ? p.offers : [];
    const storeRegion = String(p?.storeRegion ?? "").toLowerCase();

    return {
      ...p,
      // דגלים לוגיים אחידים
      isLB: Boolean(p?.isLB ?? p?.lb ?? p?.isLeapingBunny),
      isPeta: Boolean(p?.isPeta ?? p?.peta),
      isVegan: Boolean(p?.isVegan ?? p?.vegan),
      isIsrael: Boolean(p?.isIsrael ?? p?.israel ?? (storeRegion === "il")),
      // offers אחיד (meta, region, freeShipOver)
      offers: offers.map((o) => {
        const rawUrl = String(o?.url || "");
        const domain = rawUrl.split("/")[2] || "";
        let region = String(o?.region || "").toLowerCase();

        if (!region) {
          if (domain.includes("amazon.co.uk")) region = "uk";
          else if (domain.includes("amazon.com")) region = "us";
          else if (domain.includes("amazon.de")) region = "de";
          else if (domain.includes("amazon.fr")) region = "fr";
          else if (storeRegion && storeRegion !== "intl") region = storeRegion;
        }

        const rawFree = o?.freeShipOver ?? p?.freeShipOver;
        const freeNum =
          rawFree != null && rawFree !== "" ? Number(rawFree) : NaN;

        return {
          ...o,
          meta: o?.meta ?? o?.note ?? "",
          region,
          freeShipOver: Number.isFinite(freeNum) ? freeNum : null
        };
      })
    };
  }

  
  // --- Remove duplicate products (keeps first occurrence) ---
  // Dedup key priority: first offer URL -> affiliateLink -> brand+name+size+type
  function dedupeProducts(list) {
    const debug = /(?:\?|&)debug=1(?:&|$)/.test(location.search);
    const seen = new Set();
    const removed = [];
    const out = [];

    for (const p of list) {
      const offerUrl = (p.offers && p.offers[0] && p.offers[0].url) ? String(p.offers[0].url) : "";
      const affiliate = p.affiliateLink ? String(p.affiliateLink) : "";
      const fallback = [
        (p.brand || "").toLowerCase().trim(),
        (p.name || "").toLowerCase().trim(),
        (p.size || "").toLowerCase().trim(),
        (p.productTypeLabel || "").toLowerCase().trim()
      ].join("|");

      const key = (offerUrl || affiliate || fallback).trim();
      if (!key) {
        out.push(p);
        continue;
      }
      if (seen.has(key)) {
        removed.push({ key, name: p.name, brand: p.brand });
        continue;
      }
      seen.add(key);
      out.push(p);
    }

    if (debug && removed.length) {
      console.warn("[products] Removed duplicates:", removed);
    }
    return out;
  }


  const PARENT_MAP = (window.PARENT_MAP && typeof window.PARENT_MAP === 'object') ? window.PARENT_MAP : {};
  const data = dedupeProducts((window.PRODUCTS || []).map(normalizeProduct)).map(function(p){
    var parentInfo = PARENT_MAP[p.brand] || null;
          // מוצרים המיועדים לגברים (לא תקף בקטגוריית איפור)
      () => {
        if (!onlyMen?.checked) return true;
        if (currentCat === "makeup") return true;
        return isMenTargetedProduct(p);
      },

      // Only products with "free shipping over"
      () => {
        if (!onlyFreeShip?.checked) return true;
        const best = getProductMinFreeShip(p);
        return best != null;
      },

      // מחיר range
      () => {
        if (!priceMinInput && !priceMaxInput) return true;

        const range = getProductPriceRange(p);
        if (!range) return true; // אם אין מידע על מחיר – לא מסננים לפי מחיר

        const [pMin, pMaxRaw] = range;
        const pMax = pMaxRaw ?? pMin ?? 0;

        const minVal = priceMinInput && priceMinInput.value !== "" ? Number(priceMinInput.value) : null;
        const maxVal = priceMaxInput && priceMaxInput.value !== "" ? Number(priceMaxInput.value) : null;

        // אם לא הוגדר מינימום ולא מקסימום – אין סינון מחיר
        if (minVal == null && maxVal == null) return true;

        // רק מינימום הוגדר – דורשים שכל הטווח של המוצר יהיה מעל / שווה למינימום
        if (minVal != null && maxVal == null) {
          return pMin >= minVal;
        }

        // רק מקסימום הוגדר – דורשים שהגבול התחתון של המוצר יהיה קטן מהמקסימום
        // כך, אם המקסימום הוא 50, טווח 50–100 *לא* יופיע; אם המקסימום הוא 51 – כן יופיע.
        if (minVal == null && maxVal != null) {
          return pMin < maxVal;
        }

        // שני הערכים הוגדרו – עובדים לפי חיתוך טווחים (overlap)
        if (pMax < minVal) return false; // טווח המוצר נגמר לפני המינימום
        if (pMin >= maxVal) return false; // טווח המוצר מתחיל אחרי / בדיוק בגבול המקסימום

        // אחרת – יש חיתוך בין הטווחים, ולכן המוצר רלוונטי
        return true;
      },


      // חיפוש טקסט חופשי

      () => {
        if (!text) return true;
        const hay = `${p.brand || ""} ${p.name || ""} ${getCats(p).join(" ")}`.toLowerCase();
        return hay.includes(text);
      }
    ];

    return predicates.every((fn) => fn());
  }

  function updatedTs(v) {
    if (typeof v === "number") return v;
    const t = Date.parse(String(v || ""));
    return Number.isFinite(t) ? t : 0;
  }

  function sortList(list) {
    const v = sortSel?.value || "updated";

    if (v === "price-low") {
      list.sort((a, b) => {
        const pa = Number(a.priceMin ?? a.priceRangeMin ?? Infinity);
        const pb = Number(b.priceMin ?? b.priceRangeMin ?? Infinity);
        if (pa !== pb) return pa - pb;
        const bd = String(a.brand || "").localeCompare(String(b.brand || ""), "he") ||
                   String(a.name || "").localeCompare(String(b.name || ""), "he");
        return bd;
      });
      return;
    }

    if (v === "brand-az") {
      list.sort((a, b) =>
        String(a.brand || "").localeCompare(String(b.brand || ""), "he") ||
        String(a.name || "").localeCompare(String(b.name || ""), "he")
      );
      return;
    }

    if (v === "name-az") {
      list.sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""), "he") ||
        String(a.brand || "").localeCompare(String(b.brand || ""), "he")
      );
      return;
    }

    list.sort((a, b) => {
      const diff = updatedTs(b.updated) - updatedTs(a.updated);
      if (diff) return diff;
      return (
        String(a.brand || "").localeCompare(String(b.brand || ""), "he") ||
        String(a.name || "").localeCompare(String(b.name || ""), "he")
      );
    });
  }

  function tag(label) {
    const s = document.createElement("span");
    s.className = "tag";
    s.textContent = label;
    // Don’t translate certification tags/badges (Weglot)
    if (/(Leaping Bunny|PETA|Vegan|INTL)/i.test(String(label))) {
      s.setAttribute("data-wg-notranslate", "true");
      s.classList.add("wg-notranslate");
    }
    return s;
  }

  let renderRaf = 0;
  function scheduleRender() {
    cancelAnimationFrame(renderRaf);
    renderRaf = requestAnimationFrame(render);
  }

  function initPriceCheckedOn() {
    const el = document.getElementById('priceCheckedOn');
    if (!el) return;
    const v = (window.PRICE_CHECKED_ON || '').toString();
    el.textContent = v || '—';
    el.setAttribute('data-wg-notranslate', 'true');
    el.classList.add('wg-notranslate');
  }

  function render() {
    if (!grid) return;

    const list = data.filter(matches);
    sortList(list);

    const frag = document.createDocumentFragment();

    list.forEach((p) => {
      const card = document.createElement("article");
      card.className = "productCard";

      const media = document.createElement("div");
      media.className = "pMedia";
      if (p.image) {
        const img = document.createElement("img");
        img.src = p.image;
        img.alt = p.name || "";
        img.loading = "lazy";
        img.decoding = "async";
        img.width = 640;
        img.height = 640;
        media.appendChild(img);
      } else {
        const ph = document.createElement("div");
        ph.className = "pPlaceholder";
        ph.textContent = "🧴";
        ph.setAttribute("aria-hidden", "true");
        media.appendChild(ph);
      }

      const content = document.createElement("div");
      content.className = "pContent";

      const header = document.createElement("div");
      header.className = "pHeader";

      const titleWrap = document.createElement("div");
      titleWrap.className = "pTitleWrap";

      const brand = document.createElement("div");
      brand.className = "pBrand";
      brand.textContent = p.brand || "";

      const name = document.createElement("div");
      name.className = "pName";
      name.textContent = cleanupProductName(p.name || "", p.brand || "");

      titleWrap.appendChild(brand);
      titleWrap.appendChild(name);

      const meta = document.createElement("div");
      meta.className = "pMeta";

      const categoryLabel = getCategoryLabelFromProduct(p);
      if (categoryLabel) {
        const c = document.createElement("span");
        c.className = "pMetaPill";
        c.textContent = categoryLabel;
        meta.appendChild(c);
      }

      if (p.size) {
        const s = document.createElement("span");
        s.className = "pMetaPill";
        s.textContent = formatSizeForIsrael(p.size);
        meta.appendChild(s);
      }

      const approvals = [];
      if (p.isPeta) approvals.push("PETA");
      if (p.isVegan) approvals.push("Vegan");
      if (p.isLB) approvals.push("Leaping Bunny");

      const bestOffer = getOfferWithMinFreeShip(p);
      if (bestOffer) {
        const fs = document.createElement("span");
        fs.className = "pMetaPill pMetaPill--freeShip";
        fs.textContent = formatFreeShipText(bestOffer);
        meta.appendChild(fs);
      }

      header.appendChild(titleWrap);
      header.appendChild(meta);

      const tags = document.createElement("div");
      tags.className = "tags";
      if (p.isLB) tags.appendChild(tag("Leaping Bunny / CFI"));
      if (p.isPeta) tags.appendChild(tag("PETA"));
      if (p.isVegan) tags.appendChild(tag("Vegan"));
      if (p.isIsrael) tags.appendChild(tag("אתר ישראלי"));

      // Parent-company badge (transparency)
      if (p.parentStatus === 'independent') {
        t.classList.add('tag--parent');
        tags.appendChild(t);
      } else if (p.parentStatus === 'subsidiary') {
        const t = tag(label);
        t.classList.add('tag--parent');
        tags.appendChild(t);
      } else if (p.parentStatus === 'unknown') {
        const t = tag("חברת-אם: לא ידוע");
        t.classList.add('tag--parent', 'tag--parent-unknown');
        tags.appendChild(t);
      }

      const offerList = document.createElement("div");
      offerList.className = "offerList";

      const offers = Array.isArray(p.offers) ? p.offers : [];
      offers.forEach((o) => {
        const row = document.createElement("div");
        row.className = "offer";

        const metaBox = document.createElement("div");
        const storeLabel = getStoreDisplayName(p, o);
        const safeStoreLabel = storeLabel ? escapeHtml(storeLabel) : "";
        // מציגים רק את שם החנות (כולל אזור, למשל Amazon ארה"ב / Amazon אנגליה)
        // כדי להימנע מכפל טקסט כמו "אמזון ארה"ב" פעמיים
        metaBox.innerHTML = `<div class="offerStore">${safeStoreLabel}</div>`;

        const a = document.createElement("a");
        a.className = "btn primary";
        a.href = o.url || "#";
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = "לצפייה";

        row.appendChild(metaBox);
        row.appendChild(a);
        offerList.appendChild(row);
      });

      content.appendChild(header);
      content.appendChild(tags);

      // Hidden animal-ingredient education (product-level)
      if (!p.isVegan) {
        const why = Array.isArray(p.nonVeganReasons) ? p.nonVeganReasons.filter(Boolean).join(' · ') : (p.nonVeganReason || '');
        const alert = document.createElement('div');
        alert.className = 'pAlert pAlert--animal';
        alert.textContent = why ? `לא טבעוני: ${why}` : 'לא טבעוני (ייתכן רכיב מן החי)';
        content.appendChild(alert);
      }

      const priceRange = getProductPriceRange(p);
      if (priceRange) {
        const [minPrice, maxPrice] = priceRange;
        const pr = document.createElement("div");
        pr.className = "pPriceRange";
        if (minPrice === maxPrice) {
          pr.textContent = `מחיר: ₪${minPrice}`;
        } else {
          pr.textContent = `טווח מחירים: ₪${minPrice} - ₪${maxPrice}`;
        }
        content.appendChild(pr);
      }

      const ppu = formatPricePer100(p);
      if (ppu) {
        const u = document.createElement('div');
        u.className = 'pUnitPrice';
        u.textContent = `: ${ppu}`;
        content.appendChild(u);
      }

      content.appendChild(offerList);

      // Price volatility note (until API integration)
      const pv = document.createElement('div');
      pv.className = 'pPriceNote';
      content.appendChild(pv);

      // Real-world performance testing (optional per product)
      if (p.testResults) {
        const d = document.createElement('details');
        d.className = 'pTests';
        const s = document.createElement('summary');
        s.textContent = 'תוצאות מבחן אמיתי';
        const body = document.createElement('div');
        body.className = 'pTestsBody';
        body.textContent = String(p.testResults);
        d.appendChild(s);
        d.appendChild(body);
        content.appendChild(d);
      }

      card.appendChild(media);
      card.appendChild(content);

      frag.appendChild(card);
    });

    grid.replaceChildren(frag);
    // Refresh Weglot after dynamic content is rendered
    if (window.Weglot && typeof window.Weglot.refresh === "function") {
      window.Weglot.refresh();
    }

    if (liveCount) liveCount.textContent = `${list.length} מוצרים`;

    const empty = qs("#emptyState");
    if (empty) empty.hidden = list.length !== 0;
  }

  
function bind() {
  const toolbar = document.querySelector(".toolbar-container");

  // Generic live filters: search, brand, store, sort, type, toggles, free-shipping
  toolbar?.addEventListener("input", (e) => {
    if (
      e.target &&
      e.target.matches(
        "#q, #brandSelect, #storeSelect, #typeSelect, #sort, #onlyLB, #onlyPeta, #onlyVegan, #onlyCFNotVegan, #onlyIsrael, #onlyFreeShip, #onlyMen, #onlyIndependent, #avoidNonCFParent"
      )
    ) {
      scheduleRender();
    }
  });

  toolbar?.addEventListener("change", (e) => {
    if (
      e.target &&
      e.target.matches(
        "#q, #brandSelect, #storeSelect, #typeSelect, #sort, #onlyLB, #onlyPeta, #onlyVegan, #onlyCFNotVegan, #onlyIsrael, #onlyFreeShip, #onlyMen, #onlyIndependent, #avoidNonCFParent"
      )
    ) {
      scheduleRender();
    }
  });

  // מחיר inputs: change min/max, then click "עדכון טווח" or just blur to refresh
  if (priceMinInput) {
    ["change"].forEach((evt) => {
      priceMinInput.addEventListener(evt, () => {
        // do not schedule immediately on every keystroke to avoid flicker;
        // we will let the change event or the button trigger
        scheduleRender();
      });
    });
  }
  if (priceMaxInput) {
    ["change"].forEach((evt) => {
      priceMaxInput.addEventListener(evt, () => {
        scheduleRender();
      });
    });
  }
  if (priceApplyBtn) {
    priceApplyBtn.addEventListener("click", (e) => {
      e.preventDefault();
      scheduleRender();
    });
  }

  // Top category chips
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn || !btn.dataset.cat) return;
    const cat = btn.dataset.cat;
    if (!cat) return;
    currentCat = cat;
        chips.forEach((c) => c.classList.toggle("active", c === btn));
    scheduleRender();
  });

  // Clear-all filters
  clearBtn?.addEventListener("click", () => {
        q.value = "";
    brandSelect.value = "";
    storeSelect.value = "";
    sortSel.value = "price-low";
    typeSelect.value = "";
    onlyLB.checked = false;
    onlyPeta.checked = false;
    (onlyVegan && onlyVegan.checked) = false;
    if (onlyCFNotVegan) (onlyCFNotVegan && onlyCFNotVegan.checked) = false;
    onlyIsrael.checked = false;
    onlyFreeShip.checked = false;
    if (onlyIndependent) (onlyIndependent && onlyIndependent.checked) = false;
    if (avoidNonCFParent) avoidNonCFParent.checked = false;
    if (priceMinInput) priceMinInput.value = "";
    if (priceMaxInput) priceMaxInput.value = "";
    chips.forEach((c) => c.classList.remove("active"));
    const all = chips.find((c) => c.dataset.cat === "all");
    all && all.classList.add("active");
    currentCat = "all";
    scheduleRender();
  });
}
buildSelects();
  initPriceCheckedOn();
  bind();
  render();
})();


function weglotRefresh(){ try{ if(window.Weglot && typeof Weglot.refresh==='function'){ Weglot.refresh(); } }catch(e){} }
