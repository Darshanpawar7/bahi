/* Runs before the page paints: applies the saved theme (so dark mode never flashes light), and hides the
   pre-rendered welcome screen from people who already have a workspace. External file, so the strict
   Content-Security-Policy needs no inline-script exception. */
(function () {
  var root = document.documentElement;
  try {
    var choice = localStorage.getItem('bahi-theme');
    var dark = choice === 'dark' || (choice !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    if (localStorage.getItem('bahi-returning') === '1') root.classList.add('returning');
  } catch (error) {
    root.setAttribute('data-theme', 'light');
  }
})();
