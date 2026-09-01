/* public/js/app.js — dark mode, camera menu, bottom bar, horizontal strip scroll */
(function () {
  var root = document.documentElement;
  var KEY = 'oww:theme';

  if (localStorage.getItem(KEY) === 'dark') root.classList.add('dark');

  var t = document.getElementById('themeToggle');
  if (t) t.addEventListener('click', function () {
    root.classList.toggle('dark');
    localStorage.setItem(KEY, root.classList.contains('dark') ? 'dark' : 'light');
  });

  /* bottom bar — single active pill */
  document.querySelectorAll('[data-filter]').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('[data-filter]').forEach(function (o) {
        var on = o === b;
        o.classList.toggle('bg-black/[0.06]', on);
        o.classList.toggle('dark:bg-white/[0.12]', on);
        o.classList.toggle('font-medium', on);
        o.classList.toggle('text-ink/75', !on);
        o.classList.toggle('dark:text-white/75', !on);
      });
    });
  });

  /* camera menu */
  var menu = document.getElementById('cameraMenu');
  var camBtn = document.getElementById('cameraBtn');
  if (menu && camBtn) {
    camBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      menu.classList.toggle('hidden');
    });
    menu.addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', function () { menu.classList.add('hidden'); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') menu.classList.add('hidden');
    });
  }

  /* detail page — rail selects the main image, no page reload */
  var rail = document.getElementById('thumbRail');
  var main = document.getElementById('mainPhoto');
  if (rail && main) {
    var items = Array.prototype.slice.call(rail.querySelectorAll('a'));

    function mark(active) {
      items.forEach(function (a) {
        var sp = a.querySelector('span');
        if (sp) sp.style.transform = a === active ? 'translateX(1.4vw)' : '';
      });
    }

    function centerThumb(a, smooth) {
      var top = a.offsetTop - (rail.clientHeight - a.offsetHeight) / 2;
      top = Math.max(0, Math.min(top, rail.scrollHeight - rail.clientHeight));
      if (rail.scrollTo) rail.scrollTo({ top: top, behavior: smooth ? 'smooth' : 'auto' });
      else rail.scrollTop = top;
    }

    function select(a) {
      var img = a.querySelector('img');
      if (!img) return;
      main.src = img.getAttribute('src');
      main.alt = img.getAttribute('alt') || '';
      main.style.animationDelay = '0s';
      main.classList.remove('fade-up');
      void main.offsetWidth;            /* restart the fade */
      main.classList.add('fade-up');
      mark(a);
      centerThumb(a, true);
      var href = a.getAttribute('href');
      if (href && window.history.replaceState) window.history.replaceState(null, '', href);
    }

    items.forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); select(a); });
    });

    /* whichever thumb matches the photo already on screen starts out selected */
    items.forEach(function (a) {
      var img = a.querySelector('img');
      if (img && img.src === main.src) { mark(a); centerThumb(a, false); }
    });
  }

  /* detail page — details panel */
  var panel = document.getElementById('detailsPanel');
  var pBtn  = document.getElementById('detailToggle');
  var stage = document.getElementById('stage');
  if (panel && pBtn) {
    var plusIcon  = document.getElementById('detailPlus');
    var closeIcon = document.getElementById('detailClose');
    pBtn.addEventListener('click', function () {
      var open = panel.classList.toggle('translate-x-full');
      open = !open;                                  /* class present = closed */
      if (plusIcon)  plusIcon.classList.toggle('hidden', open);
      if (closeIcon) closeIcon.classList.toggle('hidden', !open);
      pBtn.classList.toggle('bg-ink', open);
      pBtn.classList.toggle('text-white', open);
      pBtn.classList.toggle('bg-paper', !open);
      if (stage) {
        if (!open) { stage.style.transform = ''; return; }
        /* the design nudges the stage left by 5.4vw; on narrow windows nudge
           further so the panel never covers the photo */
        var img = document.getElementById('mainPhoto');
        var shift = window.innerWidth * 0.054;
        if (img) {
          var panelLeft = window.innerWidth - panel.offsetWidth;
          shift = Math.max(shift, img.getBoundingClientRect().right - panelLeft + 24);
        }
        stage.style.transform = 'translateX(-' + Math.round(shift) + 'px)';
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.classList.contains('translate-x-full')) pBtn.click();
    });
  }

  /* detail page — EDITED / RAW */
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

  /* detail page — ambient sound */
  var amb = document.getElementById('ambientBtn');
  if (amb) amb.addEventListener('click', function () {
    amb.classList.toggle('text-ink/55');
    amb.classList.toggle('dark:text-white/55');
  });

  /* grid view — let a normal wheel scroll the strip sideways */
  var strip = document.getElementById('gridStrip');
  if (strip) strip.addEventListener('wheel', function (e) {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    e.preventDefault();
    strip.scrollLeft += e.deltaY;
  }, { passive: false });
})();
