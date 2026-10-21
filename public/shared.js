// Gedeeld tussen het scherm (iPad) en het beheer.
(function () {
  // De 14 wettelijke allergenen (EU 1169/2011).
  var ALLERGENS = [
    { id: 'gluten', label: 'Gluten', icon: '🌾' },
    { id: 'schaaldieren', label: 'Schaaldieren', icon: '🦐' },
    { id: 'eieren', label: 'Eieren', icon: '🥚' },
    { id: 'vis', label: 'Vis', icon: '🐟' },
    { id: 'pinda', label: "Pinda's", icon: '🥜' },
    { id: 'soja', label: 'Soja', icon: '🫘' },
    { id: 'melk', label: 'Melk', icon: '🥛' },
    { id: 'noten', label: 'Noten', icon: '🌰' },
    { id: 'selderij', label: 'Selderij', icon: '🥬' },
    { id: 'mosterd', label: 'Mosterd', icon: '🟡' },
    { id: 'sesam', label: 'Sesamzaad', icon: '⚪' },
    { id: 'sulfiet', label: 'Sulfiet', icon: '🍷' },
    { id: 'lupine', label: 'Lupine', icon: '🌼' },
    { id: 'weekdieren', label: 'Weekdieren', icon: '🦪' },
  ];

  // Google Fonts. `weights` moet bestaan voor dat lettertype, anders laadt het niet.
  var FONTS = [
    { name: 'Systeem', stack: "-apple-system, system-ui, 'Segoe UI', Roboto, sans-serif" },
    { name: 'Inter', weights: '400;600;700', stack: 'sans-serif' },
    { name: 'Nunito', weights: '400;600;700;800', stack: 'sans-serif' },
    { name: 'Poppins', weights: '400;600;700', stack: 'sans-serif' },
    { name: 'Montserrat', weights: '400;600;700;800', stack: 'sans-serif' },
    { name: 'Quicksand', weights: '400;600;700', stack: 'sans-serif' },
    { name: 'Fredoka', weights: '400;600;700', stack: 'sans-serif' },
    { name: 'Baloo 2', weights: '400;600;700;800', stack: 'sans-serif' },
    { name: 'Oswald', weights: '400;600;700', stack: 'sans-serif' },
    { name: 'Bebas Neue', weights: '400', stack: 'sans-serif' },
    { name: 'Playfair Display', weights: '400;600;700;800', stack: 'Georgia, serif' },
    { name: 'DM Serif Display', weights: '400', stack: 'Georgia, serif' },
    { name: 'Lora', weights: '400;600;700', stack: 'Georgia, serif' },
    { name: 'Cormorant Garamond', weights: '400;600;700', stack: 'Georgia, serif' },
    { name: 'Lobster', weights: '400', stack: 'cursive' },
    { name: 'Pacifico', weights: '400', stack: 'cursive' },
    { name: 'Caveat', weights: '400;600;700', stack: 'cursive' },
  ];

  var DEFAULT_THEME = {
    headingFont: 'Poppins',
    bodyFont: 'Inter',
    bg: '#f6f4ef',
    surface: '#ffffff',
    text: '#23201b',
    accent: '#9c8a4e',
    accentText: '#ffffff',
    radius: 18,
  };

  var PRESETS = [
    { name: 'Patisserie roze', theme: { headingFont: 'Playfair Display', bodyFont: 'Nunito', bg: '#f8e6e8', surface: '#ffffff', text: '#3d2626', accent: '#c0466f', accentText: '#ffffff', radius: 20 } },
    { name: 'Chocolade', theme: { headingFont: 'DM Serif Display', bodyFont: 'Lora', bg: '#2b1d17', surface: '#3a2820', text: '#f6ece3', accent: '#e0a458', accentText: '#2b1d17', radius: 14 } },
    { name: 'Boerderij groen', theme: { headingFont: 'Fredoka', bodyFont: 'Nunito', bg: '#eaf4e6', surface: '#ffffff', text: '#1f3b2a', accent: '#2f8f4e', accentText: '#ffffff', radius: 22 } },
    { name: 'Snacks & drinks', theme: { headingFont: 'Bebas Neue', bodyFont: 'Poppins', bg: '#121419', surface: '#1e212b', text: '#ffffff', accent: '#ffcc00', accentText: '#121419', radius: 12 } },
    { name: 'Klassiek', theme: { headingFont: 'Lora', bodyFont: 'Inter', bg: '#f6f4ef', surface: '#ffffff', text: '#23201b', accent: '#9c8a4e', accentText: '#ffffff', radius: 16 } },
    { name: 'Zee blauw', theme: { headingFont: 'Montserrat', bodyFont: 'Inter', bg: '#e7f0f8', surface: '#ffffff', text: '#10283f', accent: '#1f6fb2', accentText: '#ffffff', radius: 16 } },
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function uid(prefix) {
    return (prefix || 'x') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function formatPrice(n, currency) {
    if (n === null || n === undefined || n === '' || isNaN(n)) return '';
    try {
      return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: currency || 'EUR' }).format(n);
    } catch (e) {
      return '€ ' + Number(n).toFixed(2).replace('.', ',');
    }
  }

  function parseHex(hex) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (h.length !== 6 || isNaN(n)) return [0, 0, 0];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // Mengt kleur a met b; t = aandeel van b (0..1). Bewust zonder color-mix() voor oudere iPads.
  function mix(a, b, t) {
    var x = parseHex(a), y = parseHex(b);
    return '#' + [0, 1, 2].map(function (i) {
      var v = Math.round(x[i] * (1 - t) + y[i] * t);
      return ('0' + v.toString(16)).slice(-2);
    }).join('');
  }

  function fontStack(name) {
    var f = FONTS.filter(function (x) { return x.name === name; })[0];
    if (!f) return FONTS[0].stack;
    // Enkele aanhalingstekens: deze tekst komt ook in style="..." attributen terecht.
    return f.weights ? "'" + f.name + "', " + f.stack : f.stack;
  }

  var loadedFonts = {};
  function loadFont(name) {
    var f = FONTS.filter(function (x) { return x.name === name; })[0];
    if (!f || !f.weights || loadedFonts[name]) return;
    loadedFonts[name] = true;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(f.name).replace(/%20/g, '+') +
      ':wght@' + f.weights + '&display=swap';
    document.head.appendChild(link);
  }

  function fullTheme(t) {
    var out = {};
    for (var k in DEFAULT_THEME) out[k] = t && t[k] !== undefined && t[k] !== '' ? t[k] : DEFAULT_THEME[k];
    return out;
  }

  // CSS-variabelen voor een thema, als inline style-tekst.
  function themeVars(t) {
    t = fullTheme(t);
    loadFont(t.headingFont);
    loadFont(t.bodyFont);
    return [
      '--bg:' + t.bg,
      '--surface:' + t.surface,
      '--text:' + t.text,
      '--muted:' + mix(t.text, t.surface, 0.42),
      '--line:' + mix(t.text, t.surface, 0.88),
      '--accent:' + t.accent,
      '--accent-text:' + t.accentText,
      '--accent-soft:' + mix(t.accent, t.surface, 0.84),
      '--font-head:' + fontStack(t.headingFont),
      '--font-body:' + fontStack(t.bodyFont),
      '--radius:' + Number(t.radius) + 'px',
    ].join(';');
  }

  function allergen(id) {
    return ALLERGENS.filter(function (a) { return a.id === id; })[0];
  }

  function naturalCompare(a, b) {
    return String(a).localeCompare(String(b), 'nl', { numeric: true, sensitivity: 'base' });
  }

  window.AM = {
    ALLERGENS: ALLERGENS, FONTS: FONTS, PRESETS: PRESETS, DEFAULT_THEME: DEFAULT_THEME,
    esc: esc, uid: uid, formatPrice: formatPrice, mix: mix, fontStack: fontStack, loadFont: loadFont,
    fullTheme: fullTheme, themeVars: themeVars, allergen: allergen, naturalCompare: naturalCompare,
  };
})();
