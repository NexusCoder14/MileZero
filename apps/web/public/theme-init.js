// Automatically load saved theme or respect system preference before first render
(function() {
  try {
    var stored = localStorage.getItem('mz-theme');
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.dataset.theme = stored;
    } else {
      // System default or unset: data-theme removed or set to empty
      delete document.documentElement.dataset.theme;
    }
  } catch (e) {
    // If localStorage blocked or restricted
  }
})();

