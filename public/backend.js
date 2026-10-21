// Waar het menu staat: online (Supabase, ingesteld in config.js) of op de eigen server (node server.js).
(function () {
  var cfg = window.AM_CONFIG || {};
  var TOKEN_KEY = 'automaat-menu-token';

  function apiError(status, body) {
    var msg = (body && (body.message || body.error)) || 'HTTP ' + status;
    var err = new Error(msg);
    err.status = status;
    err.auth = status === 401 || /NIET_INGELOGD|ONJUIST_WACHTWOORD|Niet ingelogd/.test(msg);
    err.conflict = /CONFLICT/.test(msg);
    return err;
  }

  function readJSON(r) {
    return r.text().then(function (t) {
      var data = null;
      try { data = t ? JSON.parse(t) : null; } catch (e) { data = { message: t }; }
      if (!r.ok) throw apiError(r.status, data);
      return data;
    });
  }

  function xhrSend(method, url, body, headers, onProgress) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open(method, url);
      Object.keys(headers || {}).forEach(function (k) { xhr.setRequestHeader(k, headers[k]); });
      xhr.upload.onprogress = function (e) { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      xhr.onload = function () {
        var res = {};
        try { res = JSON.parse(xhr.responseText); } catch (e) { /* geen JSON */ }
        if (xhr.status >= 200 && xhr.status < 300) resolve(res);
        else reject(apiError(xhr.status, res));
      };
      xhr.onerror = function () { reject(new Error('Upload mislukt – controleer de verbinding')); };
      xhr.send(body);
    });
  }

  function localBackend() {
    return {
      mode: 'local',
      needsLogin: false,
      maxUploadMB: 300,
      loadMenu: function () {
        return fetch('/api/menu', { cache: 'no-store' }).then(function (r) {
          if (!r.ok) throw apiError(r.status);
          return r.text();
        }).then(function (text) { return { text: text }; });
      },
      watch: function (onChange) {
        if (window.EventSource) new EventSource('/api/events').addEventListener('version', onChange);
        setInterval(onChange, 5 * 60 * 1000);
      },
      saveMenu: function (menu) {
        return fetch('/admin/api/menu', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(menu),
        }).then(readJSON);
      },
      upload: function (blob, name, onProgress) {
        return xhrSend('POST', '/admin/api/upload?name=' + encodeURIComponent(name), blob, {}, onProgress)
          .then(function (res) { return res.url; });
      },
    };
  }

  function supabaseBackend() {
    var base = cfg.supabaseUrl.replace(/\/$/, '');
    var headers = { apikey: cfg.supabaseKey, 'Content-Type': 'application/json' };
    var version = null;

    function rest(path, method, body) {
      return fetch(base + '/rest/v1/' + path, {
        method: method || 'GET', headers: headers, cache: 'no-store',
        body: body === undefined ? undefined : JSON.stringify(body),
      }).then(readJSON);
    }
    function rpc(name, args) { return rest('rpc/' + name, 'POST', args); }
    function token() {
      try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
    }
    function setToken(t) {
      try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch (e) { /* privémodus */ }
    }

    return {
      mode: 'online',
      needsLogin: true,
      maxUploadMB: 50, // limiet van het gratis Supabase-abonnement
      loadMenu: function () {
        return rest('menu_document?id=eq.1&select=data,version').then(function (rows) {
          if (rows && rows.length) {
            version = rows[0].version;
            return { text: JSON.stringify(rows[0].data), version: version };
          }
          // Nog nooit opgeslagen: begin met het startmenu; de eerste keer opslaan maakt het online aan.
          version = null;
          return fetch('/seed.json', { cache: 'no-store' }).then(function (r) {
            if (!r.ok) throw apiError(r.status);
            return r.text();
          }).then(function (text) { return { text: text, version: null }; });
        });
      },
      // Elke paar seconden alleen het versienummer ophalen; pas bij een nieuwe versie het hele menu.
      watch: function (onChange) {
        setInterval(function () {
          rest('menu_document?id=eq.1&select=version').then(function (rows) {
            if (rows && rows[0] && rows[0].version !== version) onChange();
          }).catch(function () { /* offline: volgende keer weer */ });
        }, (cfg.pollSeconds || 10) * 1000);
      },
      isLoggedIn: function () {
        if (!token()) return Promise.resolve(false);
        return rpc('menu_session_ok', { p_token: token() });
      },
      login: function (password) {
        return rpc('menu_login', { p_password: password }).then(setToken);
      },
      logout: function () {
        var t = token();
        setToken('');
        return rpc('menu_logout', { p_token: t }).catch(function () { /* sessie verloopt vanzelf */ });
      },
      changePassword: function (password) {
        return rpc('menu_change_password', { p_token: token(), p_new: password });
      },
      saveMenu: function (menu) {
        return rpc('menu_save', { p_token: token(), p_data: menu, p_base_version: version })
          .then(function (v) { version = v; });
      },
      upload: function (blob, name, onProgress) {
        var ext = (name.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
        return fetch(base + '/functions/v1/menu-upload', {
          method: 'POST', headers: headers, body: JSON.stringify({ token: token(), ext: ext }),
        }).then(readJSON).then(function (d) {
          return xhrSend('PUT', d.uploadUrl, blob, {
            'Content-Type': d.contentType, 'cache-control': 'max-age=31536000', 'x-upsert': 'false',
          }, onProgress).then(function () { return d.publicUrl; });
        });
      },
    };
  }

  window.AM.backend = cfg.supabaseUrl && cfg.supabaseKey ? supabaseBackend() : localBackend();
})();
