/* public/js/app.js — dark mode, API-driven filter menus, photo filtering, horizontal strip scroll */
(function () {
  var root = document.documentElement;
  var KEY = "oww:theme";

  if (localStorage.getItem(KEY) === "dark") root.classList.add("dark");

  // Desktop header and the mobile nav panel each have their own copy of this
  // button (same markup, different layout context) — wire both to the same toggle.
  document.querySelectorAll(".js-theme-toggle").forEach(function (btn) {
    btn.addEventListener("click", function () {
      root.classList.toggle("dark");
      localStorage.setItem(
        KEY,
        root.classList.contains("dark") ? "dark" : "light",
      );
    });
  });

  /* ── Mobile / tablet header hamburger ────────────────────────────── */
  (function () {
    var toggle = document.getElementById("navToggle");
    var panel = document.getElementById("navPanel");
    var iconOpen = document.getElementById("navIconOpen");
    var iconClose = document.getElementById("navIconClose");

    if (!toggle || !panel) return;

    function setOpen(open) {
      panel.classList.toggle("hidden", !open);

      if (iconOpen) {
        iconOpen.classList.toggle("hidden", open);
      }

      if (iconClose) {
        iconClose.classList.toggle("hidden", !open);
      }

      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    }

    toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      setOpen(panel.classList.contains("hidden"));
    });

    panel.addEventListener("click", function (e) {
      e.stopPropagation();
    });

    document.addEventListener("click", function () {
      setOpen(false);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    });

    var themeToggle = panel.querySelector(".js-theme-toggle");

    if (themeToggle) {
      themeToggle.addEventListener("click", function () {
        setOpen(false);
      });
    }
  })();

  /* ── Mobile / tablet filter bar ───────────────────────────────────── */
  (function () {
    var toggle = document.getElementById("filtersToggle");
    var group = document.getElementById("filtersGroup");

    if (!toggle || !group) return;

    function setOpen(open) {
      group.classList.toggle("hidden", !open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    }

    toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      setOpen(group.classList.contains("hidden"));
    });

    group.addEventListener("click", function (e) {
      e.stopPropagation();
    });

    document.addEventListener("click", function () {
      setOpen(false);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    });
  })();

  /* ── HTML helpers ────────────────────────────────────────────────── */

  function esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escAttr(str) {
    return String(str || "").replace(/"/g, "&quot;");
  }

  function itemRow(name, count) {
    return (
      '<button type="button" data-name="' +
      escAttr(name) +
      '"' +
      ' class="oww-filter-item w-full flex items-center justify-between px-4 py-1.5 text-[15px] text-left' +
      ' hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors">' +
      "<span>" +
      esc(name) +
      "</span>" +
      '<span class="text-ink/35 dark:text-white/35">[' +
      (count || 0) +
      "]</span>" +
      "</button>"
    );
  }

  function brandHeader(label) {
    return (
      '<p class="px-4 pt-2 pb-1 text-[11px] tracking-[0.06em] uppercase text-ink/40 dark:text-white/40">' +
      esc(label) +
      "</p>"
    );
  }

  function emptyMsg(text) {
    return (
      '<p class="px-4 py-2 text-[13px] text-ink/35 dark:text-white/35 italic">' +
      esc(text) +
      "</p>"
    );
  }

  function buildGroupedHTML(groups) {
    if (!groups || groups.length === 0) {
      return emptyMsg("None found");
    }

    return groups
      .map(function (g) {
        var rows = (g.models || [])
          .map(function (m) {
            return itemRow(m.name, m.count);
          })
          .join("");

        return brandHeader(g.brand) + rows;
      })
      .join("");
  }

  function buildFlatHTML(items, groupByParent) {
    if (!items || items.length === 0) {
      return emptyMsg("None found");
    }

    if (groupByParent) {
      var parentMap = {};
      var topLevel = [];

      items.forEach(function (item) {
        var p = (item.parent || "").trim();

        if (!p || p === "None") {
          topLevel.push(item);
        } else {
          if (!parentMap[p]) {
            parentMap[p] = [];
          }

          parentMap[p].push(item);
        }
      });

      var html = "";

      topLevel.forEach(function (item) {
        var children = parentMap[item.title] || [];

        html += itemRow(item.title, item.count);

        children.forEach(function (c) {
          html += itemRow(c.title, c.count);
        });
      });

      Object.keys(parentMap).forEach(function (p) {
        var exists = topLevel.some(function (t) {
          return t.title === p;
        });

        if (!exists) {
          html += brandHeader(p);

          parentMap[p].forEach(function (c) {
            html += itemRow(c.title, c.count);
          });
        }
      });

      return html || emptyMsg("None found");
    }

    return items
      .map(function (item) {
        return itemRow(item.title, item.count);
      })
      .join("");
  }

  /* ── Photo filtering ─────────────────────────────────────────────── */

  var activeFilters = {
    category: null,
    collection: null,
    camera: null,
    lens: null,
    country: null,
    year: null,
  };

  (function initFiltersFromURL() {
    var qs = window.location.search.substring(1);
    if (!qs) return;
    var pairs = qs.split("&");
    var hasActive = false;
    pairs.forEach(function (pair) {
      var kv = pair.split("=");
      if (kv.length === 2) {
        var key = decodeURIComponent(kv[0]);
        var val = decodeURIComponent(kv[1]);
        if (activeFilters.hasOwnProperty(key)) {
          activeFilters[key] = val;
          hasActive = true;
        }
      }
    });

    if (hasActive) {
      document.addEventListener("DOMContentLoaded", function () {
        Object.keys(activeFilters).forEach(function (key) {
          if (activeFilters[key]) updateButtonLabel(key);
        });
        applyFiltersAfterLoading();
      });
    }
  })();

  var dataAttrMap = {
    category: "category",
    collection: "collection",
    camera: "camera",
    lens: "lens",
    country: "state",
    year: "year",
  };

  var defaultLabels = {
    category: "Category",
    collection: "Collections",
    camera: "Camera",
    lens: "Lens",
    country: "Location",
    year: "Year",
  };

  /*
   * Both Flow and Grid load photos incrementally.
   *
   * When a filter is selected, we load the remaining photos first so the
   * filter can search the complete photo set instead of only the photos
   * currently present in the DOM.
   */
  var flowLoadAll = null;
  var gridLoadAll = null;

  function applyFiltersAfterLoading() {
    var hasActive = Object.keys(activeFilters).some(function (k) {
      return !!activeFilters[k];
    });

    if (!hasActive) {
      applyFilters();
      return;
    }

    var tasks = [];

    if (flowLoadAll) {
      tasks.push(flowLoadAll());
    }

    if (gridLoadAll) {
      tasks.push(gridLoadAll());
    }

    Promise.all(tasks).then(function () {
      applyFilters();
    });
  }

  /*
   * CSS Columns masonry does the layout itself.
   *
   * We intentionally DO NOT move/re-parent photo elements here.
   *
   * With:
   *
   *   columns-2 md:columns-4
   *
   * the browser automatically repacks visible elements when display:none
   * is applied to filtered photos.
   */
  function applyFilters() {
    var photos = document.querySelectorAll(".photo-item");

    photos.forEach(function (el) {
      var visible = true;

      Object.keys(activeFilters).forEach(function (type) {
        var val = activeFilters[type];

        if (!val) return;

        if (type === "country") {
          var separatorIndex = val.indexOf("::");

          if (separatorIndex === -1) {
            visible = false;
            return;
          }

          var prefix = val.slice(0, separatorIndex);
          var slug = val.slice(separatorIndex + 2).toLowerCase();

          if (prefix === "country") {
            var photoCountry = (el.getAttribute("data-country") || "")
              .trim()
              .toLowerCase();

            if (photoCountry !== slug) {
              visible = false;
            }
          } else {
            var photoState = (el.getAttribute("data-state") || "")
              .trim()
              .toLowerCase();

            if (photoState !== slug) {
              visible = false;
            }
          }
        } else {
          var photoVal = (el.getAttribute("data-" + dataAttrMap[type]) || "")
            .trim()
            .toLowerCase();

          if (photoVal !== val.toLowerCase()) {
            visible = false;
          }
        }
      });

      el.style.display = visible ? "" : "none";
    });
  }

  function setFilter(type, value) {
    if (activeFilters[type] === value) {
      activeFilters[type] = null;
    } else {
      activeFilters[type] = value;
    }

    updateButtonLabel(type);
    applyFiltersAfterLoading();
    updateURLQuery();
  }

  function clearFilter(type) {
    activeFilters[type] = null;

    updateButtonLabel(type);
    applyFiltersAfterLoading();
    updateURLQuery();
  }

  function buildFilterQueryString() {
    var parts = [];

    Object.keys(activeFilters).forEach(function (type) {
      var val = activeFilters[type];

      if (val) {
        parts.push(encodeURIComponent(type) + "=" + encodeURIComponent(val));
      }
    });

    return parts.join("&");
  }

  function updateURLQuery() {
    var qs = buildFilterQueryString();
    var newUrl = window.location.pathname;
    if (qs) {
      newUrl += "?" + qs;
    }
    history.replaceState(null, "", newUrl);
  }

  /*
   * Carry active filters into the photo detail page.
   */
  document.addEventListener(
    "click",
    function (e) {
      var link = e.target.closest(".photo-item");

      if (!link) return;

      var qs = buildFilterQueryString();

      if (!qs) return;

      var base = (link.getAttribute("href") || "").split("?")[0];

      link.setAttribute("href", base + "?" + qs);
    },
    true,
  );

  function updateButtonLabel(type) {
    var btnId = type === "collection" ? "collectionsBtn" : type + "Btn";
    var btn = document.getElementById(btnId);

    if (!btn) return;

    var labelEl = btn.querySelector("span");

    if (!labelEl) return;

    var active = activeFilters[type];

    if (active && type === "country" && active.indexOf("::") !== -1) {
      active = active.slice(active.indexOf("::") + 2);
    }

    if (active) {
      var short = active.length > 16 ? active.substring(0, 14) + "…" : active;

      labelEl.innerHTML = defaultLabels[type] + ' <span class="ml-1.5 px-2 py-0.5 rounded-[6px] bg-black/5 dark:bg-white/10 text-[13px] text-ink dark:text-white font-medium">' + esc(short) + '</span>';

      btn.classList.add("text-ink", "dark:text-white");
      btn.classList.remove("text-ink/75", "dark:text-white/75", "text-[#c8a03c]");
    } else {
      labelEl.textContent = defaultLabels[type];

      btn.classList.remove("text-ink", "dark:text-white", "text-[#c8a03c]");
      btn.classList.add("text-ink/75", "dark:text-white/75");
    }
  }

  /* ── Generic popup wiring ─────────────────────────────────────────── */


  function wirePopup(menuEl, triggerBtn, filterType) {
    if (!menuEl || !triggerBtn) return;

    triggerBtn.addEventListener("click", function (e) {
      e.stopPropagation();

      if (activeFilters[filterType]) {
        clearFilter(filterType);

        document.querySelectorAll(".oww-dropdown").forEach(function (d) {
          d.classList.add("hidden");
        });

        return;
      }

      var isHidden = menuEl.classList.contains("hidden");

      document.querySelectorAll(".oww-dropdown").forEach(function (d) {
        d.classList.add("hidden");
      });

      menuEl.classList.toggle("hidden", !isHidden);
    });

    menuEl.addEventListener("click", function (e) {
      e.stopPropagation();
    });

    document.addEventListener("click", function () {
      menuEl.classList.add("hidden");
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        document.querySelectorAll(".oww-dropdown").forEach(function (d) {
          d.classList.add("hidden");
        });
      }
    });
  }

  /* ── Wire filter item clicks inside a menu ────────────────────────── */

  function wireFilterItems(menuEl, filterType) {
    if (!menuEl) return;

    menuEl.addEventListener("click", function (e) {
      var btn = e.target.closest(".oww-filter-item");

      if (!btn) return;

      e.stopPropagation();

      var name = btn.getAttribute("data-name") || "";

      setFilter(filterType, name);

      menuEl.classList.add("hidden");
    });
  }

  /* ── Setup a menu: fetch → render → wire ─────────────────────────── */

  function setupMenu(menuId, btnId, apiUrl, dataKey, renderFn, filterType) {
    var menuEl = document.getElementById(menuId);

    var btnEl = document.getElementById(btnId);

    if (!menuEl || !btnEl) return;

    menuEl.classList.add("oww-dropdown");

    wirePopup(menuEl, btnEl, filterType);

    wireFilterItems(menuEl, filterType);

    fetch(apiUrl)
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        menuEl.innerHTML = renderFn(data[dataKey]);
      })
      .catch(function () {
        menuEl.innerHTML =
          '<p class="px-4 py-2 text-[13px] text-red-400 italic">Failed to load</p>';
      });
  }

  /* ── Category ────────────────────────────────────────────────────── */

  setupMenu(
    "categoryMenu",
    "categoryBtn",
    "/api/categories",
    "categories",
    function (items) {
      return buildFlatHTML(items, true);
    },
    "category",
  );

  /* ── Collections ─────────────────────────────────────────────────── */

  setupMenu(
    "collectionsMenu",
    "collectionsBtn",
    "/api/collections",
    "collections",
    function (items) {
      return buildFlatHTML(items, false);
    },
    "collection",
  );

  /* ── Camera ──────────────────────────────────────────────────────── */

  setupMenu(
    "cameraMenu",
    "cameraBtn",
    "/api/cameras",
    "cameras",
    buildGroupedHTML,
    "camera",
  );

  /* ── Lens ────────────────────────────────────────────────────────── */

  setupMenu(
    "lensMenu",
    "lensBtn",
    "/api/lenses",
    "lenses",
    buildGroupedHTML,
    "lens",
  );

  /* ── Location ────────────────────────────────────────────────────── */

  (function () {
    var menuEl = document.getElementById("countryMenu");

    var btnEl = document.getElementById("countryBtn");

    if (!menuEl || !btnEl) return;

    menuEl.classList.add("oww-dropdown");

    var locationData = [];
    var expandedSet = {};
    var searchVal = "";

    function buildLocationHTML() {
      var filtered = locationData.filter(function (c) {
        if (!searchVal) return true;

        var q = searchVal.toLowerCase();

        if (c.country.toLowerCase().includes(q)) {
          return true;
        }

        return c.states.some(function (s) {
          return s.name.toLowerCase().includes(q);
        });
      });

      if (filtered.length === 0) {
        return (
          '<p class="px-4 py-3 text-[13px] text-ink/40 dark:text-white/40 italic">' +
          "No results" +
          "</p>"
        );
      }

      return filtered
        .map(function (c) {
          var isExpanded = !!expandedSet[c.country] || searchVal.length > 0;

          var activeVal = activeFilters.country;

          var isCountryActive = activeVal === "country::" + c.country;

          var hasStates = c.states.length > 0;

          var radioHtml =
            '<label class="flex items-center justify-center w-4 h-4 shrink-0 cursor-pointer">' +
            '<input type="radio" name="oww-loc" class="sr-only oww-loc-radio" data-kind="country" data-value="' +
            escAttr(c.country) +
            '">' +
            '<span class="w-3.5 h-3.5 rounded-full border border-ink/30 dark:border-white/30 flex items-center justify-center' +
            (isCountryActive
              ? " border-ink dark:border-white bg-ink dark:bg-white"
              : "") +
            '">' +
            (isCountryActive
              ? '<span class="w-1.5 h-1.5 rounded-full bg-paper dark:bg-ink"></span>'
              : "") +
            "</span></label>";

          var arrowHtml = hasStates
            ? '<button type="button" class="oww-loc-expand ml-auto flex items-center justify-center w-6 h-6 rounded text-ink/40 dark:text-white/40 hover:text-ink dark:hover:text-white transition-colors" data-country="' +
              escAttr(c.country) +
              '">' +
              '<svg viewBox="0 0 16 16" class="w-3 h-3 transition-transform' +
              (isExpanded ? " rotate-180" : "") +
              '" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6l4 4 4-4"/></svg>' +
              "</button>"
            : '<span class="w-6 ml-auto"></span>';

          var html =
            '<div class="flex items-center gap-2 px-3 py-2 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] rounded-lg cursor-pointer oww-loc-row" data-kind="country" data-value="' +
            escAttr(c.country) +
            '">' +
            radioHtml +
            '<span class="flex-1 text-[14px] text-ink dark:text-white">' +
            esc(c.country) +
            "</span>" +
            '<span class="text-[12px] text-ink/35 dark:text-white/35 mr-1">' +
            c.totalCount +
            "</span>" +
            arrowHtml +
            "</div>";

          if (isExpanded && hasStates) {
            html += c.states
              .map(function (s) {
                var isStateActive = activeVal === "state::" + s.name;

                var stateRadio =
                  '<label class="flex items-center justify-center w-4 h-4 shrink-0 cursor-pointer">' +
                  '<input type="radio" name="oww-loc" class="sr-only oww-loc-radio" data-kind="state" data-value="' +
                  escAttr(s.name) +
                  '">' +
                  '<span class="w-3 h-3 rounded-full border border-ink/25 dark:border-white/25 flex items-center justify-center' +
                  (isStateActive
                    ? " border-ink dark:border-white bg-ink dark:bg-white"
                    : "") +
                  '">' +
                  (isStateActive
                    ? '<span class="w-1.5 h-1.5 rounded-full bg-paper dark:bg-ink"></span>'
                    : "") +
                  "</span></label>";

                return (
                  '<div class="flex items-center gap-2 pl-9 pr-3 py-1.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] rounded-lg cursor-pointer oww-loc-row" data-kind="state" data-value="' +
                  escAttr(s.name) +
                  '">' +
                  stateRadio +
                  '<span class="flex-1 text-[13px] text-ink/80 dark:text-white/80">' +
                  esc(s.name) +
                  "</span>" +
                  '<span class="text-[12px] text-ink/30 dark:text-white/30">' +
                  s.count +
                  "</span>" +
                  "</div>"
                );
              })
              .join("");
          }

          return html;
        })
        .join("");
    }

    function rerender() {
      var listEl = menuEl.querySelector("#oww-loc-list");

      if (listEl) {
        listEl.innerHTML = buildLocationHTML();
      }
    }

    fetch("/api/countries")
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        locationData = (data.countries || []).map(function (c) {
          var total = c.states.reduce(function (a, s) {
            return a + (s.count || 0);
          }, 0);

          return {
            country: c.country,
            totalCount: total,
            states: c.states,
          };
        });

        menuEl.innerHTML =
          '<div class="flex items-center justify-between px-3 pt-2 pb-1">' +
          '<span class="text-[10px] tracking-[0.12em] uppercase font-semibold text-ink/40 dark:text-white/40">Location</span>' +
          '<button type="button" id="oww-loc-clear" class="text-[12px] text-ink/50 dark:text-white/50 hover:text-ink dark:hover:text-white transition-colors">Clear</button>' +
          "</div>" +
          '<div class="px-3 pb-2">' +
          '<input id="oww-loc-search" type="text" placeholder="Search countries or cities…" autocomplete="off" class="w-full rounded-lg border border-ink/10 dark:border-white/10 bg-ink/[0.03] dark:bg-white/[0.05] px-3 py-1.5 text-[13px] text-ink dark:text-white placeholder:text-ink/30 dark:placeholder:text-white/30 outline-none focus:border-ink/30 dark:focus:border-white/30 transition-colors">' +
          "</div>" +
          '<p class="px-3 pb-1 text-[10px] tracking-[0.1em] uppercase font-semibold text-ink/35 dark:text-white/35">Countries</p>' +
          '<div id="oww-loc-list" class="max-h-[260px] overflow-y-auto px-1 pb-1">' +
          buildLocationHTML() +
          "</div>" +
          '<p class="px-3 py-2 text-[11px] text-ink/35 dark:text-white/35 border-t border-ink/8 dark:border-white/8 mt-1">Select a country for all its photographs, or expand it to choose a city.</p>';

        var searchInput = menuEl.querySelector("#oww-loc-search");

        if (searchInput) {
          searchInput.addEventListener("input", function () {
            searchVal = this.value.trim();

            rerender();
          });

          searchInput.addEventListener("click", function (e) {
            e.stopPropagation();
          });
        }

        var clearBtn = menuEl.querySelector("#oww-loc-clear");

        if (clearBtn) {
          clearBtn.addEventListener("click", function (e) {
            e.stopPropagation();

            activeFilters.country = null;

            updateButtonLabel("country");

            applyFiltersAfterLoading();
            updateURLQuery();

            menuEl.classList.add("hidden");
          });
        }

        menuEl.addEventListener("click", function (e) {
          if (e.target.closest(".oww-loc-radio")) {
            return;
          }

          var expand = e.target.closest(".oww-loc-expand");

          if (expand) {
            e.stopPropagation();

            var c = expand.getAttribute("data-country");

            expandedSet[c] = !expandedSet[c];

            rerender();

            return;
          }

          var row = e.target.closest(".oww-loc-row");

          if (!row) return;

          e.stopPropagation();

          var kind = row.getAttribute("data-kind");

          var val = row.getAttribute("data-value");

          if (kind === "country") {
            expandedSet[val] = !expandedSet[val];

            var newFilter =
              activeFilters.country === "country::" + val
                ? null
                : "country::" + val;

            activeFilters.country = newFilter;
          } else {
            var newFilter =
              activeFilters.country === "state::" + val
                ? null
                : "state::" + val;

            activeFilters.country = newFilter;
          }

          updateButtonLabel("country");

          applyFiltersAfterLoading();
          updateURLQuery();

          rerender();

          if (kind === "state" && activeFilters.country) {
            menuEl.classList.add("hidden");
          }
        });
      })
      .catch(function () {
        menuEl.innerHTML =
          '<p class="px-4 py-2 text-[13px] text-red-400 italic">Failed to load</p>';
      });

    btnEl.addEventListener("click", function (e) {
      e.stopPropagation();

      if (activeFilters.country) {
        activeFilters.country = null;

        updateButtonLabel("country");

        applyFiltersAfterLoading();

        document.querySelectorAll(".oww-dropdown").forEach(function (d) {
          d.classList.add("hidden");
        });

        return;
      }

      var isHidden = menuEl.classList.contains("hidden");

      document.querySelectorAll(".oww-dropdown").forEach(function (d) {
        d.classList.add("hidden");
      });

      menuEl.classList.toggle("hidden", !isHidden);

      if (!menuEl.classList.contains("hidden")) {
        var si = menuEl.querySelector("#oww-loc-search");

        if (si) {
          setTimeout(function () {
            si.focus();
          }, 50);
        }
      }
    });

    menuEl.addEventListener("click", function (e) {
      e.stopPropagation();
    });

    document.addEventListener("click", function () {
      menuEl.classList.add("hidden");
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        document.querySelectorAll(".oww-dropdown").forEach(function (d) {
          d.classList.add("hidden");
        });
      }
    });
  })();

  /* ── Year ────────────────────────────────────────────────────────── */

  setupMenu(
    "yearMenu",
    "yearBtn",
    "/api/years",
    "years",
    function (items) {
      return buildFlatHTML(items, false);
    },
    "year",
  );

  /* ── Reset filters ───────────────────────────────────────────────── */

  var resetFiltersBtn = document.getElementById("resetFiltersBtn");

  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener("click", function () {
      Object.keys(activeFilters).forEach(function (type) {
        activeFilters[type] = null;
        updateButtonLabel(type);
      });

      applyFiltersAfterLoading();
      updateURLQuery();
    });
  }

  /* ── Bottom bar pill highlight ───────────────────────────────────── */

  document.querySelectorAll("[data-filter]").forEach(function (b) {
    b.addEventListener("click", function () {
      // Filter logic is handled above.
    });
  });

  /* ── Detail page — vertical thumbnail slider ──────────────────────── */

  (function () {
    var track = document.getElementById("railTrack");

    var viewport = document.getElementById("railViewport");

    var prevBtn = document.getElementById("railPrev");

    var nextBtn = document.getElementById("railNext");

    var mainPhoto = document.getElementById("mainPhoto");

    if (!track || !viewport) return;

    var thumbs = Array.prototype.slice.call(
      track.querySelectorAll(".rail-thumb"),
    );

    if (thumbs.length === 0) return;

    var currentIdx = 0;
    var STEP = 1;

    var activeIdx = 0;

    if (mainPhoto) {
      for (var mi = 0; mi < thumbs.length; mi++) {
        if (
          thumbs[mi].getAttribute("data-src") === mainPhoto.getAttribute("src")
        ) {
          activeIdx = mi;
          break;
        }
      }
    }

    function thumbUnitHeight() {
      if (thumbs.length < 2) {
        return thumbs[0].offsetHeight + 8;
      }

      var rect0 = thumbs[0].getBoundingClientRect();

      var rect1 = thumbs[1].getBoundingClientRect();

      return rect1.top - rect0.top;
    }

    function visibleCount() {
      var unit = thumbUnitHeight();

      return unit > 0
        ? Math.max(1, Math.floor(viewport.clientHeight / unit))
        : 4;
    }

    function centerThumb(idx, animate) {
      var activeThumb = thumbs[idx];

      if (!activeThumb) return;

      var thumbOffsetTop = activeThumb.offsetTop;

      var thumbHeight = activeThumb.offsetHeight;

      var viewportHeight = viewport.clientHeight;

      var targetY = viewportHeight / 2 - (thumbOffsetTop + thumbHeight / 2);

      track.style.transition =
        animate === false ? "none" : "transform 0.45s cubic-bezier(.2,.7,.2,1)";

      track.style.transform = "translateY(" + targetY + "px)";
    }

    function markActive(th) {
      // Intentionally empty.
    }

    function selectThumb(th) {
      if (!th) return;

      if (mainPhoto) {
        var src = th.getAttribute("data-src");

        var alt = th.getAttribute("data-alt");

        mainPhoto.src = src;
        mainPhoto.alt = alt || "";

        mainPhoto.style.animationDelay = "0s";

        mainPhoto.classList.remove("fade-up");

        void mainPhoto.offsetWidth;

        mainPhoto.classList.add("fade-up");
      }

      var panel = document.getElementById("detailsPanel");

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

        if (elKicker && th.dataset.kicker) {
          elKicker.textContent = th.dataset.kicker;
        }

        if (elTitle && th.dataset.title) {
          elTitle.textContent = th.dataset.title;
        }

        if (elRef && th.dataset.ref) {
          elRef.textContent = th.dataset.ref;
        }

        if (elAbout && th.dataset.about !== undefined) {
          elAbout.textContent = th.dataset.about;
        }

        if (elAltNote && th.dataset.altnote !== undefined) {
          elAltNote.textContent = th.dataset.altnote;
        }

        if (elCollection && th.dataset.collection !== undefined) {
          elCollection.textContent = th.dataset.collection;
        }

        if (elCamera && th.dataset.camera && th.dataset.lens) {
          elCamera.innerHTML =
            th.dataset.camera +
            ' / <span class="text-amber-600 dark:text-amber-400">' +
            th.dataset.lens +
            "</span>";
        }

        if (elDate && th.dataset.date) {
          elDate.textContent = th.dataset.date;
        }

        if (elLocation && th.dataset.location) {
          elLocation.textContent = th.dataset.location;
        }

        if (elCategory && th.dataset.category) {
          elCategory.textContent = th.dataset.category;
        }

        if (elSettings && th.dataset.settings) {
          elSettings.textContent = th.dataset.settings;
        }
      }

      markActive(th);

      var href = th.getAttribute("data-href");

      if (href && window.history.replaceState) {
        window.history.replaceState(null, "", href);
      }
    }

    var offsetsPattern = [44, 28, 16, 8];

    var THUMB_WIDTH = 80;

    var heightPattern = [56, 72, 52, 64, 70, 54, 60];

    function updateDynamicLayout(animate) {
      thumbs.forEach(function (el, i) {
        var dist = Math.abs(i - activeIdx);

        var ml = dist < offsetsPattern.length ? offsetsPattern[dist] : 8;

        var h = heightPattern[i % heightPattern.length];

        el.style.transition =
          animate === false
            ? "none"
            : "margin-left 0.4s ease-out, transform 0.3s ease-out, opacity 0.3s ease-out, width 0.3s ease-out, height 0.3s ease-out";

        el.style.marginLeft = ml + "px";

        el.style.width = THUMB_WIDTH + "px";

        el.style.height = h + "px";
      });
    }

    function setActivePhoto(idx) {
      if (thumbs.length === 0) {
        return;
      }

      activeIdx = Math.max(0, Math.min(thumbs.length - 1, idx));

      var th = thumbs[activeIdx];

      selectThumb(th);

      updateDynamicLayout(true);

      centerThumb(activeIdx, true);
    }

    function stepActivePhoto(delta) {
      if (thumbs.length === 0) {
        return;
      }

      setActivePhoto(activeIdx + delta);
    }

    function init() {
      updateDynamicLayout(false);

      centerThumb(activeIdx, false);

      markActive(thumbs[activeIdx]);
    }

    requestAnimationFrame(function () {
      setTimeout(init, 60);
    });

    var lastWheelTime = 0;

    document.addEventListener(
      "wheel",
      function (e) {
        if (e.target.closest("#detailsPanel")) {
          return;
        }

        var now = Date.now();

        if (now - lastWheelTime < 250) {
          return;
        }

        lastWheelTime = now;

        if (e.deltaY > 0) {
          stepActivePhoto(1);
        } else if (e.deltaY < 0) {
          stepActivePhoto(-1);
        }
      },
      {
        passive: true,
      },
    );

    document.addEventListener("keydown", function (e) {
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        stepActivePhoto(-1);
      }

      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        stepActivePhoto(1);
      }
    });

    thumbs.forEach(function (th, i) {
      th.addEventListener("click", function (e) {
        e.preventDefault();

        setActivePhoto(i);
      });
    });
  })();

  /* ── Detail page — details panel drawer ──────────────────────────── */

  var panel = document.getElementById("detailsPanel");

  var pBtn = document.getElementById("detailToggle");

  var stage = document.getElementById("stage");

  if (panel && pBtn) {
    var plusIcon = document.getElementById("detailPlus");

    var closeIcon = document.getElementById("detailClose");

    var isDesktopLayout = function () {
      return window.matchMedia("(min-width: 768px)").matches;
    };

    pBtn.addEventListener("click", function () {
      var isCurrentlyClosed = panel.classList.contains("translate-x-full");

      if (isCurrentlyClosed) {
        panel.classList.remove("translate-x-full");

        if (plusIcon) {
          plusIcon.classList.add("hidden");
        }

        if (closeIcon) {
          closeIcon.classList.remove("hidden");
        }

        pBtn.classList.remove(
          "bg-white",
          "dark:bg-neutral-900",
          "text-neutral-800",
          "dark:text-white",
          "hover:bg-neutral-100",
          "dark:hover:bg-neutral-800",
        );

        pBtn.classList.add(
          "bg-black",
          "text-white",
          "dark:bg-white",
          "dark:text-black",
          "hover:bg-neutral-900",
          "dark:hover:bg-neutral-100",
        );

        /* if (stage && isDesktopLayout()) {
          stage.style.paddingRight = "380px";
        } */
      } else {
        panel.classList.add("translate-x-full");

        if (plusIcon) {
          plusIcon.classList.remove("hidden");
        }

        if (closeIcon) {
          closeIcon.classList.add("hidden");
        }

        pBtn.classList.remove(
          "bg-black",
          "text-white",
          "dark:bg-white",
          "dark:text-black",
          "hover:bg-neutral-900",
          "dark:hover:bg-neutral-100",
        );

        pBtn.classList.add(
          "bg-white",
          "dark:bg-neutral-900",
          "text-neutral-800",
          "dark:text-white",
          "hover:bg-neutral-100",
          "dark:hover:bg-neutral-800",
        );

        /* if (stage && isDesktopLayout()) {
          stage.style.paddingRight = "120px";
        } */
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !panel.classList.contains("translate-x-full")) {
        pBtn.click();
      }
    });
  }

  /* ── Detail page — EDITED / RAW ──────────────────────────────────── */

  document.querySelectorAll("[data-take]").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll("[data-take]").forEach(function (o) {
        var on = o === b;

        if (on) {
          o.classList.add(
            "bg-black",
            "text-white",
            "dark:bg-white",
            "dark:text-black",
            "font-semibold",
          );

          o.classList.remove(
            "text-neutral-400",
            "dark:text-neutral-500",
            "hover:text-neutral-700",
            "dark:hover:text-neutral-300",
            "font-medium",
          );
        } else {
          o.classList.remove(
            "bg-black",
            "text-white",
            "dark:bg-white",
            "dark:text-black",
            "font-semibold",
          );

          o.classList.add(
            "text-neutral-400",
            "dark:text-neutral-500",
            "hover:text-neutral-700",
            "dark:hover:text-neutral-300",
            "font-medium",
          );
        }
      });
    });
  });

  /* ── Detail page — ambient sound ─────────────────────────────────── */

  var amb = document.getElementById("ambientBtn");

  if (amb) {
    amb.addEventListener("click", function () {
      amb.classList.toggle("text-ink/55");

      amb.classList.toggle("dark:text-white/55");
    });
  }

  /* ── Grid view — normal wheel scrolls sideways ───────────────────── */

  var strip = document.getElementById("gridStrip");

  if (strip) {
    strip.addEventListener(
      "wheel",
      function (e) {
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) {
          return;
        }

        e.preventDefault();

        strip.scrollLeft += e.deltaY;
      },
      {
        passive: false,
      },
    );
  }

  /* ── Grid view — horizontal scroll + pagination ──────────────────── */

  (function () {
    var track = document.getElementById("gridTrack");

    if (!strip || !track) return;

    var copy = track.querySelector(".grid-copy");

    if (!copy) {
      return;
    }

    var LOAD_MARGIN = 1200;

    var pageSize = parseInt(strip.getAttribute("data-page-size"), 10) || 30;

    var offset = parseInt(strip.getAttribute("data-offset"), 10) || 0;

    var hasMore = strip.getAttribute("data-has-more") === "1";

    var loadingPromise = null;

    function buildGridItem(p) {
      var a = document.createElement("a");

      a.href = "/photo/" + encodeURIComponent(p.slug);

      a.className =
        "photo-item group relative shrink-0 h-[43.3vh] max-h-[calc(100vh-460px)]";

      a.setAttribute("data-category", p.category || "");

      a.setAttribute("data-collection", p.collection || "");

      a.setAttribute("data-camera", p.camera || "");

      a.setAttribute("data-lens", p.lens || "");

      a.setAttribute("data-country", p.country || "");

      a.setAttribute("data-state", p.state || "");

      a.setAttribute("data-year", p.year || "");

      a.innerHTML =
        '<img src="' +
        escAttr(p.src) +
        '" alt="' +
        escAttr(p.alt) +
        '" class="h-full w-auto object-cover select-none">' +
        '<span aria-hidden="true" class="pointer-events-none absolute inset-0 grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">' +
        '<span class="w-[68px] h-[68px] rounded-full border border-white/85 grid place-items-center shadow-[0_0_18px_rgba(0,0,0,0.35)]">' +
        '<svg class="w-[26px] h-[26px] text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"></path></svg>' +
        "</span>" +
        "</span>" +
        '<span aria-hidden="true" class="pointer-events-none absolute -top-[12px] -left-[12px] w-[44px] h-[48px] border-t-2 border-l-2 border-[#c8a03c] opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>' +
        '<span aria-hidden="true" class="pointer-events-none absolute -top-[12px] -right-[12px] w-[44px] h-[48px] border-t-2 border-r-2 border-[#c8a03c] opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>' +
        '<span aria-hidden="true" class="pointer-events-none absolute -bottom-[12px] -left-[12px] w-[44px] h-[48px] border-b-2 border-l-2 border-[#c8a03c] opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>' +
        '<span aria-hidden="true" class="pointer-events-none absolute -bottom-[12px] -right-[12px] w-[44px] h-[48px] border-b-2 border-r-2 border-[#c8a03c] opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>' +
        '<span class="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-[0px] whitespace-nowrap text-[15px] text-ink dark:text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300">' +
        esc(p.cap) +
        "</span>";

      return a;
    }

    function loadNextPage() {
      if (!hasMore) {
        return null;
      }
      if (loadingPromise) {
        return loadingPromise;
      }

      loadingPromise = fetch("/api/photos/grid?offset=" + offset + "&limit=" + pageSize)
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          if (data && data.success && data.photos && data.photos.length) {
            data.photos.forEach(function (p) {
              copy.appendChild(buildGridItem(p));
            });

            offset = data.nextOffset;

            applyFilters();
          }

          hasMore = !!(data && data.hasMore);

          loadingPromise = null;
        })
        .catch(function () {
          loadingPromise = null;
        });

      return loadingPromise;
    }

    function loadAllRemaining() {
      if (!hasMore) {
        return Promise.resolve();
      }

      var p = loadNextPage();

      return p ? p.then(loadAllRemaining) : Promise.resolve();
    }

    gridLoadAll = loadAllRemaining;

    strip.addEventListener("scroll", function () {
      var maxScrollLeft = strip.scrollWidth - strip.clientWidth;

      if (hasMore && strip.scrollLeft >= maxScrollLeft - LOAD_MARGIN) {
        loadNextPage();
      }
    });
  })();

  /* ── Flow view — CSS Columns masonry + infinite scroll ───────────── */

  (function () {
    var canvas = document.getElementById("flowCanvas");

    var sentinel = document.getElementById("flowSentinel");

    if (!canvas || !sentinel) {
      return;
    }

    /*
     * IMPORTANT:
     *
     * There are no .flow-column elements anymore.
     *
     * #flowCanvas itself is the CSS-columns masonry container.
     *
     * New photos are appended directly to #flowCanvas and the browser
     * automatically places them into the masonry columns.
     */

    var pageSize = parseInt(canvas.getAttribute("data-page-size"), 10) || 30;

    var offset = parseInt(canvas.getAttribute("data-offset"), 10) || 0;

    var hasMore = canvas.getAttribute("data-has-more") === "1";

    var nextIndex = offset;
    var loadingPromise = null;

    function buildPhotoItem(p) {
      var a = document.createElement("a");

      a.href = "/photo/" + encodeURIComponent(p.slug);

      /*
       * break-inside-avoid:
       *
       * Prevents one photo from being split between two CSS columns.
       *
       * mb-4 / md:mb-6:
       *
       * Provides the vertical masonry gap.
       */
      a.className =
        "photo-item group relative block break-inside-avoid hover:z-10 focus-visible:z-10 mb-4 md:mb-6";

      a.setAttribute("data-index", nextIndex++);

      a.setAttribute("data-category", p.category || "");

      a.setAttribute("data-collection", p.collection || "");

      a.setAttribute("data-camera", p.camera || "");

      a.setAttribute("data-lens", p.lens || "");

      a.setAttribute("data-country", p.country || "");

      a.setAttribute("data-state", p.state || "");

      a.setAttribute("data-year", p.year || "");

      a.innerHTML =
        '<img src="' +
        escAttr(p.src) +
        '" alt="' +
        escAttr(p.alt) +
        '" class="block w-full h-auto select-none">' +
        '<span aria-hidden="true" class="pointer-events-none absolute inset-0 grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">' +
        '<span class="w-[68px] h-[68px] rounded-full border border-white/85 grid place-items-center shadow-[0_0_18px_rgba(0,0,0,0.35)]">' +
        '<svg class="w-[26px] h-[26px] text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"></path></svg>' +
        "</span>" +
        "</span>" +
        '<span aria-hidden="true" class="pointer-events-none absolute top-0 left-0 w-[44px] h-[48px] border-t-2 border-l-2 border-[#c8a03c] opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>' +
        '<span aria-hidden="true" class="pointer-events-none absolute top-0 right-0 w-[44px] h-[48px] border-t-2 border-r-2 border-[#c8a03c] opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>' +
        '<span aria-hidden="true" class="pointer-events-none absolute bottom-0 left-0 w-[44px] h-[48px] border-b-2 border-l-2 border-[#c8a03c] opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>' +
        '<span aria-hidden="true" class="pointer-events-none absolute bottom-0 right-0 w-[44px] h-[48px] border-b-2 border-r-2 border-[#c8a03c] opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>' +
        '<span class="pointer-events-none absolute left-1/2 -translate-x-1/2 top-[calc(100%+-4px)] whitespace-nowrap text-[15px] text-ink dark:text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300">' +
        esc(p.cap) +
        "</span>";

      return a;
    }

    function appendPhotos(newPhotos) {
      /*
       * CSS Columns handles the placement.
       *
       * We do NOT distribute photos between columns manually.
       */
      newPhotos.forEach(function (p) {
        canvas.appendChild(buildPhotoItem(p));
      });

      /*
       * Apply currently active filters after adding new photos.
       */
      applyFilters();
    }

    function loadNextPage() {
      if (loading || !hasMore) {
        return null;
      }

      loading = true;

      return fetch("/api/photos/flow?offset=" + offset + "&limit=" + pageSize)
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          if (data && data.success && data.photos && data.photos.length) {
            appendPhotos(data.photos);

            offset = data.nextOffset;
          }

          hasMore = !!(data && data.hasMore);

          if (!hasMore) {
            observer.unobserve(sentinel);
          }

          loading = false;
        })
        .catch(function () {
          loading = false;
        });
    }

    function loadAllRemaining() {
      if (!hasMore) {
        return Promise.resolve();
      }

      var p = loadNextPage();

      return p ? p.then(loadAllRemaining) : Promise.resolve();
    }

    flowLoadAll = loadAllRemaining;

    var observer = new IntersectionObserver(
      function (entries) {
        if (entries[0].isIntersecting) {
          loadNextPage();
        }
      },
      {
        rootMargin: "800px 0px",
      },
    );

    if (hasMore) {
      observer.observe(sentinel);
    }
  })();

  /* ── Photo detail — Back to previous page ─────────────────────────── */

  (function () {
    var backBtn = document.getElementById("photoBackBtn");

    if (!backBtn) return;

    backBtn.addEventListener("click", function (e) {
      e.preventDefault();

      if (document.referrer && document.referrer.indexOf(window.location.host) !== -1) {
        window.history.back();
      } else {
        window.location.href = "/";
      }
    });
  })();
})();
