/* Backend location. Empty = same origin (Flask serves the pages).
 * On GitHub Pages the deploy workflow overwrites this file with the API URL
 * from the repository variable API_BASE_URL (e.g. https://eduflow.onrender.com). */
window.EDUFLOW_API_BASE = '';

(function () {
  'use strict';
  var base = (window.EDUFLOW_API_BASE || '').replace(/\/+$/, '');
  if (!base || !window.fetch) return;
  var nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    if (typeof input === 'string' && /^\/(api|uploads|health)(\/|$|\?)/.test(input)) {
      input = base + input;
    }
    return nativeFetch(input, init);
  };
})();
