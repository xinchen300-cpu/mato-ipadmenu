// Beheer: handelaars, secties en producten bewerken. Alles wordt als één menu-bestand opgeslagen.
(function () {
  var A = window.AM, esc = A.esc;
  var main = document.getElementById('main');
  var drawer = document.getElementById('drawer');
  var saveStateEl = document.getElementById('saveState');

  var menu = null;
  var saveTimer = null, saving = false, dirty = false;
  var uploadsBusy = 0;
  var slotQuery = '';

  var DEFAULT_SETTINGS = {
    machineName: '', logo: '', welcomeTitle: 'Wat zit er in de automaat?',
    welcomeText: "Tik op een product voor foto's, allergenen en het vaknummer.",
    keypadText: 'Toets dit nummer in op het toetsenbord van de automaat',
    showPrices: true, soldOutMode: 'show', resetAfter: 60, screensaverAfter: 120, currency: 'EUR',
  };

  // ---------- formulieren per soort ----------

  var SCHEMAS = {
    vendors: [
      { key: 'name', label: 'Naam handelaar', type: 'text', required: true },
      { key: 'tagline', label: 'Ondertitel', type: 'text', placeholder: 'bv. Huisgemaakte taarten & gebak' },
      { key: 'logo', label: 'Logo', type: 'image', alpha: true, hint: 'PNG met transparante achtergrond werkt het mooist' },
      { key: 'cover', label: 'Omslagfoto', type: 'image', hint: 'Grote foto op het startscherm' },
      { key: 'theme', label: 'Thema', type: 'theme' },
      { key: 'visible', label: 'Zichtbaar op het scherm', type: 'toggle', def: true },
    ],
    sections: [
      { key: 'name', label: 'Naam sectie', type: 'text', required: true, placeholder: 'bv. Taarten' },
      { key: 'icon', label: 'Icoon', type: 'text', short: true, placeholder: '🍰', hint: 'Emoji voor producten zonder foto' },
      { key: 'accent', label: 'Eigen accentkleur', type: 'coloropt', short: true, hint: 'Uit = kleur van de handelaar' },
      { key: 'description', label: 'Beschrijving', type: 'textarea', rows: 2 },
      { key: 'image', label: 'Foto', type: 'image', hint: 'Klein rond fotootje naast de sectietitel' },
      { key: 'visible', label: 'Zichtbaar op het scherm', type: 'toggle', def: true },
    ],
    products: [
      { key: 'name', label: 'Productnaam', type: 'text', required: true },
      { key: 'slot', label: 'Vaknummer', type: 'text', short: true, placeholder: 'bv. 12', hint: 'Wat de klant intoetst' },
      { key: 'price', label: 'Prijs (€)', type: 'price', short: true, placeholder: '0,00' },
      { key: 'portion', label: 'Inhoud / portie', type: 'text', short: true, placeholder: 'bv. 6 personen' },
      { key: 'sectionId', label: 'Sectie', type: 'section', short: true },
      { key: 'image', label: 'Foto', type: 'image' },
      { key: 'video', label: 'Video (optioneel)', type: 'video', hint: 'Speelt zonder geluid af in de productweergave. MP4 of MOV, liefst kort.' },
      { key: 'description', label: 'Beschrijving', type: 'textarea', rows: 3 },
      { key: 'labels', label: 'Labels', type: 'tags', placeholder: 'bv. Nieuw, Glutenarm, Vegan', hint: 'Gescheiden door komma’s; verschijnen als badges op de foto' },
      { key: 'allergens', label: 'Allergenen (bevat)', type: 'allergens' },
      { key: 'traces', label: 'Kan sporen bevatten van', type: 'text', placeholder: 'bv. noten, sesam' },
      { key: 'ingredients', label: 'Ingrediënten', type: 'textarea', rows: 3 },
      { key: 'soldOut', label: 'Uitverkocht', type: 'toggle', hint: 'Blijft zichtbaar, maar grijs met “Uitverkocht”' },
      { key: 'visible', label: 'Zichtbaar op het scherm', type: 'toggle', def: true },
    ],
  };

  var SETTINGS_FIELDS = [
    { type: 'heading', label: 'Startscherm' },
    { key: 'machineName', label: 'Naam van de automaat', type: 'text' },
    { key: 'welcomeTitle', label: 'Welkomsttitel', type: 'text' },
    { key: 'welcomeText', label: 'Welkomsttekst', type: 'textarea', rows: 2 },
    { key: 'logo', label: 'Logo', type: 'image', alpha: true },
    { key: 'theme', label: 'Thema startscherm', type: 'theme' },
    { type: 'heading', label: 'Gedrag van het scherm' },
    { key: 'keypadText', label: 'Tekst bij het vaknummer', type: 'text' },
    { key: 'soldOutMode', label: 'Uitverkochte producten', type: 'select', short: true, options: [['show', 'Grijs tonen'], ['hide', 'Verbergen']] },
    { key: 'resetAfter', label: 'Terug naar start na (sec.)', type: 'number', short: true, hint: '0 = nooit' },
    { key: 'screensaverAfter', label: 'Diavoorstelling na (sec.)', type: 'number', short: true, hint: 'Productfoto’s die de aandacht trekken. 0 = uit' },
    { key: 'showPrices', label: 'Prijzen tonen', type: 'toggle', def: true },
  ];

  // ---------- inloggen, laden en opslaan ----------

  var B = A.backend;

  (B.needsLogin ? B.isLoggedIn().catch(function () { return false; }) : Promise.resolve(true))
    .then(function (ok) { if (ok) loadMenu(); else showLogin(''); });

  function loadMenu() {
    document.body.classList.remove('logged-out');
    main.innerHTML = '<div class="panel muted">Menu laden…</div>';
    B.loadMenu()
      .then(function (res) {
        menu = normalize(JSON.parse(res.text));
        setSaveState('Alles opgeslagen ✓', 'ok');
        render();
      })
      .catch(function () { main.innerHTML = '<div class="panel error">Kon het menu niet laden. Controleer de verbinding en herlaad de pagina.</div>'; });
  }

  function showLogin(message) {
    closeDrawer(true);
    document.body.classList.add('logged-out');
    main.innerHTML =
      '<form class="panel login" id="loginForm">' +
        '<div class="brand-icon big">🍰</div>' +
        '<h1>Automaat Menu</h1>' +
        '<p class="muted">Log in om het menu te bewerken.</p>' +
        (message ? '<p class="login-msg">' + esc(message) + '</p>' : '') +
        '<label class="lbl" for="loginPw">Wachtwoord</label>' +
        '<input class="input" id="loginPw" type="password" autocomplete="current-password" required>' +
        '<button class="btn primary" type="submit">Inloggen</button>' +
      '</form>';
    var form = document.getElementById('loginForm');
    var input = document.getElementById('loginPw');
    input.focus();
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var button = form.querySelector('button');
      button.disabled = true;
      B.login(input.value).then(function () {
        // Na een verlopen sessie de nog niet opgeslagen wijzigingen alsnog bewaren.
        if (menu) { document.body.classList.remove('logged-out'); render(); flush(); }
        else loadMenu();
      }).catch(function (err) {
        button.disabled = false;
        input.select();
        toast(err.auth ? 'Onjuist wachtwoord' : 'Inloggen mislukt – controleer de verbinding');
      });
    });
  }

  window.addEventListener('hashchange', function () { closeDrawer(true); render(); });

  function normalize(d) {
    d.settings = Object.assign({}, DEFAULT_SETTINGS, d.settings || {});
    d.settings.theme = A.fullTheme(d.settings.theme);
    d.vendors = d.vendors || [];
    d.sections = d.sections || [];
    d.products = d.products || [];
    d.vendors.forEach(function (v) { v.theme = A.fullTheme(v.theme); });
    d.products.forEach(function (p) { p.allergens = p.allergens || []; p.labels = p.labels || []; });
    return d;
  }

  function setSaveState(text, kind) {
    saveStateEl.textContent = text;
    saveStateEl.className = 'save-state ' + (kind || '');
  }

  function save() {
    dirty = true;
    setSaveState('Opslaan…', 'busy');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 350);
  }

  function flush() {
    if (saving) { saveTimer = setTimeout(flush, 250); return; }
    saving = true;
    dirty = false;
    B.saveMenu(menu)
      .then(function () { saving = false; if (!dirty) setSaveState('Alles opgeslagen ✓', 'ok'); })
      .catch(function (err) {
        saving = false;
        dirty = true;
        if (err.auth) {
          setSaveState('Niet opgeslagen – log opnieuw in', 'err');
          return showLogin('Je bent uitgelogd. Log opnieuw in; je wijzigingen worden daarna opgeslagen.');
        }
        if (err.conflict) {
          setSaveState('Niet opgeslagen – menu elders gewijzigd', 'err');
          if (confirm('Het menu is intussen op een ander apparaat gewijzigd.\nPagina herladen om de nieuwste versie te zien? (je laatste wijziging gaat dan verloren)')) {
            dirty = false;
            location.reload();
          }
          return;
        }
        setSaveState('Opslaan mislukt – klik om opnieuw te proberen', 'err');
        toast('Opslaan mislukt. Controleer de verbinding.');
      });
  }

  saveStateEl.addEventListener('click', function () { if (dirty && !saving) flush(); });
  window.addEventListener('beforeunload', function (e) {
    if (dirty || saving || uploadsBusy) { e.preventDefault(); e.returnValue = ''; }
  });

  // ---------- opzoeken ----------

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function sectionsOf(vid) { return menu.sections.filter(function (s) { return s.vendorId === vid; }); }
  function productsOf(sid) { return menu.products.filter(function (p) { return p.sectionId === sid; }); }
  function productsOfVendor(vid) {
    var ids = sectionsOf(vid).map(function (s) { return s.id; });
    return menu.products.filter(function (p) { return ids.indexOf(p.sectionId) >= 0; });
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  // ---------- pagina's ----------

  function route() {
    var parts = location.hash.replace(/^#\/?/, '').split('/');
    return { page: parts[0] || 'vendors', id: parts[1] ? decodeURIComponent(parts[1]) : null };
  }

  function render() {
    if (!menu || document.body.classList.contains('logged-out')) return;
    var r = route();
    var nav = r.page === 'v' || r.page === 's' ? 'vendors' : r.page;
    document.querySelectorAll('[data-nav]').forEach(function (a) { a.classList.toggle('active', a.getAttribute('data-nav') === nav); });
    if (r.page === 'v') renderVendor(r.id);
    else if (r.page === 's') renderSection(r.id);
    else if (r.page === 'slots') renderSlots();
    else if (r.page === 'settings') renderSettings();
    else renderVendors();
  }

  function pageHead(title, sub, actions) {
    return '<div class="page-head"><div><h1>' + esc(title) + '</h1>' + (sub ? '<div class="crumbs">' + sub + '</div>' : '') + '</div>' +
      '<div class="actions">' + (actions || '') + '</div></div>';
  }

  function cardHTML(kind, item, o) {
    return '<div class="card' + (item.visible === false ? ' is-hidden' : '') + '" draggable="true" data-kind="' + kind + '" data-id="' + esc(item.id) + '">' +
      '<div class="card-media" data-open style="' + esc(o.style || '') + '">' +
        (o.img ? '<img src="' + esc(o.img) + '" alt="" draggable="false">' : '<div class="ph">' + esc(o.ph || '') + '</div>') +
        '<span class="handle" title="Slepen om de volgorde te wijzigen">⠿</span>' +
        '<button type="button" class="dots" data-menu title="Meer acties">⋮</button>' +
        (o.badge || '') +
      '</div>' +
      '<div class="card-body">' +
        '<div class="card-text" data-open><div class="card-title">' + esc(item.name || '(naamloos)') + '</div>' +
          '<div class="card-sub">' + (o.sub || '') + '</div>' + (o.meta ? '<div class="card-meta">' + o.meta + '</div>' : '') + '</div>' +
        '<label class="switch" title="Zichtbaar op het scherm"><input type="checkbox" data-toggle' + (item.visible === false ? '' : ' checked') + '><span></span></label>' +
      '</div>' +
    '</div>';
  }

  function addCard(kind, label) {
    return '<button type="button" class="card add-card" data-add="' + kind + '"><span class="plus">+</span><span>' + esc(label) + '</span></button>';
  }

  function swatches(t) {
    t = A.fullTheme(t);
    return '<span class="swatches">' + [t.bg, t.surface, t.accent, t.text].map(function (c) {
      return '<i style="background:' + esc(c) + '"></i>';
    }).join('') + '</span><span class="muted">' + esc(t.headingFont) + '</span>';
  }

  function renderVendors() {
    main.innerHTML = pageHead('Handelaars', 'Elke handelaar heeft een eigen kleur en lettertype op het scherm',
        '<a class="btn" href="/" target="_blank" rel="noopener">📺 Bekijk scherm</a>') +
      '<div class="grid">' + menu.vendors.map(function (v) {
        return cardHTML('vendors', v, {
          img: v.cover || v.logo, ph: (v.name || '?').charAt(0), style: A.themeVars(v.theme),
          sub: plural(sectionsOf(v.id).length, 'sectie', 'secties') + ' · ' + plural(productsOfVendor(v.id).length, 'product', 'producten'),
          meta: swatches(v.theme),
        });
      }).join('') + addCard('vendors', 'Handelaar toevoegen') + '</div>';
  }

  function renderVendor(id) {
    var v = byId(menu.vendors, id);
    if (!v) { location.hash = '#/'; return; }
    main.innerHTML = pageHead(v.name, '<a href="#/">Handelaars</a> › <span>' + esc(v.name) + '</span>',
        '<button type="button" class="btn" data-edit="vendors" data-edit-id="' + esc(v.id) + '">🎨 Thema &amp; gegevens</button>' +
        '<a class="btn" href="/?vendor=' + encodeURIComponent(v.id) + '" target="_blank" rel="noopener">📺 Bekijk</a>') +
      '<div class="grid">' + sectionsOf(v.id).map(function (s) {
        var ps = productsOf(s.id);
        var img = s.image || (ps.filter(function (p) { return p.image; })[0] || {}).image;
        return cardHTML('sections', s, {
          img: img, ph: s.icon || (s.name || '?').charAt(0),
          style: A.themeVars(v.theme) + (s.accent ? ';--accent:' + s.accent : ''),
          sub: 'Sectie · ' + plural(ps.length, 'product', 'producten'),
        });
      }).join('') + addCard('sections', 'Sectie toevoegen') + '</div>';
  }

  function renderSection(id) {
    var s = byId(menu.sections, id);
    var v = s && byId(menu.vendors, s.vendorId);
    if (!s || !v) { location.hash = '#/'; return; }
    var style = A.themeVars(v.theme) + (s.accent ? ';--accent:' + s.accent : '');
    main.innerHTML = pageHead(s.name,
        '<a href="#/">Handelaars</a> › <a href="#/v/' + encodeURIComponent(v.id) + '">' + esc(v.name) + '</a> › <span>' + esc(s.name) + '</span>',
        '<button type="button" class="btn" data-edit="sections" data-edit-id="' + esc(s.id) + '">✏️ Sectie bewerken</button>') +
      '<div class="grid">' + productsOf(s.id).map(function (p) {
        var price = A.formatPrice(p.price, menu.settings.currency);
        return cardHTML('products', p, {
          img: p.image, ph: s.icon || (p.name || '?').charAt(0), style: style,
          sub: esc(price || 'Geen prijs') + (p.portion ? ' · ' + esc(p.portion) : ''),
          meta: (p.slot ? '<span class="pill">Vak ' + esc(p.slot) + '</span>' : '<span class="pill warn">Geen vak</span>') +
            (p.video ? '<span class="pill">🎬 Video</span>' : '') +
            (p.allergens.length ? '<span class="pill" title="Allergenen">' + p.allergens.map(function (a) { var x = A.allergen(a); return x ? x.icon : ''; }).join('') + '</span>' : ''),
          badge: p.soldOut ? '<span class="badge-out">Uitverkocht</span>' : '',
        });
      }).join('') + addCard('products', 'Product toevoegen') + '</div>';
  }

  function renderSlots() {
    var q = slotQuery.trim().toLowerCase();
    var rows = menu.products.map(function (p) {
      var s = byId(menu.sections, p.sectionId);
      return { p: p, s: s, v: s && byId(menu.vendors, s.vendorId) };
    }).filter(function (r) {
      if (!q) return true;
      return [r.p.name, r.p.slot, r.s && r.s.name, r.v && r.v.name].join(' ').toLowerCase().indexOf(q) >= 0;
    });
    rows.sort(function (a, b) {
      var x = a.p.slot || '', y = b.p.slot || '';
      if (!x !== !y) return x ? -1 : 1;
      return A.naturalCompare(x, y) || A.naturalCompare(a.p.name, b.p.name);
    });
    var counts = {};
    menu.products.forEach(function (p) {
      var k = String(p.slot || '').trim().toLowerCase();
      if (k && p.visible !== false) counts[k] = (counts[k] || 0) + 1;
    });
    var dups = Object.keys(counts).filter(function (k) { return counts[k] > 1; });

    main.innerHTML = pageHead('Vakken overzicht', 'Snel bijwerken welk product in welk vak ligt, en wat er uitverkocht is', '') +
      (dups.length ? '<div class="panel warn-panel">⚠️ Deze vaknummers worden door meer dan één zichtbaar product gebruikt: <b>' + dups.map(esc).join(', ') + '</b></div>' : '') +
      '<div class="toolbar"><input type="search" class="input" id="slotSearch" placeholder="Zoek op product, handelaar of vak…" value="' + esc(slotQuery) + '">' +
      '<span class="muted">' + plural(rows.length, 'product', 'producten') + '</span></div>' +
      '<div class="panel table-wrap"><table class="table"><thead><tr><th>Vak</th><th></th><th>Product</th><th>Handelaar › sectie</th><th>Prijs</th><th>Uitverkocht</th><th>Zichtbaar</th></tr></thead><tbody>' +
      rows.map(function (r) {
        var p = r.p, k = String(p.slot || '').trim().toLowerCase();
        var dup = k && p.visible !== false && counts[k] > 1;
        return '<tr data-id="' + esc(p.id) + '" class="' + (p.visible === false ? 'is-hidden' : '') + '">' +
          '<td><input class="input slot-input' + (dup ? ' dup' : '') + '" data-slot value="' + esc(p.slot || '') + '" placeholder="—"' + (dup ? ' title="Dit vaknummer wordt vaker gebruikt"' : '') + '></td>' +
          '<td>' + (p.image ? '<img class="thumb" src="' + esc(p.image) + '" alt="">' : '<div class="thumb">' + esc((r.s && r.s.icon) || '') + '</div>') + '</td>' +
          '<td><button type="button" class="linkish" data-edit="products" data-edit-id="' + esc(p.id) + '">' + esc(p.name) + '</button></td>' +
          '<td class="muted">' + esc(r.v ? r.v.name : '?') + ' › ' + esc(r.s ? r.s.name : '?') + '</td>' +
          '<td>' + esc(A.formatPrice(p.price, menu.settings.currency)) + '</td>' +
          '<td><label class="switch red"><input type="checkbox" data-soldout' + (p.soldOut ? ' checked' : '') + '><span></span></label></td>' +
          '<td><label class="switch"><input type="checkbox" data-visible' + (p.visible === false ? '' : ' checked') + '><span></span></label></td>' +
        '</tr>';
      }).join('') +
      '</tbody></table>' + (rows.length ? '' : '<p class="muted center">Geen producten gevonden.</p>') + '</div>';
  }

  function renderSettings() {
    main.innerHTML = pageHead('Startscherm & instellingen', 'Wijzigingen worden direct opgeslagen en verschijnen meteen op het scherm',
        '<a class="btn" href="/" target="_blank" rel="noopener">📺 Bekijk scherm</a>') +
      '<div class="panel"><div class="form" id="settingsForm">' + fieldsHTML(SETTINGS_FIELDS, menu.settings) + '</div></div>' +
      '<div class="panel"><h3 class="form-h">Reservekopie</h3>' +
        '<p class="muted">Download al je teksten en instellingen als bestand, of zet een eerdere kopie terug. ' +
        (B.mode === 'online'
          ? 'Foto’s blijven online staan. Daarnaast wordt elke dag automatisch een kopie bewaard (60 dagen).'
          : 'Foto’s staan los op de server in <code>data/uploads</code>; de server bewaart daarnaast elke dag automatisch een kopie in <code>data/backups</code>.') +
        '</p>' +
        '<div class="row-btns"><button type="button" class="btn" data-export>⬇️ Download reservekopie</button>' +
        '<label class="btn">⬆️ Reservekopie terugzetten<input type="file" accept=".json,application/json" hidden data-import></label></div>' +
      '</div>' +
      (B.needsLogin
        ? '<div class="panel"><h3 class="form-h">Beveiliging</h3>' +
            '<p class="muted">Kies een eigen wachtwoord van minstens 10 tekens. Andere apparaten worden dan uitgelogd.</p>' +
            '<div class="row-btns">' +
              '<input class="input pw-input" type="password" id="newPw" placeholder="Nieuw wachtwoord" autocomplete="new-password">' +
              '<button type="button" class="btn" data-change-pw>Wachtwoord wijzigen</button>' +
              '<button type="button" class="btn ghost" data-logout>Uitloggen</button>' +
            '</div>' +
          '</div>'
        : '');
    bindForm(document.getElementById('settingsForm'), SETTINGS_FIELDS, menu.settings, save);
  }

  // ---------- acties op de pagina ----------

  main.addEventListener('click', function (e) {
    var t = e.target;
    var add = t.closest('[data-add]');
    if (add) return openEditor(add.getAttribute('data-add'), null, route().id);
    var edit = t.closest('[data-edit]');
    if (edit) return openEditor(edit.getAttribute('data-edit'), edit.getAttribute('data-edit-id'));
    if (t.closest('[data-export]')) return exportMenu();
    if (t.closest('[data-change-pw]')) return changePassword();
    if (t.closest('[data-logout]')) return B.logout().then(function () { location.reload(); });
    if (t.closest('.switch')) return;
    var card = t.closest('.card[data-id]');
    if (!card) return;
    var kind = card.getAttribute('data-kind'), id = card.getAttribute('data-id');
    var dots = t.closest('[data-menu]');
    if (dots) return showCardMenu(dots, kind, id);
    if (t.closest('[data-open]')) {
      if (kind === 'vendors') location.hash = '#/v/' + encodeURIComponent(id);
      else if (kind === 'sections') location.hash = '#/s/' + encodeURIComponent(id);
      else openEditor('products', id);
    }
  });

  main.addEventListener('change', function (e) {
    var t = e.target;
    if (t.hasAttribute('data-toggle')) {
      var card = t.closest('.card');
      byId(menu[card.getAttribute('data-kind')], card.getAttribute('data-id')).visible = t.checked;
      card.classList.toggle('is-hidden', !t.checked);
      return save();
    }
    if (t.hasAttribute('data-import')) return importMenu(t);
    var row = t.closest('tr[data-id]');
    if (!row) return;
    var p = byId(menu.products, row.getAttribute('data-id'));
    if (t.hasAttribute('data-slot')) p.slot = t.value.trim();
    else if (t.hasAttribute('data-soldout')) p.soldOut = t.checked;
    else if (t.hasAttribute('data-visible')) p.visible = t.checked;
    else return;
    save();
    render();
  });

  main.addEventListener('input', function (e) {
    if (e.target.id !== 'slotSearch') return;
    slotQuery = e.target.value;
    renderSlots();
    var input = document.getElementById('slotSearch');
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });

  main.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.hasAttribute('data-slot')) e.target.blur();
  });

  // ---------- slepen om te sorteren ----------

  var drag = null;
  main.addEventListener('dragstart', function (e) {
    var card = e.target.closest && e.target.closest('.card[data-id]');
    if (!card) return;
    drag = { kind: card.getAttribute('data-kind'), id: card.getAttribute('data-id') };
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', drag.id); } catch (x) { /* oude browsers */ }
  });
  main.addEventListener('dragover', function (e) {
    var card = e.target.closest('.card[data-id]');
    if (!drag || !card || card.getAttribute('data-kind') !== drag.kind) return;
    e.preventDefault();
    clearDropMarks();
    var r = card.getBoundingClientRect();
    card.classList.add(e.clientX > r.left + r.width / 2 ? 'drop-after' : 'drop-before');
  });
  main.addEventListener('drop', function (e) {
    var card = e.target.closest('.card[data-id]');
    if (!drag || !card) return;
    e.preventDefault();
    moveItem(drag.kind, drag.id, card.getAttribute('data-id'), card.classList.contains('drop-after'));
  });
  main.addEventListener('dragend', function () {
    drag = null;
    clearDropMarks();
    document.querySelectorAll('.dragging').forEach(function (x) { x.classList.remove('dragging'); });
  });
  function clearDropMarks() {
    document.querySelectorAll('.drop-before,.drop-after').forEach(function (x) { x.classList.remove('drop-before', 'drop-after'); });
  }
  function moveItem(kind, fromId, toId, after) {
    if (fromId === toId) return;
    var arr = menu[kind];
    var item = arr.splice(arr.indexOf(byId(arr, fromId)), 1)[0];
    var to = arr.indexOf(byId(arr, toId));
    arr.splice(after ? to + 1 : to, 0, item);
    save();
    render();
  }

  // ---------- kaartmenu (⋮) ----------

  function closeMenus() {
    document.querySelectorAll('.popover').forEach(function (m) { m.remove(); });
  }
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.popover, [data-menu]')) closeMenus();
  });

  function showCardMenu(btn, kind, id) {
    closeMenus();
    var item = byId(menu[kind], id);
    var m = document.createElement('div');
    m.className = 'popover';
    m.innerHTML = '<button type="button" data-act="edit">✏️ Bewerken</button>' +
      '<button type="button" data-act="dup">📄 Dupliceren</button>' +
      (kind === 'products' ? '<button type="button" data-act="soldout">' + (item.soldOut ? '✅ Weer op voorraad' : '⛔ Uitverkocht') + '</button>' : '') +
      '<button type="button" data-act="del" class="danger">🗑️ Verwijderen</button>';
    document.body.appendChild(m);
    var r = btn.getBoundingClientRect();
    m.style.top = (r.bottom + window.scrollY + 6) + 'px';
    m.style.left = Math.max(8, Math.min(r.right - m.offsetWidth, window.innerWidth - m.offsetWidth - 8)) + window.scrollX + 'px';
    m.addEventListener('click', function (e) {
      var a = e.target.closest('[data-act]');
      if (!a) return;
      closeMenus();
      cardAction(a.getAttribute('data-act'), kind, id);
    });
  }

  function cardAction(act, kind, id) {
    var item = byId(menu[kind], id);
    if (act === 'edit') return openEditor(kind, id);
    if (act === 'dup') { duplicate(kind, id, null); toast('Gedupliceerd'); }
    if (act === 'soldout') item.soldOut = !item.soldOut;
    if (act === 'del') {
      if (!confirmDelete(kind, item)) return;
      removeItem(kind, id);
      toast('Verwijderd');
    }
    save();
    render();
  }

  function confirmDelete(kind, item) {
    var extra = kind === 'vendors' ? ' en alle secties en producten daarin' : kind === 'sections' ? ' en alle producten daarin' : '';
    return confirm('“' + item.name + '”' + extra + ' verwijderen?\nDit kan niet ongedaan worden gemaakt.');
  }

  function removeItem(kind, id) {
    if (kind === 'vendors') sectionsOf(id).forEach(function (s) { removeItem('sections', s.id); });
    if (kind === 'sections') menu.products = menu.products.filter(function (p) { return p.sectionId !== id; });
    menu[kind] = menu[kind].filter(function (x) { return x.id !== id; });
  }

  function duplicate(kind, id, newParent) {
    var src = byId(menu[kind], id);
    var copy = JSON.parse(JSON.stringify(src));
    copy.id = A.uid(kind.charAt(0));
    if (newParent) copy[kind === 'sections' ? 'vendorId' : 'sectionId'] = newParent;
    else copy.name = src.name + ' (kopie)';
    if (kind === 'products') copy.slot = ''; // twee producten in hetzelfde vak kan niet
    var children = kind === 'vendors' ? sectionsOf(id) : kind === 'sections' ? productsOf(id) : [];
    menu[kind].splice(menu[kind].indexOf(src) + 1, 0, copy);
    children.forEach(function (c) { duplicate(kind === 'vendors' ? 'sections' : 'products', c.id, copy.id); });
    return copy;
  }

  // ---------- bewerkpaneel ----------

  var drawerState = null;

  function newItem(kind, parentId) {
    if (kind === 'vendors') {
      return { id: A.uid('v'), name: '', tagline: '', logo: '', cover: '', visible: true, theme: A.fullTheme(A.PRESETS[4].theme) };
    }
    if (kind === 'sections') {
      return { id: A.uid('s'), vendorId: parentId, name: '', description: '', icon: '', image: '', accent: '', visible: true };
    }
    return {
      id: A.uid('p'), sectionId: parentId, name: '', description: '', price: null, slot: '', portion: '',
      image: '', video: '', allergens: [], traces: '', ingredients: '', labels: [], soldOut: false, visible: true,
    };
  }

  function openEditor(kind, id, parentId) {
    var existing = id ? byId(menu[kind], id) : null;
    if (id && !existing) return;
    var draft = existing ? JSON.parse(JSON.stringify(existing)) : newItem(kind, parentId);
    var noun = { vendors: 'handelaar', sections: 'sectie', products: 'product' }[kind];
    drawer.innerHTML =
      '<div class="drawer-backdrop" data-close-drawer></div>' +
      '<div class="drawer-panel" role="dialog" aria-modal="true">' +
        '<div class="drawer-head"><h2>' + (existing ? 'Bewerk ' + noun : (kind === 'products' ? 'Nieuw ' : 'Nieuwe ') + noun) + '</h2>' +
          '<button type="button" class="icon-btn" data-close-drawer aria-label="Sluiten">✕</button></div>' +
        '<div class="drawer-body"><div class="form">' + fieldsHTML(SCHEMAS[kind], draft) + '</div></div>' +
        '<div class="drawer-foot">' +
          (existing ? '<button type="button" class="btn danger" data-delete>Verwijderen</button>' : '') +
          '<span class="spacer"></span>' +
          '<button type="button" class="btn" data-close-drawer>Annuleren</button>' +
          '<button type="button" class="btn primary" data-save>Opslaan</button>' +
        '</div>' +
      '</div>';
    drawer.hidden = false;
    document.body.classList.add('no-scroll');
    drawerState = { kind: kind, existing: existing, draft: draft, changed: false };
    bindForm(drawer.querySelector('.form'), SCHEMAS[kind], draft, function () { drawerState.changed = true; });
    if (!existing) drawer.querySelector('[data-key="name"]').focus();
  }

  function closeDrawer(force) {
    if (!drawerState) return;
    if (!force && drawerState.changed && !confirm('Je wijzigingen zijn nog niet opgeslagen. Toch sluiten?')) return;
    drawerState = null;
    drawer.hidden = true;
    drawer.innerHTML = '';
    document.body.classList.remove('no-scroll');
  }

  function saveDrawer() {
    var st = drawerState, d = st.draft;
    if (!String(d.name || '').trim()) {
      toast('Vul eerst een naam in');
      drawer.querySelector('[data-key="name"]').focus();
      return;
    }
    if (uploadsBusy) { toast('Even wachten tot de upload klaar is'); return; }
    d.name = d.name.trim();
    if (st.existing) {
      Object.keys(st.existing).forEach(function (k) { delete st.existing[k]; });
      Object.assign(st.existing, d);
    } else {
      menu[st.kind].push(d);
    }
    save();
    closeDrawer(true);
    if (!st.existing && st.kind === 'vendors') location.hash = '#/v/' + encodeURIComponent(d.id);
    else render();
    toast('Opgeslagen');
  }

  drawer.addEventListener('click', function (e) {
    if (e.target.closest('[data-close-drawer]')) return closeDrawer(false);
    if (e.target.closest('[data-save]')) return saveDrawer();
    if (e.target.closest('[data-delete]')) {
      var st = drawerState;
      if (!confirmDelete(st.kind, st.existing)) return;
      removeItem(st.kind, st.existing.id);
      save();
      closeDrawer(true);
      render();
      toast('Verwijderd');
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { if (document.querySelector('.popover')) closeMenus(); else closeDrawer(false); }
  });

  // ---------- formuliervelden ----------

  function getPath(obj, key) {
    return key.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
  }
  function setPath(obj, key, val) {
    var parts = key.split('.'), o = obj;
    for (var i = 0; i < parts.length - 1; i++) o = o[parts[i]] = o[parts[i]] || {};
    o[parts[parts.length - 1]] = val;
  }

  function fieldsHTML(fields, obj) {
    return fields.map(function (f) { return fieldHTML(f, obj); }).join('');
  }

  function fieldHTML(f, obj) {
    var v = f.key ? getPath(obj, f.key) : null;
    var hint = f.hint ? '<div class="hint">' + esc(f.hint) + '</div>' : '';
    var label = '<label class="lbl">' + esc(f.label) + (f.required ? ' <span class="req">*</span>' : '') + '</label>';
    var ph = f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '';
    var key = ' data-key="' + esc(f.key) + '"';
    var wrap = function (inner) { return '<div class="field' + (f.short ? ' short' : '') + '">' + label + inner + hint + '</div>'; };

    switch (f.type) {
      case 'heading':
        return '<h3 class="form-h">' + esc(f.label) + '</h3>';
      case 'text':
        return wrap('<input class="input"' + key + ph + ' value="' + esc(v || '') + '">');
      case 'number':
        return wrap('<input class="input" type="number" min="0" step="1"' + key + ' value="' + esc(v == null ? '' : v) + '">');
      case 'price':
        return wrap('<input class="input" inputmode="decimal" data-type="price"' + key + ph +
          ' value="' + esc(v == null || v === '' ? '' : Number(v).toFixed(2).replace('.', ',')) + '">');
      case 'textarea':
        return wrap('<textarea class="input" rows="' + (f.rows || 3) + '"' + key + ph + '>' + esc(v || '') + '</textarea>');
      case 'tags':
        return wrap('<input class="input" data-type="tags"' + key + ph + ' value="' + esc((v || []).join(', ')) + '">');
      case 'select':
        return wrap('<select class="input"' + key + '>' + f.options.map(function (o) {
          return '<option value="' + esc(o[0]) + '"' + (o[0] === v ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
        }).join('') + '</select>');
      case 'section':
        return wrap('<select class="input"' + key + '>' + menu.vendors.map(function (vd) {
          return '<optgroup label="' + esc(vd.name) + '">' + sectionsOf(vd.id).map(function (s) {
            return '<option value="' + esc(s.id) + '"' + (s.id === v ? ' selected' : '') + '>' + esc(s.name) + '</option>';
          }).join('') + '</optgroup>';
        }).join('') + '</select>');
      case 'coloropt':
        return wrap('<div class="color-opt"><label class="switch"><input type="checkbox" data-coloropt="' + esc(f.key) + '"' + (v ? ' checked' : '') + '><span></span></label>' +
          '<input type="color"' + key + ' value="' + esc(v || '#c0466f') + '"' + (v ? '' : ' disabled') + '></div>');
      case 'toggle': {
        var on = f.def ? v !== false : !!v;
        return '<div class="field toggle-field"><label class="switch"><input type="checkbox"' + key + (on ? ' checked' : '') + '><span></span></label>' +
          '<div><div class="lbl">' + esc(f.label) + '</div>' + hint + '</div></div>';
      }
      case 'allergens':
        return wrap('<div class="allergen-grid">' + A.ALLERGENS.map(function (a) {
          return '<label class="chk"><input type="checkbox" data-allergen="' + a.id + '"' + ((v || []).indexOf(a.id) >= 0 ? ' checked' : '') + '>' +
            '<span>' + a.icon + ' ' + esc(a.label) + '</span></label>';
        }).join('') + '</div>');
      case 'image':
      case 'video':
        return wrap(mediaField(f, v));
      case 'theme':
        return themeEditor(f.key, v);
    }
    return '';
  }

  function mediaField(f, v) {
    var video = f.type === 'video';
    var preview = v
      ? (video ? '<video src="' + esc(v) + '" muted playsinline controls preload="metadata"></video>' : '<img src="' + esc(v) + '" alt="">')
      : '<div class="media-empty">' + (video ? '🎬 Geen video' : '📷 Geen foto') + '</div>';
    return '<div class="media-field' + (f.alpha ? ' alpha' : '') + '" data-media="' + esc(f.key) + '" data-media-type="' + f.type + '">' +
      '<div class="media-preview">' + preview + '</div>' +
      '<div class="media-actions">' +
        '<label class="btn">' + (v ? 'Vervangen' : video ? 'Kies video' : 'Kies foto') +
          '<input type="file" hidden data-file accept="' + (video ? 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm' : 'image/*') + '"></label>' +
        (v ? '<button type="button" class="btn ghost" data-clear-media>Verwijderen</button>' : '') +
        '<div class="progress" hidden><i></i></div>' +
      '</div>' +
    '</div>';
  }

  function themeEditor(key, t) {
    t = A.fullTheme(t);
    function fontOptions(sel) {
      return A.FONTS.map(function (f) { return '<option' + (f.name === sel ? ' selected' : '') + '>' + esc(f.name) + '</option>'; }).join('');
    }
    function color(k, label) {
      return '<label class="color-field"><input type="color" data-key="' + key + '.' + k + '" value="' + esc(t[k]) + '"><span>' + label + '</span></label>';
    }
    return '<div class="field theme-editor" data-theme-editor="' + esc(key) + '">' +
      '<label class="lbl">Snel kiezen</label>' +
      '<div class="presets">' + A.PRESETS.map(function (p, i) {
        return '<button type="button" class="preset" data-preset="' + i + '" style="' + esc(A.themeVars(p.theme)) + '"><i></i>' + esc(p.name) + '</button>';
      }).join('') + '</div>' +
      '<div class="theme-grid">' +
        '<div class="theme-controls">' +
          '<div class="row2">' +
            '<div><label class="lbl">Lettertype titels</label><select class="input" data-key="' + key + '.headingFont">' + fontOptions(t.headingFont) + '</select></div>' +
            '<div><label class="lbl">Lettertype tekst</label><select class="input" data-key="' + key + '.bodyFont">' + fontOptions(t.bodyFont) + '</select></div>' +
          '</div>' +
          '<label class="lbl">Kleuren</label>' +
          '<div class="colors">' + color('bg', 'Achtergrond') + color('surface', 'Kaarten') + color('text', 'Tekst') +
            color('accent', 'Accent') + color('accentText', 'Tekst op accent') + '</div>' +
          '<label class="lbl">Afronding hoeken <span class="muted" data-radius-out>' + t.radius + ' px</span></label>' +
          '<input type="range" min="0" max="36" data-key="' + key + '.radius" value="' + esc(t.radius) + '">' +
        '</div>' +
        '<div><label class="lbl">Voorbeeld</label><div class="theme-preview" data-preview="' + esc(key) + '"></div></div>' +
      '</div>' +
    '</div>';
  }

  function previewHTML(obj, t) {
    var title = obj.name || obj.machineName || 'Naam';
    var img = obj.cover || obj.image || '';
    var pcard = function (name, price, slot) {
      return '<div class="pv-card"><div class="pv-img">' + (img ? '<img src="' + esc(img) + '" alt="">' : '') +
        '<span class="pv-slot">' + slot + '</span></div><div class="pv-name">' + name + '</div><div class="pv-price">' + price + '</div></div>';
    };
    return '<div class="pv-bar"><div class="pv-title">' + esc(title) + '</div>' +
      '<div class="pv-chips"><span class="on">Taarten</span><span>Pies</span><span>Brownies</span></div></div>' +
      '<div class="pv-cards">' + pcard('Productnaam', '€ 24,50', '12') + pcard('Nog een product', '€ 3,25', '13') + '</div>' +
      '<div class="pv-keypad" style="border-radius:' + Number(t.radius) + 'px"><span>1</span><span>2</span> Toets in</div>';
  }

  function readValue(el) {
    if (el.type === 'checkbox') return el.checked;
    var type = el.getAttribute('data-type');
    if (type === 'price') {
      var s = el.value.replace(/[^\d,.]/g, '').replace(',', '.');
      var n = parseFloat(s);
      return s === '' || isNaN(n) ? null : Math.round(n * 100) / 100;
    }
    if (type === 'tags') return el.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    if (el.type === 'number' || el.type === 'range') return el.value === '' ? 0 : Number(el.value);
    return el.value;
  }

  // Koppelt een formulier aan een object: elke wijziging wordt direct in `obj` gezet.
  function bindForm(root, fields, obj, onChange) {
    function fieldDef(key) { return fields.filter(function (f) { return f.key === key; })[0]; }
    function changed() { updatePreviews(); if (onChange) onChange(); }

    function updatePreviews() {
      root.querySelectorAll('[data-preview]').forEach(function (el) {
        var t = A.fullTheme(getPath(obj, el.getAttribute('data-preview')));
        el.setAttribute('style', A.themeVars(t));
        el.innerHTML = previewHTML(obj, t);
        var out = el.closest('.theme-editor').querySelector('[data-radius-out]');
        if (out) out.textContent = t.radius + ' px';
      });
    }

    function refreshField(key) {
      var holder = root.querySelector('[data-media="' + key + '"]').closest('.field');
      holder.outerHTML = fieldHTML(fieldDef(key), obj);
    }

    function handle(e) {
      var el = e.target;
      if (el.hasAttribute('data-allergen')) {
        obj.allergens = [].map.call(root.querySelectorAll('[data-allergen]:checked'), function (x) { return x.getAttribute('data-allergen'); });
        return changed();
      }
      if (el.hasAttribute('data-coloropt')) {
        var k = el.getAttribute('data-coloropt');
        var picker = root.querySelector('input[type=color][data-key="' + k + '"]');
        picker.disabled = !el.checked;
        setPath(obj, k, el.checked ? picker.value : '');
        return changed();
      }
      if (el.hasAttribute('data-file')) {
        if (e.type === 'change') handleFile(el);
        return;
      }
      var key = el.getAttribute('data-key');
      if (!key) return;
      setPath(obj, key, readValue(el));
      changed();
    }
    root.addEventListener('input', handle);
    root.addEventListener('change', handle);

    root.addEventListener('click', function (e) {
      var preset = e.target.closest('[data-preset]');
      if (preset) {
        var editor = preset.closest('[data-theme-editor]');
        var key = editor.getAttribute('data-theme-editor');
        setPath(obj, key, A.fullTheme(A.PRESETS[Number(preset.getAttribute('data-preset'))].theme));
        editor.outerHTML = themeEditor(key, getPath(obj, key));
        return changed();
      }
      var clear = e.target.closest('[data-clear-media]');
      if (clear) {
        var mkey = clear.closest('[data-media]').getAttribute('data-media');
        setPath(obj, mkey, '');
        refreshField(mkey);
        changed();
      }
    });

    function handleFile(input) {
      var file = input.files && input.files[0];
      if (!file) return;
      var mf = input.closest('[data-media]');
      var key = mf.getAttribute('data-media');
      var isVideo = mf.getAttribute('data-media-type') === 'video';
      var bar = mf.querySelector('.progress');
      bar.hidden = false;
      function progress(x) { bar.firstChild.style.width = Math.round(x * 100) + '%'; }
      uploadsBusy++;
      var job = isVideo
        ? uploadVideo(file, progress)
        : prepareImage(file, mf.classList.contains('alpha')).then(function (r) { return uploadBlob(r.blob, r.name, progress); });
      job.then(function (url) {
        setPath(obj, key, url);
        refreshField(key);
        changed();
      }).catch(function (err) {
        bar.hidden = true;
        toast(err.message || 'Upload mislukt');
      }).then(function () { uploadsBusy--; });
    }

    updatePreviews();
  }

  // ---------- uploads ----------

  function prepareImage(file, keepAlpha) {
    if (file.type === 'image/gif') return Promise.resolve({ blob: file, name: 'foto.gif' });
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        // Verkleinen zodat de iPad snel blijft; foto's van een telefoon zijn vaak 4000+ px.
        var max = keepAlpha ? 800 : 1600;
        var scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * scale);
        c.height = Math.round(img.naturalHeight * scale);
        var ctx = c.getContext('2d');
        if (!keepAlpha) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (blob) {
          if (blob) resolve({ blob: blob, name: keepAlpha ? 'logo.png' : 'foto.jpg' });
          else reject(new Error('Kon de foto niet verwerken'));
        }, keepAlpha ? 'image/png' : 'image/jpeg', 0.86);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('Deze foto kan niet gelezen worden. Gebruik JPG of PNG (iPhone-foto’s eerst als JPG opslaan).'));
      };
      img.src = url;
    });
  }

  function uploadVideo(file, onProgress) {
    var ext = ((file.name || '').match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
    if (['.mp4', '.mov', '.m4v', '.webm'].indexOf(ext) < 0) return Promise.reject(new Error('Gebruik een MP4- of MOV-video'));
    if (file.size > B.maxUploadMB * 1024 * 1024) {
      return Promise.reject(new Error('Video is groter dan ' + B.maxUploadMB + ' MB. Maak hem korter of kleiner.'));
    }
    return uploadBlob(file, 'video' + ext, onProgress);
  }

  function uploadBlob(blob, name, onProgress) {
    return B.upload(blob, name, onProgress).catch(function (err) {
      if (err.auth) showLogin('Je bent uitgelogd. Log opnieuw in en probeer de upload nog een keer.');
      throw err;
    });
  }

  // ---------- reservekopie ----------

  function exportMenu() {
    var blob = new Blob([JSON.stringify(menu, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'automaat-menu-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function importMenu(input) {
    var file = input.files && input.files[0];
    if (!file) return;
    file.text().then(function (text) {
      var data = JSON.parse(text);
      if (!data || !Array.isArray(data.vendors) || !Array.isArray(data.sections) || !Array.isArray(data.products)) throw new Error();
      if (!confirm('Dit vervangt het hele huidige menu door de reservekopie. Doorgaan?')) return;
      menu = normalize(data);
      save();
      render();
      toast('Reservekopie teruggezet');
    }).catch(function () {
      toast('Dit is geen geldig reservekopie-bestand');
    }).then(function () { input.value = ''; });
  }

  function changePassword() {
    var input = document.getElementById('newPw');
    if (input.value.length < 10) { toast('Gebruik minstens 10 tekens'); input.focus(); return; }
    B.changePassword(input.value).then(function () {
      input.value = '';
      toast('Wachtwoord gewijzigd');
    }).catch(function (err) {
      if (err.auth) showLogin('Log opnieuw in om je wachtwoord te wijzigen.');
      else toast('Wijzigen mislukt – controleer de verbinding');
    });
  }

  // ---------- melding ----------

  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
})();
