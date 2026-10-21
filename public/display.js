// Het klantenscherm (iPad). Leest het menu, past het thema van de handelaar toe
// en ververst automatisch zodra er in het beheer iets verandert.
(function () {
  var A = window.AM, esc = A.esc;
  var app = document.getElementById('app');
  var modal = document.getElementById('modal');
  var saver = document.getElementById('saver');
  var CACHE_KEY = 'automaat-menu';

  var menu = null, menuText = '';
  var view = { name: 'home' };
  var openId = null;
  var lastActivity = Date.now();
  var saverTimer = null;
  var preloaded = {};

  var startVendor = new URLSearchParams(location.search).get('vendor');
  if (startVendor) view = { name: 'vendor', id: startVendor };

  // ---------- gegevens ----------

  function load() {
    return A.backend.loadMenu()
      .then(function (res) {
        try { localStorage.setItem(CACHE_KEY, res.text); } catch (e) { /* privémodus */ }
        apply(res.text);
      })
      .catch(function () {
        if (menu) return; // laatst bekende menu blijft gewoon staan
        var cached = null;
        try { cached = localStorage.getItem(CACHE_KEY); } catch (e) { /* privémodus */ }
        if (cached) apply(cached);
        else app.innerHTML = '<div class="loading">Menu laden…</div>';
      });
  }

  function apply(text) {
    if (text === menuText) return;
    var data;
    try { data = JSON.parse(text); } catch (e) { return; }
    menuText = text;
    menu = data;
    menu.settings = menu.settings || {};
    preloadImages();
    render(true);
  }

  function S() { return menu.settings; }

  function find(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function sectionProducts(sid) {
    var hideOut = S().soldOutMode === 'hide';
    return menu.products.filter(function (p) {
      return p.sectionId === sid && p.visible !== false && !(hideOut && p.soldOut);
    });
  }

  function visibleSections(vid) {
    return menu.sections.filter(function (s) {
      return s.vendorId === vid && s.visible !== false && sectionProducts(s.id).length > 0;
    });
  }

  function vendorProducts(vid) {
    var out = [];
    visibleSections(vid).forEach(function (s) { out = out.concat(sectionProducts(s.id)); });
    return out;
  }

  function visibleVendors() {
    return menu.vendors.filter(function (v) { return v.visible !== false && vendorProducts(v.id).length > 0; });
  }

  function isShown(p) {
    var s = find(menu.sections, p.sectionId);
    if (!s || s.visible === false || p.visible === false) return false;
    if (p.soldOut && S().soldOutMode === 'hide') return false;
    var v = find(menu.vendors, s.vendorId);
    return !!v && v.visible !== false;
  }

  function showPrice(p) {
    return S().showPrices !== false && p.price !== null && p.price !== undefined && p.price !== '';
  }

  function preloadImages() {
    var urls = [];
    menu.vendors.forEach(function (v) { urls.push(v.cover, v.logo); });
    menu.products.forEach(function (p) { if (isShown(p)) urls.push(p.image); });
    urls.forEach(function (u) {
      if (!u || preloaded[u]) return;
      preloaded[u] = true;
      new Image().src = u;
    });
  }

  // ---------- weergave ----------

  function render(keepScroll) {
    if (!menu) return;
    var vendors = visibleVendors();
    if (view.name === 'vendor' && !vendors.some(function (v) { return v.id === view.id; })) view = { name: 'home' };
    if (vendors.length === 1) view = { name: 'vendor', id: vendors[0].id };

    var y = window.pageYOffset;
    if (view.name === 'vendor') renderVendor(find(menu.vendors, view.id), vendors.length > 1);
    else renderHome(vendors);
    window.scrollTo(0, keepScroll ? y : 0);
    updateChips();

    if (openId) {
      var p = find(menu.products, openId);
      if (p && isShown(p)) renderModal(p);
      else closeModal();
    }
  }

  function setTheme(theme) {
    document.documentElement.style.cssText = A.themeVars(theme);
  }

  function renderHome(vendors) {
    var s = S();
    setTheme(s.theme);
    app.innerHTML =
      '<div class="home">' +
        '<header class="home-head">' +
          (s.logo ? '<img class="home-logo" src="' + esc(s.logo) + '" alt="">' : '') +
          (s.machineName ? '<div class="home-machine">' + esc(s.machineName) + '</div>' : '') +
          '<h1>' + esc(s.welcomeTitle || 'Wat zit er in de automaat?') + '</h1>' +
          (s.welcomeText ? '<p>' + esc(s.welcomeText) + '</p>' : '') +
        '</header>' +
        (vendors.length
          ? '<div class="vendor-grid n' + Math.min(vendors.length, 4) + '">' + vendors.map(vendorTile).join('') + '</div>'
          : '<p class="empty">Er staan nog geen producten klaar.</p>') +
      '</div>';
  }

  function vendorTile(v) {
    var count = vendorProducts(v.id).length;
    var icons = visibleSections(v.id).map(function (s) { return s.icon; }).filter(Boolean).slice(0, 3);
    var media = v.cover
      ? '<img src="' + esc(v.cover) + '" alt="">'
      : v.logo
        ? '<img class="contain" src="' + esc(v.logo) + '" alt="">'
        : icons.length
          ? '<span class="tile-icons">' + icons.map(esc).join(' ') + '</span>'
          : '<span class="tile-initial">' + esc(v.name.charAt(0)) + '</span>';
    return '<button class="vendor-tile" data-vendor="' + esc(v.id) + '" style="' + esc(A.themeVars(v.theme)) + '">' +
      '<div class="tile-media">' + media + '</div>' +
      '<div class="tile-body">' +
        (v.logo && v.cover ? '<img class="tile-logo" src="' + esc(v.logo) + '" alt="">' : '') +
        '<div class="tile-name">' + esc(v.name) + '</div>' +
        (v.tagline ? '<div class="tile-tag">' + esc(v.tagline) + '</div>' : '') +
        '<div class="tile-count">' + count + (count === 1 ? ' product' : ' producten') + ' bekijken ›</div>' +
      '</div>' +
    '</button>';
  }

  function sectionStyle(s, theme) {
    if (!s || !s.accent) return '';
    return '--accent:' + s.accent + ';--accent-soft:' + A.mix(s.accent, A.fullTheme(theme).surface, 0.84);
  }

  function renderVendor(v, canGoBack) {
    setTheme(v.theme);
    var sections = visibleSections(v.id);
    app.innerHTML =
      '<div class="vendor">' +
        '<header class="vbar">' +
          '<div class="vbar-top">' +
            (canGoBack ? '<button class="back" data-home>‹ <span>Alle handelaars</span></button>' : '') +
            (v.logo ? '<img class="vlogo" src="' + esc(v.logo) + '" alt="">' : '') +
            '<div class="vtitle"><h1>' + esc(v.name) + '</h1>' + (v.tagline ? '<p>' + esc(v.tagline) + '</p>' : '') + '</div>' +
          '</div>' +
          (sections.length > 1
            ? '<nav class="chips">' + sections.map(function (s, i) {
                return '<button class="chip' + (i === 0 ? ' active' : '') + '" data-jump="' + esc(s.id) + '">' +
                  (s.icon ? '<span class="chip-icon">' + esc(s.icon) + '</span>' : '') + esc(s.name) + '</button>';
              }).join('') + '</nav>'
            : '') +
        '</header>' +
        sections.map(function (s) { return sectionBlock(s, v); }).join('') +
        (S().machineName ? '<footer class="vfoot">' + esc(S().machineName) + '</footer>' : '') +
      '</div>';
  }

  function sectionBlock(s, v) {
    return '<section class="sec" id="sec-' + esc(s.id) + '" data-sec="' + esc(s.id) + '" style="' + esc(sectionStyle(s, v.theme)) + '">' +
      '<div class="sec-head">' +
        (s.image ? '<img class="sec-img" src="' + esc(s.image) + '" alt="">' : '') +
        '<div><h2>' + esc(s.name) + '</h2>' + (s.description ? '<p>' + esc(s.description) + '</p>' : '') + '</div>' +
      '</div>' +
      '<div class="grid">' + sectionProducts(s.id).map(function (p) { return card(p, s); }).join('') + '</div>' +
    '</section>';
  }

  function media(p, s, cls) {
    if (p.image) return '<img class="' + cls + '" src="' + esc(p.image) + '" alt="" decoding="async">';
    return '<div class="ph ' + cls + '"><span>' + esc((s && s.icon) || p.name.charAt(0)) + '</span></div>';
  }

  function labels(p) {
    if (!p.labels || !p.labels.length) return '';
    return '<div class="labels">' + p.labels.map(function (l) { return '<span class="label">' + esc(l) + '</span>'; }).join('') + '</div>';
  }

  function card(p, s) {
    return '<button class="card' + (p.soldOut ? ' is-out' : '') + '" data-product="' + esc(p.id) + '">' +
      '<div class="card-media">' +
        media(p, s, 'card-img') +
        (p.slot ? '<span class="slot">' + esc(p.slot) + '</span>' : '') +
        (p.soldOut ? '<span class="out">Uitverkocht</span>' : '') +
        labels(p) +
        (p.video ? '<span class="has-video">▶</span>' : '') +
      '</div>' +
      '<div class="card-body">' +
        '<div class="card-name">' + esc(p.name) + '</div>' +
        '<div class="card-meta"><span>' + esc(p.portion || '') + '</span>' +
          (showPrice(p) ? '<span class="price">' + esc(A.formatPrice(p.price, S().currency)) + '</span>' : '') +
        '</div>' +
      '</div>' +
    '</button>';
  }

  // ---------- productdetail ----------

  function openProduct(id) {
    var p = find(menu.products, id);
    if (!p) return;
    openId = id;
    renderModal(p);
    modal.hidden = false;
    requestAnimationFrame(function () { modal.classList.add('show'); });
  }

  function keypad(p) {
    if (p.soldOut) {
      return '<div class="keypad is-out"><strong>Tijdelijk uitverkocht</strong><span>Dit product wordt binnenkort weer aangevuld.</span></div>';
    }
    if (!p.slot) return '';
    return '<div class="keypad">' +
      '<div class="keys">' + String(p.slot).split('').map(function (c) {
        return '<span class="key">' + esc(c) + '</span>';
      }).join('') + '</div>' +
      '<div class="keypad-text">' + esc(S().keypadText || 'Toets dit nummer in op het toetsenbord') + '</div>' +
    '</div>';
  }

  function renderModal(p) {
    var s = find(menu.sections, p.sectionId);
    var v = s && find(menu.vendors, s.vendorId);
    var mediaHtml = p.video
      ? '<video class="m-media" src="' + esc(p.video) + '"' + (p.image ? ' poster="' + esc(p.image) + '"' : '') + ' autoplay muted loop playsinline></video>'
      : media(p, s, 'm-media');
    var allergens = (p.allergens || []).map(A.allergen).filter(Boolean);

    modal.setAttribute('style', sectionStyle(s, v && v.theme));
    modal.innerHTML =
      '<div class="m-backdrop" data-close></div>' +
      '<div class="m-panel" role="dialog" aria-modal="true">' +
        '<button class="m-close" data-close aria-label="Sluiten">✕</button>' +
        '<div class="m-media-wrap' + (p.soldOut ? ' is-out' : '') + '">' + mediaHtml + labels(p) + '</div>' +
        '<div class="m-info">' +
          (v ? '<div class="m-vendor">' + esc(v.name) + (s ? ' · ' + esc(s.name) : '') + '</div>' : '') +
          '<h2>' + esc(p.name) + '</h2>' +
          '<div class="m-pricerow">' +
            (showPrice(p) ? '<span class="m-price">' + esc(A.formatPrice(p.price, S().currency)) + '</span>' : '') +
            (p.portion ? '<span class="m-portion">' + esc(p.portion) + '</span>' : '') +
          '</div>' +
          (p.description ? '<p class="m-desc">' + esc(p.description) + '</p>' : '') +
          keypad(p) +
          '<div class="m-block"><h3>Allergenen</h3>' +
            (allergens.length
              ? '<div class="allergens">' + allergens.map(function (a) {
                  return '<span class="allergen"><i>' + a.icon + '</i>' + esc(a.label) + '</span>';
                }).join('') + '</div>'
              : '<p class="m-muted">Geen allergeneninformatie ingevuld. Twijfelt u? Neem contact op met de handelaar.</p>') +
            (p.traces ? '<p class="m-traces">Kan sporen bevatten van: ' + esc(p.traces) + '</p>' : '') +
          '</div>' +
          (p.ingredients ? '<div class="m-block"><h3>Ingrediënten</h3><p class="m-ingr">' + esc(p.ingredients) + '</p></div>' : '') +
        '</div>' +
      '</div>';
  }

  function closeModal() {
    openId = null;
    modal.classList.remove('show');
    var video = modal.querySelector('video');
    if (video) video.pause();
    setTimeout(function () {
      if (openId) return;
      modal.hidden = true;
      modal.innerHTML = '';
    }, 220);
  }

  // ---------- navigatie ----------

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-vendor],[data-product],[data-home],[data-jump],[data-close]');
    if (!t) return;
    if (t.hasAttribute('data-close')) return closeModal();
    if (t.hasAttribute('data-vendor')) { view = { name: 'vendor', id: t.getAttribute('data-vendor') }; render(); }
    else if (t.hasAttribute('data-product')) openProduct(t.getAttribute('data-product'));
    else if (t.hasAttribute('data-home')) { view = { name: 'home' }; render(); }
    else if (t.hasAttribute('data-jump')) jump(t.getAttribute('data-jump'));
  });

  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  function headerHeight() {
    var head = document.querySelector('.vbar');
    return head ? head.offsetHeight : 0;
  }

  function jump(id) {
    var el = document.getElementById('sec-' + id);
    if (!el) return;
    var y = el.getBoundingClientRect().top + window.pageYOffset - headerHeight() + 1;
    window.scrollTo({ top: y, behavior: 'smooth' });
  }

  var activeChip = null, ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; updateChips(); });
  }, { passive: true });

  function updateChips() {
    var nav = document.querySelector('.chips');
    if (!nav) return;
    var secs = document.querySelectorAll('.sec');
    var limit = headerHeight() + 40;
    var active = secs[0].getAttribute('data-sec');
    for (var i = 0; i < secs.length; i++) {
      if (secs[i].getBoundingClientRect().top <= limit) active = secs[i].getAttribute('data-sec');
    }
    if (window.innerHeight + window.pageYOffset >= document.documentElement.scrollHeight - 4) {
      active = secs[secs.length - 1].getAttribute('data-sec');
    }
    var chips = nav.querySelectorAll('.chip');
    for (var j = 0; j < chips.length; j++) {
      var on = chips[j].getAttribute('data-jump') === active;
      chips[j].classList.toggle('active', on);
      if (on && active !== activeChip) nav.scrollLeft = chips[j].offsetLeft - nav.clientWidth / 2 + chips[j].offsetWidth / 2;
    }
    activeChip = active;
  }

  // ---------- inactiviteit en diavoorstelling ----------

  ['pointerdown', 'touchstart', 'keydown', 'wheel'].forEach(function (ev) {
    document.addEventListener(ev, activity, { passive: true, capture: true });
  });
  window.addEventListener('scroll', activity, { passive: true });

  function activity() {
    lastActivity = Date.now();
    requestWakeLock();
  }

  function atStart() {
    var single = visibleVendors().length === 1;
    return !openId && window.pageYOffset < 5 && (view.name === 'home' || single);
  }

  function goStart() {
    if (openId) closeModal();
    if (visibleVendors().length !== 1) view = { name: 'home' };
    render();
  }

  setInterval(function () {
    if (!menu) return;
    var idle = (Date.now() - lastActivity) / 1000;
    var saverAfter = Number(S().screensaverAfter) || 0;
    var resetAfter = Number(S().resetAfter) || 0;
    if (saverAfter > 0 && idle >= saverAfter) {
      if (saver.hidden) startSaver();
    } else if (resetAfter > 0 && idle >= resetAfter && !atStart()) {
      goStart();
    }
  }, 1000);

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function startSaver() {
    goStart();
    var slides = shuffle(menu.products.filter(function (p) { return isShown(p) && !p.soldOut && p.image; }));
    saver.hidden = false;
    if (!slides.length) {
      saver.setAttribute('style', A.themeVars(S().theme));
      saver.innerHTML = '<div class="saver-empty"><h1>' + esc(S().welcomeTitle || 'Wat zit er in de automaat?') + '</h1></div>' +
        '<div class="saver-tap">👆 Tik op het scherm</div>';
      return;
    }
    saver.removeAttribute('style');
    saver.innerHTML = '<div class="saver-stage"></div><div class="saver-tap">👆 Tik om alles te bekijken</div>';
    var i = 0;
    showSlide(slides[0]);
    saverTimer = setInterval(function () {
      i = (i + 1) % slides.length;
      showSlide(slides[i]);
    }, 6000);
  }

  function showSlide(p) {
    var stage = saver.querySelector('.saver-stage');
    if (!stage) return;
    var s = find(menu.sections, p.sectionId);
    var v = s && find(menu.vendors, s.vendorId);
    var el = document.createElement('div');
    el.className = 'slide';
    el.setAttribute('style', A.themeVars(v && v.theme) + ';' + sectionStyle(s, v && v.theme));
    el.innerHTML =
      '<div class="slide-imgwrap"><img class="slide-img" src="' + esc(p.image) + '" alt=""></div>' +
      '<div class="slide-info">' +
        (v ? '<div class="slide-vendor">' + esc(v.name) + '</div>' : '') +
        '<div class="slide-name">' + esc(p.name) + '</div>' +
        (p.description ? '<div class="slide-desc">' + esc(p.description) + '</div>' : '') +
        '<div class="slide-meta">' +
          (p.slot ? '<span class="slide-slot">Vak ' + esc(p.slot) + '</span>' : '') +
          (showPrice(p) ? '<span class="slide-price">' + esc(A.formatPrice(p.price, S().currency)) + '</span>' : '') +
        '</div>' +
      '</div>';
    stage.appendChild(el);
    requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add('show'); }); });
    var old = stage.querySelectorAll('.slide');
    for (var k = 0; k < old.length - 1; k++) {
      (function (o) { setTimeout(function () { if (o.parentNode) o.parentNode.removeChild(o); }, 1300); })(old[k]);
    }
  }

  saver.addEventListener('click', function (e) {
    e.stopPropagation();
    clearInterval(saverTimer);
    saver.hidden = true;
    saver.innerHTML = '';
    lastActivity = Date.now();
  });

  // ---------- scherm aan houden ----------

  var wakeLock = null, wakePending = false;
  function requestWakeLock() {
    if (wakeLock || wakePending || !navigator.wakeLock) return;
    wakePending = true;
    navigator.wakeLock.request('screen').then(function (lock) {
      wakeLock = lock;
      lock.addEventListener('release', function () { wakeLock = null; });
    }).catch(function () { /* niet ondersteund of geweigerd */ }).then(function () { wakePending = false; });
  }

  // ---------- live bijwerken ----------

  load();
  A.backend.watch(load);

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('/sw.js').catch(function () { /* geen offline-cache */ });
  }
})();
