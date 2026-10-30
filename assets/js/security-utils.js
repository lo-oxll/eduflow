/* Output-encoding helper: the API stores text verbatim, so every value that is
 * placed inside an HTML template string must be passed through escapeHtml(). */
(function (global) {
  'use strict';
  var MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  global.escapeHtml = function (value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, function (c) { return MAP[c]; });
  };
})(window);
