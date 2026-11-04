export function initializeWindowChrome() {
  if (!window.trialsWindow) return;
  document.documentElement.dataset.desktopShell = 'true';
  document.getElementById('desktop-titlebar').hidden = false;
  document.getElementById('window-minimize').onclick = () => window.trialsWindow.minimize();
  document.getElementById('window-maximize').onclick = () => window.trialsWindow.toggleMaximize();
  document.getElementById('window-close').onclick = () => window.trialsWindow.close();
  window.trialsWindow.onState(state => {
    const button = document.getElementById('window-maximize');
    button.setAttribute('aria-label', state.maximized ? 'Restore window' : 'Maximize window');
    button.title = button.getAttribute('aria-label'); button.classList.toggle('is-maximized', state.maximized);
  });
}
