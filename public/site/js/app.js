/* public/js/app.js — dark mode, API-driven filter menus, photo filtering, horizontal strip scroll */
(function () {
  var root = document.documentElement;
  var KEY = 'oww:theme';

  if (localStorage.getItem(KEY) === 'dark') root.classList.add('dark');

  var t = document.getElementById('themeToggle');
  if (t) t.addEventListener('click', function () {
    root.classList.toggle('dark');
    localStorage.setItem(KEY, root.classList.contains('dark') ? 'dark' : 'light');
  });

  /* ── HTML helpers ────────────────────────────────────────────────── */

  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escAttr(str) {
    return String(str || '').replace(/"/g, '&quot;');
  }

  function itemRow(name, count) {
    return (
      '<button type="button" data-name="' + escAttr(name) + '"' +
      ' class="oww-filter-item w-full flex items-center justify-between px-4 py-1.5 text-[15px] text-left' +
      ' hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors">' +
      '<span>' + esc(name) + '</span>' +
      '<span class="text-ink/35 dark:text-white/35">[' + (count || 0) + ']</span>' +
      '</button>'
    );
  }

  function brandHeader(label) {
    return (
      '<p class="px-4 pt-2 pb-1 text-[11px] tracking-[0.06em] uppercase text-ink/40 dark:text-white/40">' +
      esc(label) + '</p>'
    );
  }

  function emptyMsg(text) {
    return '<p class="px-4 py-2 text-[13px] text-ink/35 dark:text-white/35 italic">' + esc(text) + '</p>';
  }

  function buildGroupedHTML(groups) {
    if (!groups || groups.length === 0) return emptyMsg('None found');
    return groups.map(function (g) {
      var rows = (g.models || []).map(function (m) { return itemRow(m.name, m.count); }).join('');
      return brandHeader(g.brand) + rows;
    }).join('');
  }

  function buildFlatHTML(items, groupByParent) {
    if (!items || items.length === 0) return emptyMsg('None found');
    if (groupByParent) {
      var parentMap = {};
      var topLevel = [];
      items.forEach(function (item) {
        var p = (item.parent || '').trim();
        if (!p || p === 'None') { topLevel.push(item); }
        else {
          if (!parentMap[p]) parentMap[p] = [];
          parentMap[p].push(item);
        }
      });
      var html = '';
      topLevel.forEach(function (item) {
        var children = parentMap[item.title] || [];
        if (children.length > 0) {
          html += brandHeader(item.title);
          children.forEach(function (c) { html += itemRow(c.title, c.count); });
        } else {
          html += itemRow(item.title, item.count);
        }
      });
      Object.keys(parentMap).forEach(function (p) {
        var exists = topLevel.some(function (t) { return t.title === p; });
        if (!exists) {
          html += brandHeader(p);
          parentMap[p].forEach(function (c) { html += itemRow(c.title, c.count); });
        }
      });
      return html || emptyMsg('None found');
    }
    return items.map(function (item) { return itemRow(item.title, item.count); }).join('');
  }

  /* ── Photo filtering ─────────────────────────────────────────────── */

  // activeFilters: { category, collection, camera, lens } — null means no filter
  var activeFilters = { category: null, collection: null, camera: null, lens: null };

  /** Map filter type name → the data-attribute key on .photo-item elements */
  var dataAttrMap = {
    category:   'category',
    collection: 'collection',
    camera:     'camera',
    lens:       'lens'
  };

  /** Map filter type → which button label to update */
  var defaultLabels = {
    category:   'Category',
    collection: 'Collections',
    camera:     'Camera',
    lens:       'Lens'
  };

  function applyFilters() {
    var photos = document.querySelectorAll('.photo-item');
    photos.forEach(function (el) {
      var visible = true;
      Object.keys(activeFilters).forEach(function (type) {
        var val = activeFilters[type];
        if (!val) return; // no filter active for this type
        var photoVal = (el.getAttribute('data-' + dataAttrMap[type]) || '').trim().toLowerCase();
        if (photoVal !== val.toLowerCase()) visible = false;
      });
      // For flow (absolute positioned), toggle visibility + pointer events
      // For grid (flex item), toggle display
      if (el.style.position === 'absolute' || el.classList.contains('absolute')) {
        el.style.opacity    = visible ? '' : '0';
        el.style.pointerEvents = visible ? '' : 'none';
        el.style.visibility = visible ? '' : 'hidden';
      } else {
        el.style.display = visible ? '' : 'none';
      }
    });
  }

  function setFilter(type, value) {
    // Toggle off if clicking the same value again
    if (activeFilters[type] === value) {
      activeFilters[type] = null;
    } else {
      activeFilters[type] = value;
    }
    updateButtonLabel(type);
    applyFilters();
  }

  function clearFilter(type) {
    activeFilters[type] = null;
    updateButtonLabel(type);
    applyFilters();
  }

  function updateButtonLabel(type) {
    var btnId = type === 'collection' ? 'collectionsBtn' : type + 'Btn';
    var btn = document.getElementById(btnId);
    if (!btn) return;
    var labelEl = btn.querySelector('span');
    if (!labelEl) return;
    var active = activeFilters[type];
    if (active) {
      // Truncate long names for the pill
      var short = active.length > 16 ? active.substring(0, 14) + '…' : active;
      labelEl.textContent = short + ' ×';
      btn.classList.add('text-[#c8a03c]');
      btn.classList.remove('text-ink/75', 'dark:text-white/75');
    } else {
      labelEl.textContent = defaultLabels[type];
      btn.classList.remove('text-[#c8a03c]');
      btn.classList.add('text-ink/75', 'dark:text-white/75');
    }
  }

  /* ── Generic popup wiring ─────────────────────────────────────────── */

  function wirePopup(menuEl, triggerBtn, filterType) {
    if (!menuEl || !triggerBtn) return;

    // Clicking the trigger: if active filter, clear it; else open menu
    triggerBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      // If filter is active, first click clears it without opening the menu
      if (activeFilters[filterType]) {
        clearFilter(filterType);
        // close all menus
        document.querySelectorAll('.oww-dropdown').forEach(function (d) { d.classList.add('hidden'); });
        return;
      }
      var isHidden = menuEl.classList.contains('hidden');
      document.querySelectorAll('.oww-dropdown').forEach(function (d) { d.classList.add('hidden'); });
      menuEl.classList.toggle('hidden', !isHidden);
    });

    menuEl.addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', function () { menuEl.classList.add('hidden'); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        document.querySelectorAll('.oww-dropdown').forEach(function (d) { d.classList.add('hidden'); });
      }
    });
  }

  /* ── Wire filter item clicks inside a menu ────────────────────────── */

  function wireFilterItems(menuEl, filterType) {
    if (!menuEl) return;
    // Use event delegation — items are added dynamically
    menuEl.addEventListener('click', function (e) {
      var btn = e.target.closest('.oww-filter-item');
      if (!btn) return;
      e.stopPropagation();
      var name = btn.getAttribute('data-name') || '';
      setFilter(filterType, name);
      menuEl.classList.add('hidden');
    });
  }

  /* ── Setup a menu: fetch → render → wire ─────────────────────────── */

  function setupMenu(menuId, btnId, apiUrl, dataKey, renderFn, filterType) {
    var menuEl = document.getElementById(menuId);
    var btnEl  = document.getElementById(btnId);
    if (!menuEl) return;
    menuEl.classList.add('oww-dropdown');
    wirePopup(menuEl, btnEl, filterType);
    wireFilterItems(menuEl, filterType);

    fetch(apiUrl)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        menuEl.innerHTML = renderFn(data[dataKey]);
      })
      .catch(function () {
        menuEl.innerHTML = '<p class="px-4 py-2 text-[13px] text-red-400 italic">Failed to load</p>';
      });
  }

  // Category — grouped by parent hierarchy
  setupMenu('categoryMenu', 'categoryBtn', '/api/categories', 'categories', function (items) {
    return buildFlatHTML(items, true);
  }, 'category');

  // Collections — flat list
  setupMenu('collectionsMenu', 'collectionsBtn', '/api/collections', 'collections', function (items) {
    return buildFlatHTML(items, false);
  }, 'collection');

  // Camera — grouped by brand
  setupMenu('cameraMenu', 'cameraBtn', '/api/cameras', 'cameras', buildGroupedHTML, 'camera');

  // Lens — grouped by brand
  setupMenu('lensMenu', 'lensBtn', '/api/lenses', 'lenses', buildGroupedHTML, 'lens');

  /* ── Bottom bar pill highlight (legacy — kept for visual only) ────── */
  document.querySelectorAll('[data-filter]').forEach(function (b) {
    b.addEventListener('click', function () {
      // Only update non-active styling (filter logic is above)
      // Do nothing extra here — wirePopup already handles it
    });
  });

  /* ── Detail page — vertical thumbnail slider ──────────────────────── */
  (function () {
    var track    = document.getElementById('railTrack');
    var viewport = document.getElementById('railViewport');
    var prevBtn  = document.getElementById('railPrev');
    var nextBtn  = document.getElementById('railNext');
    var mainPhoto = document.getElementById('mainPhoto');
    if (!track || !viewport) return;

    var thumbs = Array.prototype.slice.call(track.querySelectorAll('.rail-thumb'));
    if (thumbs.length === 0) return;

    var currentIdx = 0;  // index of top-most visible thumb
    var STEP = 1;        // advance one thumb at a time

    /* Find which thumb matches the main photo already on screen */
    var activeIdx = 0;
    if (mainPhoto) {
      thumbs.forEach(function (th, i) {
        if (th.getAttribute('data-src') === mainPhoto.getAttribute('src')) activeIdx = i;
      });
    }

    /* ── Measure a single thumb height (incl. gap) ───────────────────── */
    function thumbUnitHeight() {
      if (thumbs.length < 2) return thumbs[0].offsetHeight + 8;
      var rect0 = thumbs[0].getBoundingClientRect();
      var rect1 = thumbs[1].getBoundingClientRect();
      return rect1.top - rect0.top;           // includes gap
    }

    /* ── How many thumbs fit in the viewport? ────────────────────────── */
    function visibleCount() {
      var unit = thumbUnitHeight();
      return unit > 0 ? Math.max(1, Math.floor(viewport.clientHeight / unit)) : 4;
    }

    /* ── Slide the track so active thumb is centered vertically ─────── */
    function centerThumb(idx, animate) {
      var activeThumb = thumbs[idx];
      if (!activeThumb) return;

      var thumbOffsetTop = activeThumb.offsetTop;
      var thumbHeight = activeThumb.offsetHeight;
      var viewportHeight = viewport.clientHeight;

      // Calculate translation so active thumbnail sits in exact vertical center of viewport
      var targetY = (viewportHeight / 2) - (thumbOffsetTop + thumbHeight / 2);

      track.style.transition = animate === false
        ? 'none'
        : 'transform 0.45s cubic-bezier(.2,.7,.2,1)';
      track.style.transform = 'translateY(' + targetY + 'px)';
    }

    /* ── Mark active thumb ───────────────────────────────────────────── */
    function markActive(th) {
      thumbs.forEach(function (el) {
        var isActive = (el === th);
        el.classList.toggle('ring-2', isActive);
        el.classList.toggle('ring-amber-500', isActive);
        el.classList.toggle('scale-[1.1]', isActive);
        el.classList.toggle('z-10', isActive);
        el.classList.toggle('opacity-70', !isActive);
      });
    }

    /* ── Select thumb: update main photo & right side panel ─────────── */
    function selectThumb(th) {
      if (!th) return;
      
      // Update Main Photo with Fade Animation
      if (mainPhoto) {
        var src = th.getAttribute('data-src');
        var alt = th.getAttribute('data-alt');
        mainPhoto.src = src;
        mainPhoto.alt = alt || '';
        mainPhoto.style.animationDelay = '0s';
        mainPhoto.classList.remove('fade-up');
        void mainPhoto.offsetWidth;
        mainPhoto.classList.add('fade-up');
      }

      // Update Right Side Details Panel text (only update DOM values; do not force panel open on scroll)
      var panel = document.getElementById('detailsPanel');
      if (panel) {
        var elKicker = panel.querySelector('[data-field="kicker"]');
        var elTitle = panel.querySelector('[data-field="title"]');
        var elRef = panel.querySelector('[data-field="ref"]');
        var elAbout = panel.querySelector('[data-field="about"]');
        var elAltNote = panel.querySelector('[data-field="altNote"]');
        var elCollection = panel.querySelector('[data-field="collection"]');
        var elCamera = panel.querySelector('[data-field="camera"]');
        var elDate = panel.querySelector('[data-field="date"]');
        var elLocation = panel.querySelector('[data-field="location"]');
        var elCategory = panel.querySelector('[data-field="category"]');
        var elSettings = panel.querySelector('[data-field="settings"]');

        if (elKicker && th.dataset.kicker) elKicker.textContent = th.dataset.kicker;
        if (elTitle && th.dataset.title) elTitle.textContent = th.dataset.title;
        if (elRef && th.dataset.ref) elRef.textContent = th.dataset.ref;
        if (elAbout && th.dataset.about !== undefined) elAbout.textContent = th.dataset.about;
        if (elAltNote && th.dataset.altnote !== undefined) elAltNote.textContent = th.dataset.altnote;
        if (elCollection && th.dataset.collection !== undefined) elCollection.textContent = th.dataset.collection;
        
        if (elCamera && th.dataset.camera && th.dataset.lens) {
          elCamera.innerHTML = th.dataset.camera + ' / <span class="text-amber-600 dark:text-amber-400">' + th.dataset.lens + '</span>';
        }

        if (elDate && th.dataset.date) elDate.textContent = th.dataset.date;
        if (elLocation && th.dataset.location) elLocation.textContent = th.dataset.location;
        if (elCategory && th.dataset.category) elCategory.textContent = th.dataset.category;
        if (elSettings && th.dataset.settings) elSettings.textContent = th.dataset.settings;
      }

      markActive(th);
      var href = th.getAttribute('data-href');
      if (href && window.history.replaceState) window.history.replaceState(null, '', href);
    }

    /* ── Calculate dynamic margin offset based on distance from activeIdx ─ */
    /* Active photo = 34px indent (peak), 1 away = 22px, 2+ away = 8px */
    var offsetsPattern = [34, 22, 8];
    function updateDynamicLayout() {
      var n = thumbs.length;
      thumbs.forEach(function (el, i) {
        var dist = Math.abs(i - activeIdx);
        // Also account for circular wrap-around distance
        dist = Math.min(dist, n - dist);

        var ml = (dist < offsetsPattern.length) ? offsetsPattern[dist] : 8;
        el.style.transition = 'margin-left 0.4s ease-out, transform 0.3s ease-out, opacity 0.3s ease-out';
        el.style.marginLeft = ml + 'px';
        el.style.width = '50px';
        el.style.height = '52px';
      });
    }

    /* ── Switch active index & center rail ──────────────────────────── */
    function setActivePhoto(idx) {
      var n = thumbs.length;
      if (n === 0) return;
      activeIdx = ((idx % n) + n) % n; // Circular modulo wrap around
      var th = thumbs[activeIdx];
      selectThumb(th);
      updateDynamicLayout();
      centerThumb(activeIdx, true);
    }

    /* ── Init: center active thumb on load & set initial dynamic layout ── */
    function init() {
      updateDynamicLayout();
      centerThumb(activeIdx, false);
      markActive(thumbs[activeIdx]);
    }

    requestAnimationFrame(function () { setTimeout(init, 60); });

    /* ── Page-wide Mouse-wheel navigation (Infinite Circular Loop) ─────── */
    var lastWheelTime = 0;
    document.addEventListener('wheel', function (e) {
      // Don't trigger when scrolling inside details panel
      if (e.target.closest('#detailsPanel')) return;
      var now = Date.now();
      if (now - lastWheelTime < 250) return; // Debounce wheel
      lastWheelTime = now;

      if (e.deltaY > 0) {
        setActivePhoto(activeIdx + 1);
      } else if (e.deltaY < 0) {
        setActivePhoto(activeIdx - 1);
      }
    }, { passive: true });

    /* ── Keyboard: arrow keys navigate photos (Infinite Circular Loop) ──── */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        setActivePhoto(activeIdx - 1);
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        setActivePhoto(activeIdx + 1);
      }
    });

    /* ── Click a thumb ───────────────────────────────────────────────── */
    thumbs.forEach(function (th, i) {
      th.addEventListener('click', function (e) {
        e.preventDefault();
        setActivePhoto(i);
      });
    });
  })();

  /* ── Detail page — details panel drawer ──────────────────────────── */
  var panel = document.getElementById('detailsPanel');
  var pBtn  = document.getElementById('detailToggle');
  var stage = document.getElementById('stage');
  if (panel && pBtn) {
    var plusIcon  = document.getElementById('detailPlus');
    var closeIcon = document.getElementById('detailClose');
    pBtn.addEventListener('click', function () {
      var isCurrentlyClosed = panel.classList.contains('translate-x-full');
      if (isCurrentlyClosed) {
        // Open drawer
        panel.classList.remove('translate-x-full');
        if (plusIcon) plusIcon.classList.add('hidden');
        if (closeIcon) closeIcon.classList.remove('hidden');
        pBtn.classList.add('bg-black', 'text-white', 'dark:bg-white', 'dark:text-black');
        if (stage) stage.style.paddingRight = '380px';
      } else {
        // Close drawer
        panel.classList.add('translate-x-full');
        if (plusIcon) plusIcon.classList.remove('hidden');
        if (closeIcon) closeIcon.classList.add('hidden');
        pBtn.classList.remove('bg-black', 'text-white', 'dark:bg-white', 'dark:text-black');
        if (stage) stage.style.paddingRight = '120px';
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.classList.contains('translate-x-full')) pBtn.click();
    });
  }

  /* ── Detail page — EDITED / RAW ──────────────────────────────────── */
  document.querySelectorAll('[data-take]').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('[data-take]').forEach(function (o) {
        var on = o === b;
        o.classList.toggle('bg-ink', on);
        o.classList.toggle('text-white', on);
        o.classList.toggle('dark:bg-white', on);
        o.classList.toggle('dark:text-ink', on);
        o.classList.toggle('font-medium', on);
        o.classList.toggle('text-ink/45', !on);
        o.classList.toggle('dark:text-white/45', !on);
      });
    });
  });

  /* ── Detail page — ambient sound ─────────────────────────────────── */
  var amb = document.getElementById('ambientBtn');
  if (amb) amb.addEventListener('click', function () {
    amb.classList.toggle('text-ink/55');
    amb.classList.toggle('dark:text-white/55');
  });

  /* ── Grid view — let a normal wheel scroll the strip sideways ─────── */
  var strip = document.getElementById('gridStrip');
  if (strip) strip.addEventListener('wheel', function (e) {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    e.preventDefault();
    strip.scrollLeft += e.deltaY;
  }, { passive: false });
})();
