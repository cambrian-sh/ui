// Applies the saved theme before React mounts so the window never flashes the
// wrong palette. Kept in sync with src/store/shell.ts (key + resolution rule).
(function () {
  var pref = 'system';
  try {
    pref = localStorage.getItem('cambrian-studio:theme') || 'system';
  } catch (e) {}
  var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  var theme = pref === 'system' ? (dark ? 'dark' : 'light') : pref;
  document.documentElement.setAttribute('data-theme', theme);
  try {
    var density = localStorage.getItem('cambrian-studio:density');
    if (density) document.documentElement.setAttribute('data-density', density);
  } catch (e) {}
})();
