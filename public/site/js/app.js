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
        html += itemRow(item.title, item.count);
        children.forEach(function (c) { html += itemRow(c.title, c.count); });
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

  // activeFilters: { category, collection, camera, lens, country, year } — null means no filter
  var activeFilters = { category: null, collection: null, camera: null, lens: null, country: null, year: null };

  /** Map filter type name → the data-attribute key on .photo-item elements */
  var dataAttrMap = {
    category:   'category',
    collection: 'collection',
    camera:     'camera',
    lens:       'lens',
    country:    'state',
    year:       'year'
  };

  /** Map filter type → which button label to update */
  var defaultLabels = {
    category:   'Category',
    collection: 'Collections',
    camera:     'Camera',
    lens:       'Lens',
    country:    'Location',
    year:       'Year'
  };

  /** Filtering only ever looks at .photo-item elements already in the DOM, but
   *  both views load photos incrementally (infinite scroll) — so a filter can
   *  match photos that haven't been fetched yet and wrongly show zero results
   *  (e.g. picking a country whose photos are all past the first page). Each
   *  view's infinite-scroll IIFE below assigns its own "fetch every remaining
   *  page" function here; whichever view is active wires itself in, the other
   *  stays a no-op. */
  var flowLoadAll = null;
  var gridLoadAll = null;

  /** Run before applying a newly-activated filter so it can see the full photo
   *  set regardless of scroll position. Skipped when no filter is active (i.e.
   *  clearing back to the unfiltered view) so normal lazy infinite scroll keeps
   *  working rather than eagerly fetching everything on every clear. */
  function applyFiltersAfterLoading() {
    var hasActive = Object.keys(activeFilters).some(function (k) { return !!activeFilters[k]; });
    if (!hasActive) { applyFilters(); return; }
    var tasks = [];
    if (flowLoadAll) tasks.push(flowLoadAll());
    if (gridLoadAll) tasks.push(gridLoadAll());
    Promise.all(tasks).then(applyFilters);
  }

  /** Flow view only: photos are pre-split round-robin into N column groups at
   *  full-set order, so filtering down to a subset (hiding the rest in place)
   *  can leave columns badly unbalanced — a column whose photos mostly got
   *  filtered out ends up much shorter than its neighbors. Re-sort the
   *  currently-visible items by their original order and round-robin them
   *  fresh across the columns so the masonry stays balanced under any filter.
   *  Re-parenting existing elements (not rebuilding them) keeps their event
   *  listeners and hover state intact. Run unconditionally so clearing a
   *  filter re-balances back to the full set too. */
  function reflowFlowColumns() {
    var canvas = document.getElementById('flowCanvas');
    if (!canvas) return;
    var columnEls = Array.prototype.slice.call(canvas.querySelectorAll('.flow-column'));
    if (!columnEls.length) return;

    var items = Array.prototype.slice.call(canvas.querySelectorAll('.photo-item'));
    items.sort(function (a, b) {
      return (parseInt(a.getAttribute('data-index'), 10) || 0) - (parseInt(b.getAttribute('data-index'), 10) || 0);
    });
    var visible = items.filter(function (el) { return el.style.display !== 'none'; });
    var hidden  = items.filter(function (el) { return el.style.display === 'none'; });

    var frags = columnEls.map(function () { return document.createDocumentFragment(); });
    visible.forEach(function (el, i) { frags[i % columnEls.length].appendChild(el); });
    // Hidden items don't affect layout (display:none), but keep them parented
    // somewhere so a later filter change can find and re-show them.
    hidden.forEach(function (el, i) { frags[i % columnEls.length].appendChild(el); });
    columnEls.forEach(function (colEl, i) { colEl.appendChild(frags[i]); });
  }

  function applyFilters() {
    var photos = document.querySelectorAll('.photo-item');
    photos.forEach(function (el) {
      var visible = true;
      Object.keys(activeFilters).forEach(function (type) {
        var val = activeFilters[type];
        if (!val) return;
        if (type === 'country') {
          // val can be "country::India" (whole country) or "state::Tokyo" (specific state)
          var prefix = val.slice(0, val.indexOf('::'));
          var slug   = val.slice(val.indexOf('::') + 2).toLowerCase();
          if (prefix === 'country') {
            var photoCountry = (el.getAttribute('data-country') || '').trim().toLowerCase();
            if (photoCountry !== slug) visible = false;
          } else {
            // prefix === 'state'
            var photoState = (el.getAttribute('data-state') || '').trim().toLowerCase();
            if (photoState !== slug) visible = false;
          }
        } else {
          var photoVal = (el.getAttribute('data-' + dataAttrMap[type]) || '').trim().toLowerCase();
          if (photoVal !== val.toLowerCase()) visible = false;
        }
      });
      // Grid's flex strip lays items out in normal document flow, so hiding an
      // item with display:none is enough there — the rest of the row closes
      // the gap on its own. Flow's masonry columns additionally need
      // rebalancing (see reflowFlowColumns) since hiding in place can leave
      // one column much shorter than the others.
      el.style.display = visible ? '' : 'none';
    });
    reflowFlowColumns();
  }

  function setFilter(type, value) {
    // Toggle off if clicking the same value again
    if (activeFilters[type] === value) {
      activeFilters[type] = null;
    } else {
      activeFilters[type] = value;
    }
    updateButtonLabel(type);
    applyFiltersAfterLoading();
  }

  function clearFilter(type) {
    activeFilters[type] = null;
    updateButtonLabel(type);
    applyFiltersAfterLoading();
  }

  /** Build a query string (e.g. "category=Birds&camera=SONY%20A7IV") from the active filters */
  function buildFilterQueryString() {
    var parts = [];
    Object.keys(activeFilters).forEach(function (type) {
      var val = activeFilters[type];
      if (val) parts.push(encodeURIComponent(type) + '=' + encodeURIComponent(val));
    });
    return parts.join('&');
  }

  /** When navigating into a photo from a filtered grid/flow view, carry the active
   *  filters along in the URL so /photo/:slug only shows the filtered photo set. */
  document.addEventListener('click', function (e) {
    var link = e.target.closest('.photo-item');
    if (!link) return;
    var qs = buildFilterQueryString();
    if (!qs) return;
    var base = (link.getAttribute('href') || '').split('?')[0];
    link.setAttribute('href', base + '?' + qs);
  }, true);

  function updateButtonLabel(type) {
    var btnId = type === 'collection' ? 'collectionsBtn' : type + 'Btn';
    var btn = document.getElementById(btnId);
    if (!btn) return;
    var labelEl = btn.querySelector('span');
    if (!labelEl) return;
    var active = activeFilters[type];
    // Location stores "country::India" / "state::Tokyo" internally so applyFilters()
    // can tell the two kinds apart — strip that prefix back off for display.
    if (active && type === 'country' && active.indexOf('::') !== -1) {
      active = active.slice(active.indexOf('::') + 2);
    }
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
    if (!menuEl || !btnEl) return;
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

  // Location (Country/State) — hierarchical picker with search, radio buttons, expand/collapse
  (function () {
    var menuEl = document.getElementById('countryMenu');
    var btnEl  = document.getElementById('countryBtn');
    if (!menuEl || !btnEl) return;
    menuEl.classList.add('oww-dropdown');

    var locationData  = [];   // [{ country, totalCount, states: [{ name, count }] }]
    var expandedSet   = {};   // countryName -> bool
    var searchVal     = '';

    /* ── Build inner HTML from current locationData + search ── */
    function buildLocationHTML() {
      var filtered = locationData.filter(function (c) {
        if (!searchVal) return true;
        var q = searchVal.toLowerCase();
        if (c.country.toLowerCase().includes(q)) return true;
        return c.states.some(function (s) { return s.name.toLowerCase().includes(q); });
      });

      if (filtered.length === 0) {
        return '<p class="px-4 py-3 text-[13px] text-ink/40 dark:text-white/40 italic">No results</p>';
      }

      return filtered.map(function (c) {
        var isExpanded = !!expandedSet[c.country] || (searchVal.length > 0);
        var activeVal  = activeFilters.country;
        var isCountryActive = activeVal === 'country::' + c.country;
        var hasStates  = c.states.length > 0;

        var radioHtml = '<label class="flex items-center justify-center w-4 h-4 shrink-0 cursor-pointer">' +
          '<input type="radio" name="oww-loc" class="sr-only oww-loc-radio" data-kind="country" data-value="' + escAttr(c.country) + '">' +
          '<span class="w-3.5 h-3.5 rounded-full border border-ink/30 dark:border-white/30 flex items-center justify-center' +
          (isCountryActive ? ' border-ink dark:border-white bg-ink dark:bg-white' : '') + '">' +
          (isCountryActive ? '<span class="w-1.5 h-1.5 rounded-full bg-paper dark:bg-ink"></span>' : '') + '</span></label>';

        var arrowHtml = hasStates
          ? '<button type="button" class="oww-loc-expand ml-auto flex items-center justify-center w-6 h-6 rounded text-ink/40 dark:text-white/40 hover:text-ink dark:hover:text-white transition-colors" data-country="' + escAttr(c.country) + '">' +
            '<svg viewBox="0 0 16 16" class="w-3 h-3 transition-transform' + (isExpanded ? ' rotate-180' : '') + '" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6l4 4 4-4"/></svg>' +
            '</button>'
          : '<span class="w-6 ml-auto"></span>';

        var html = '<div class="flex items-center gap-2 px-3 py-2 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] rounded-lg cursor-pointer oww-loc-row" data-kind="country" data-value="' + escAttr(c.country) + '">' +
          radioHtml +
          '<span class="flex-1 text-[14px] text-ink dark:text-white">' + esc(c.country) + '</span>' +
          '<span class="text-[12px] text-ink/35 dark:text-white/35 mr-1">' + c.totalCount + '</span>' +
          arrowHtml +
          '</div>';

        if (isExpanded && hasStates) {
          html += c.states.map(function (s) {
            var isStateActive = activeVal === 'state::' + s.name;
            var stateRadio = '<label class="flex items-center justify-center w-4 h-4 shrink-0 cursor-pointer">' +
              '<input type="radio" name="oww-loc" class="sr-only oww-loc-radio" data-kind="state" data-value="' + escAttr(s.name) + '">' +
              '<span class="w-3 h-3 rounded-full border border-ink/25 dark:border-white/25 flex items-center justify-center' +
              (isStateActive ? ' border-ink dark:border-white bg-ink dark:bg-white' : '') + '">' +
              (isStateActive ? '<span class="w-1.5 h-1.5 rounded-full bg-paper dark:bg-ink"></span>' : '') + '</span></label>';

            return '<div class="flex items-center gap-2 pl-9 pr-3 py-1.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] rounded-lg cursor-pointer oww-loc-row" data-kind="state" data-value="' + escAttr(s.name) + '">' +
              stateRadio +
              '<span class="flex-1 text-[13px] text-ink/80 dark:text-white/80">' + esc(s.name) + '</span>' +
              '<span class="text-[12px] text-ink/30 dark:text-white/30">' + s.count + '</span>' +
              '</div>';
          }).join('');
        }

        return html;
      }).join('');
    }

    /* ── Re-render the list part of the menu ── */
    function rerender() {
      var listEl = menuEl.querySelector('#oww-loc-list');
      if (listEl) listEl.innerHTML = buildLocationHTML();
    }

    /* ── Fetch data and build the full menu shell ── */
    fetch('/api/countries')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        locationData = (data.countries || []).map(function (c) {
          var total = c.states.reduce(function (a, s) { return a + (s.count || 0); }, 0);
          return { country: c.country, totalCount: total, states: c.states };
        });

        menuEl.innerHTML =
          '<div class="flex items-center justify-between px-3 pt-2 pb-1">' +
            '<span class="text-[10px] tracking-[0.12em] uppercase font-semibold text-ink/40 dark:text-white/40">Location</span>' +
            '<button type="button" id="oww-loc-clear" class="text-[12px] text-ink/50 dark:text-white/50 hover:text-ink dark:hover:text-white transition-colors">Clear</button>' +
          '</div>' +
          '<div class="px-3 pb-2">' +
            '<input id="oww-loc-search" type="text" placeholder="Search countries or cities…" autocomplete="off"' +
            ' class="w-full rounded-lg border border-ink/10 dark:border-white/10 bg-ink/[0.03] dark:bg-white/[0.05] px-3 py-1.5 text-[13px] text-ink dark:text-white placeholder:text-ink/30 dark:placeholder:text-white/30 outline-none focus:border-ink/30 dark:focus:border-white/30 transition-colors">' +
          '</div>' +
          '<p class="px-3 pb-1 text-[10px] tracking-[0.1em] uppercase font-semibold text-ink/35 dark:text-white/35">Countries</p>' +
          '<div id="oww-loc-list" class="max-h-[260px] overflow-y-auto px-1 pb-1">' + buildLocationHTML() + '</div>' +
          '<p class="px-3 py-2 text-[11px] text-ink/35 dark:text-white/35 border-t border-ink/8 dark:border-white/8 mt-1">Select a country for all its photographs, or expand it to choose a city.</p>';

        /* Search */
        var searchInput = menuEl.querySelector('#oww-loc-search');
        if (searchInput) {
          searchInput.addEventListener('input', function () {
            searchVal = this.value.trim();
            rerender();
          });
          searchInput.addEventListener('click', function (e) { e.stopPropagation(); });
        }

        /* Clear */
        var clearBtn = menuEl.querySelector('#oww-loc-clear');
        if (clearBtn) {
          clearBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            activeFilters.country = null;
            updateButtonLabel('country');
            applyFiltersAfterLoading();
            menuEl.classList.add('hidden');
          });
        }

        /* Row clicks — country or state selection */
        menuEl.addEventListener('click', function (e) {
          // Each row's visible "radio" is a <label> wrapping a sr-only (clipped,
          // unclickable-by-pointer) <input>. Clicking the label fires a click that
          // bubbles here AND — per native label/control activation — the browser
          // separately dispatches a synthetic click on the input itself, which also
          // bubbles here. Without this guard both events run the toggle logic below,
          // selecting the state and then immediately deselecting it again in the same
          // gesture, so nothing ever appears to get selected.
          if (e.target.closest('.oww-loc-radio')) return;
          var expand = e.target.closest('.oww-loc-expand');
          if (expand) {
            e.stopPropagation();
            var c = expand.getAttribute('data-country');
            expandedSet[c] = !expandedSet[c];
            rerender();
            return;
          }
          var row = e.target.closest('.oww-loc-row');
          if (!row) return;
          e.stopPropagation();
          var kind = row.getAttribute('data-kind');
          var val  = row.getAttribute('data-value');
          if (kind === 'country') {
            // Toggle expand AND select country
            expandedSet[val] = !expandedSet[val];
            var newFilter = activeFilters.country === 'country::' + val ? null : 'country::' + val;
            activeFilters.country = newFilter;
          } else {
            var newFilter = activeFilters.country === 'state::' + val ? null : 'state::' + val;
            activeFilters.country = newFilter;
          }
          updateButtonLabel('country');
          applyFiltersAfterLoading();
          rerender();
          // Only close on a specific-state pick. Closing on a country pick too (the
          // menu had done that unconditionally) meant clicking a country immediately
          // hid the very state list it had just expanded, before the visitor could
          // ever click one — selecting a country worked, but there was no way to then
          // narrow down to a state.
          if (kind === 'state' && activeFilters.country) menuEl.classList.add('hidden');
        });
      })
      .catch(function () {
        menuEl.innerHTML = '<p class="px-4 py-2 text-[13px] text-red-400 italic">Failed to load</p>';
      });

    /* ── Popup toggle ── */
    btnEl.addEventListener('click', function (e) {
      e.stopPropagation();
      if (activeFilters.country) {
        activeFilters.country = null;
        updateButtonLabel('country');
        applyFiltersAfterLoading();
        document.querySelectorAll('.oww-dropdown').forEach(function (d) { d.classList.add('hidden'); });
        return;
      }
      var isHidden = menuEl.classList.contains('hidden');
      document.querySelectorAll('.oww-dropdown').forEach(function (d) { d.classList.add('hidden'); });
      menuEl.classList.toggle('hidden', !isHidden);
      if (!menuEl.classList.contains('hidden')) {
        var si = menuEl.querySelector('#oww-loc-search');
        if (si) setTimeout(function () { si.focus(); }, 50);
      }
    });
    menuEl.addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', function () { menuEl.classList.add('hidden'); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') document.querySelectorAll('.oww-dropdown').forEach(function (d) { d.classList.add('hidden'); });
    });
  })();

  // Year — flat list, most recent first (order returned by the API)
  setupMenu('yearMenu', 'yearBtn', '/api/years', 'years', function (items) {
    return buildFlatHTML(items, false);
  }, 'year');

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

    /* The rail is rendered three times in a row (see detail.ejs) so scrolling past either
     * end continues into a duplicate copy instead of visibly snapping back to the start.
     * photoCount = number of *unique* photos; the "real" middle copy lives at
     * [photoCount, 2*photoCount - 1] and is where we keep activeIdx re-centered. */
    var photoCount = parseInt(track.getAttribute('data-count'), 10) || Math.round(thumbs.length / 3) || thumbs.length;

    /* Find which thumb (within the middle copy) matches the main photo already on screen,
     * so we start with a full copy's worth of buffer to scroll in either direction. */
    var activeIdx = photoCount;
    if (mainPhoto) {
      for (var mi = photoCount; mi < Math.min(2 * photoCount, thumbs.length); mi++) {
        if (thumbs[mi].getAttribute('data-src') === mainPhoto.getAttribute('src')) { activeIdx = mi; break; }
      }
    }
    if (activeIdx >= thumbs.length) activeIdx = thumbs.length - 1;

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
      // Intentionally empty: hover/active highlights removed per design preference
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

    /* ── Dynamic organic sizes & staggered margin offsets ─────────────── */
    var offsetsPattern = [44, 28, 16, 8];
    // Organic size pattern: [width, height] variations (landscape, portrait, square)
    var sizePattern = [
      [78, 56],  // landscape
      [58, 72],  // portrait
      [70, 52],  // landscape wide
      [64, 64],  // square
      [56, 70],  // portrait tall
      [72, 54],  // landscape
      [62, 60],  // square-ish
    ];
    function updateDynamicLayout(animate) {
      thumbs.forEach(function (el, i) {
        var dist = Math.abs(i - activeIdx);

        var ml = (dist < offsetsPattern.length) ? offsetsPattern[dist] : 8;
        var sz = sizePattern[i % sizePattern.length];

        el.style.transition = animate === false
          ? 'none'
          : 'margin-left 0.4s ease-out, transform 0.3s ease-out, opacity 0.3s ease-out, width 0.3s ease-out, height 0.3s ease-out';
        el.style.marginLeft = ml + 'px';
        el.style.width = sz[0] + 'px';
        el.style.height = sz[1] + 'px';
      });
    }

    /* ── Switch active index & center rail ──────────────────────────── */
    function setActivePhoto(idx) {
      if (thumbs.length === 0) return;
      // Clamp defensively — normal ±1 steps never approach these bounds since
      // stepActivePhoto() below keeps activeIdx within the safe middle-copy buffer.
      activeIdx = Math.max(0, Math.min(thumbs.length - 1, idx));
      var th = thumbs[activeIdx];
      selectThumb(th);
      updateDynamicLayout(true);
      centerThumb(activeIdx, true);
    }

    /* ── Step by one photo (used by wheel/keys) — loops forever ──────── */
    function stepActivePhoto(delta) {
      if (thumbs.length === 0) return;
      // If the last step drifted into an outer copy, silently fold back into the
      // safe middle-copy buffer *before* animating the next step — instantly, and
      // reflow-flushed, so it never renders (the outer/middle copies are pixel
      // identical) — then animate normally from there. Checking on every step
      // (rather than waiting for a transition to finish) keeps this correct even
      // when the user scrolls faster than the 0.45s transition.
      if (photoCount > 0 && (activeIdx >= 2 * photoCount || activeIdx < photoCount)) {
        activeIdx += (activeIdx >= 2 * photoCount) ? -photoCount : photoCount;
        centerThumb(activeIdx, false);
        updateDynamicLayout(false);
        void track.offsetHeight; // force reflow so the untransitioned jump commits first
      }
      setActivePhoto(activeIdx + delta);
    }

    /* ── Init: center active thumb on load & set initial dynamic layout ── */
    function init() {
      updateDynamicLayout(false);
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
        stepActivePhoto(1);
      } else if (e.deltaY < 0) {
        stepActivePhoto(-1);
      }
    }, { passive: true });

    /* ── Keyboard: arrow keys navigate photos (Infinite Circular Loop) ──── */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        stepActivePhoto(-1);
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        stepActivePhoto(1);
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
        pBtn.classList.remove('bg-white', 'dark:bg-neutral-900', 'text-neutral-800', 'dark:text-white', 'hover:bg-neutral-100', 'dark:hover:bg-neutral-800');
        pBtn.classList.add('bg-black', 'text-white', 'dark:bg-white', 'dark:text-black', 'hover:bg-neutral-900', 'dark:hover:bg-neutral-100');
        if (stage) stage.style.paddingRight = '380px';
      } else {
        // Close drawer
        panel.classList.add('translate-x-full');
        if (plusIcon) plusIcon.classList.remove('hidden');
        if (closeIcon) closeIcon.classList.add('hidden');
        pBtn.classList.remove('bg-black', 'text-white', 'dark:bg-white', 'dark:text-black', 'hover:bg-neutral-900', 'dark:hover:bg-neutral-100');
        pBtn.classList.add('bg-white', 'dark:bg-neutral-900', 'text-neutral-800', 'dark:text-white', 'hover:bg-neutral-100', 'dark:hover:bg-neutral-800');
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

  /* ── Grid view — infinite horizontal scroll + pagination ───────────
   * The track is rendered as three side-by-side copies (see grid.ejs), each
   * its own flex container, seeded with just the first page of photos
   * (data-page-size / data-offset / data-has-more on #gridStrip, mirroring
   * the Flow view's pagination). We start scrolled to the beginning of the
   * middle copy; whenever native scrolling hits the strip's hard left/right
   * edge, we silently jump scrollLeft by exactly one copy's width — since the
   * copies are pixel-identical, the jump is invisible and the strip appears
   * to scroll forever either way. Before that happens, once the visitor
   * scrolls within LOAD_MARGIN of either edge, the next page is fetched from
   * /api/photos/grid and appended to the tail of each of the three copies —
   * existing nodes are never touched, so scrollLeft (and scrollWidth, which
   * only ever grows) stays valid and nothing visibly jumps. */
  (function () {
    var track = document.getElementById('gridTrack');
    if (!strip || !track) return;
    var copies = Array.prototype.slice.call(track.querySelectorAll('.grid-copy'));
    if (copies.length === 0) return;

    // Fractional/subpixel widths (vw-based gaps & padding, high-DPI rounding) mean
    // strip.scrollWidth - strip.clientWidth is rarely an exact integer match for
    // strip.scrollLeft at the true right edge — a 1px tolerance missed it there
    // often enough that the right side never looped, while the left edge (an exact
    // 0) always worked. A few px of slack fixes both edges symmetrically.
    var EDGE_TOLERANCE = 4;
    // Start fetching the next page once this close (in px) to either copy edge,
    // so the fetch has time to land before the wrap-around scroll gets there.
    var LOAD_MARGIN = 1200;

    var copyWidth = 0;
    var pageSize = parseInt(strip.getAttribute('data-page-size'), 10) || 30;
    var offset = parseInt(strip.getAttribute('data-offset'), 10) || 0;
    var hasMore = strip.getAttribute('data-has-more') === '1';
    var loading = false;

    function buildGridItem(p) {
      var a = document.createElement('a');
      a.href = '/photo/' + encodeURIComponent(p.slug);
      a.className = 'photo-item group relative shrink-0 h-[43.3vh] max-h-[calc(100vh-460px)]';
      a.setAttribute('data-category', p.category || '');
      a.setAttribute('data-collection', p.collection || '');
      a.setAttribute('data-camera', p.camera || '');
      a.setAttribute('data-lens', p.lens || '');
      a.setAttribute('data-country', p.country || '');
      a.setAttribute('data-state', p.state || '');
      a.setAttribute('data-year', p.year || '');
      a.innerHTML =
        '<img src="' + escAttr(p.src) + '" alt="' + escAttr(p.alt) + '" class="h-full w-auto object-cover select-none">' +
        '<span aria-hidden="true" class="pointer-events-none absolute inset-0 grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">' +
          '<span class="w-[68px] h-[68px] rounded-full border border-white/85 grid place-items-center shadow-[0_0_18px_rgba(0,0,0,0.35)]">' +
            '<svg class="w-[26px] h-[26px] text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"></path></svg>' +
          '</span>' +
        '</span>' +
        '<span aria-hidden="true" class="pointer-events-none absolute -top-[12px] -left-[12px] w-[44px] h-[48px] border-t-2 border-l-2 border-[#c8a03c] opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>' +
        '<span aria-hidden="true" class="pointer-events-none absolute -top-[12px] -right-[12px] w-[44px] h-[48px] border-t-2 border-r-2 border-[#c8a03c] opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>' +
        '<span aria-hidden="true" class="pointer-events-none absolute -bottom-[12px] -left-[12px] w-[44px] h-[48px] border-b-2 border-l-2 border-[#c8a03c] opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>' +
        '<span aria-hidden="true" class="pointer-events-none absolute -bottom-[12px] -right-[12px] w-[44px] h-[48px] border-b-2 border-r-2 border-[#c8a03c] opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>' +
        '<span class="pointer-events-none absolute left-1/2 -translate-x-1/2 top-[calc(100%+18px)] whitespace-nowrap text-[15px] text-ink dark:text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300">' + esc(p.cap) + '</span>';
      return a;
    }

    function measure() {
      copyWidth = strip.scrollWidth / copies.length;
    }

    function goToStart() {
      measure();
      if (copyWidth > 0) strip.scrollLeft = copyWidth;
    }

    function loadNextPage() {
      if (loading || !hasMore) return null;
      loading = true;
      return fetch('/api/photos/grid?offset=' + offset + '&limit=' + pageSize)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data.success && data.photos && data.photos.length) {
            copies.forEach(function (copyEl) {
              data.photos.forEach(function (p) { copyEl.appendChild(buildGridItem(p)); });
            });
            offset = data.nextOffset;
            applyFilters();
          }
          hasMore = !!(data && data.hasMore);
          loading = false;
        })
        .catch(function () {
          loading = false; // let the next qualifying scroll retry
        });
    }

    /** Fetch every remaining page up front (ignoring scroll position) so a
     *  newly-activated filter can match photos anywhere in the full set, not
     *  just whatever's scrolled into view so far. See applyFiltersAfterLoading(). */
    function loadAllRemaining() {
      if (!hasMore) return Promise.resolve();
      var p = loadNextPage();
      return p ? p.then(loadAllRemaining) : Promise.resolve();
    }
    gridLoadAll = loadAllRemaining;

    strip.addEventListener('scroll', function () {
      measure();
      if (copyWidth <= 0) return;
      var maxScrollLeft = strip.scrollWidth - strip.clientWidth;

      if (hasMore && (strip.scrollLeft <= LOAD_MARGIN || strip.scrollLeft >= maxScrollLeft - LOAD_MARGIN)) {
        loadNextPage();
      }

      if (strip.scrollLeft <= EDGE_TOLERANCE) {
        strip.scrollLeft += copyWidth;
      } else if (strip.scrollLeft >= maxScrollLeft - EDGE_TOLERANCE) {
        strip.scrollLeft -= copyWidth;
      }
    });

    // Recompute once images have settled their natural size, and again on resize
    // (copy width depends on each photo's rendered aspect ratio).
    window.addEventListener('load', goToStart);
    window.addEventListener('resize', measure);
    requestAnimationFrame(function () { setTimeout(goToStart, 60); });
  })();

  /* ── Flow view — infinite scroll pagination ────────────────────────
   * The server renders the first page already laid out into N column groups
   * (see index.ejs). As the visitor nears #flowSentinel, fetch the next page
   * of real photos from /api/photos/flow, tag each with the next data-index
   * in sequence, and hand off to reflowFlowColumns() (via applyFilters) to
   * slot them into the columns — same balancing logic a filter change uses,
   * so new photos land correctly whether or not a filter is currently active. */
  (function () {
    var canvas = document.getElementById('flowCanvas');
    var sentinel = document.getElementById('flowSentinel');
    if (!canvas || !sentinel) return;

    var columnEls = Array.prototype.slice.call(canvas.querySelectorAll('.flow-column'));
    if (!columnEls.length) return;

    var pageSize = parseInt(canvas.getAttribute('data-page-size'), 10) || 30;
    var offset = parseInt(canvas.getAttribute('data-offset'), 10) || 0;
    var hasMore = canvas.getAttribute('data-has-more') === '1';
    var nextIndex = offset;
    var loading = false;

    function buildPhotoItem(p) {
      var a = document.createElement('a');
      a.href = '/photo/' + encodeURIComponent(p.slug);
      a.className = 'photo-item group relative block hover:z-10 focus-visible:z-10';
      a.setAttribute('data-index', nextIndex++);
      a.setAttribute('data-category', p.category || '');
      a.setAttribute('data-collection', p.collection || '');
      a.setAttribute('data-camera', p.camera || '');
      a.setAttribute('data-lens', p.lens || '');
      a.setAttribute('data-country', p.country || '');
      a.setAttribute('data-state', p.state || '');
      a.setAttribute('data-year', p.year || '');
      a.innerHTML =
        '<img src="' + escAttr(p.src) + '" alt="' + escAttr(p.alt) + '" class="block w-full h-auto select-none">' +
        '<span aria-hidden="true" class="pointer-events-none absolute inset-0 grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">' +
          '<span class="w-[68px] h-[68px] rounded-full border border-white/85 grid place-items-center shadow-[0_0_18px_rgba(0,0,0,0.35)]">' +
            '<svg class="w-[26px] h-[26px] text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"></path></svg>' +
          '</span>' +
        '</span>' +
        '<span aria-hidden="true" class="pointer-events-none absolute -top-[12px] -left-[12px] w-[44px] h-[48px] border-t-2 border-l-2 border-[#c8a03c] opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>' +
        '<span aria-hidden="true" class="pointer-events-none absolute -top-[12px] -right-[12px] w-[44px] h-[48px] border-t-2 border-r-2 border-[#c8a03c] opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>' +
        '<span aria-hidden="true" class="pointer-events-none absolute -bottom-[12px] -left-[12px] w-[44px] h-[48px] border-b-2 border-l-2 border-[#c8a03c] opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>' +
        '<span aria-hidden="true" class="pointer-events-none absolute -bottom-[12px] -right-[12px] w-[44px] h-[48px] border-b-2 border-r-2 border-[#c8a03c] opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>' +
        '<span class="pointer-events-none absolute left-1/2 -translate-x-1/2 top-[calc(100%+18px)] whitespace-nowrap text-[15px] text-ink dark:text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300">' + esc(p.cap) + '</span>';
      return a;
    }

    var observer = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) loadNextPage();
    }, { rootMargin: '800px 0px' });

    function appendPhotos(newPhotos) {
      // Placement doesn't matter here — applyFilters()'s reflowFlowColumns()
      // immediately re-sorts every item by data-index and redistributes them
      // evenly, so just get the new nodes into the DOM.
      newPhotos.forEach(function (p) {
        columnEls[0].appendChild(buildPhotoItem(p));
      });
      applyFilters();
    }

    function loadNextPage() {
      if (loading || !hasMore) return null;
      loading = true;
      return fetch('/api/photos/flow?offset=' + offset + '&limit=' + pageSize)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data.success && data.photos && data.photos.length) {
            appendPhotos(data.photos);
            offset = data.nextOffset;
          }
          hasMore = !!(data && data.hasMore);
          if (!hasMore) observer.unobserve(sentinel);
          loading = false;
        })
        .catch(function () {
          loading = false; // let the observer retry on the next intersection
        });
    }

    /** Fetch every remaining page up front (ignoring scroll position) so a
     *  newly-activated filter can match photos anywhere in the full set, not
     *  just whatever's scrolled into view so far. See applyFiltersAfterLoading(). */
    function loadAllRemaining() {
      if (!hasMore) return Promise.resolve();
      var p = loadNextPage();
      return p ? p.then(loadAllRemaining) : Promise.resolve();
    }
    flowLoadAll = loadAllRemaining;

    if (hasMore) observer.observe(sentinel);
  })();
})();
