export function createShapeMenu(button, menu, onChoose) {
  let type = 'rectangle', outline = false;
  const options = [...menu.querySelectorAll('[data-shape]')], style = menu.querySelector('[data-outline]');
  function sync() {
    for (const item of options) { item.setAttribute('aria-checked', item.dataset.shape === type); item.classList.toggle('active', item.dataset.shape === type); }
    style.setAttribute('aria-checked', outline); style.classList.toggle('active', outline); style.disabled = type === 'line';
    button.title = `Shape: ${type}${type === 'line' ? '' : outline ? ' outline' : ' filled'} (U). Right-click for options.`;
  }
  function close(focus = false) { menu.hidden = true; button.setAttribute('aria-expanded', 'false'); if (focus) button.focus(); }
  function open() {
    onChoose(type, outline); sync(); menu.hidden = false; button.setAttribute('aria-expanded', 'true');
    const bounds = button.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(innerWidth - menu.offsetWidth - 8, bounds.left))}px`;
    menu.style.top = `${Math.max(8, bounds.top - menu.offsetHeight - 8)}px`;
    (options.find(item => item.dataset.shape === type) || options[0]).focus();
  }
  for (const item of options) item.onclick = () => { type = item.dataset.shape; sync(); onChoose(type, outline); close(true); };
  style.onclick = () => { outline = !outline; sync(); onChoose(type, outline); };
  button.addEventListener('contextmenu', event => { event.preventDefault(); event.stopPropagation(); open(); });
  document.addEventListener('contextmenu', event => event.preventDefault());
  document.addEventListener('pointerdown', event => { if (!menu.contains(event.target) && !button.contains(event.target)) close(); });
  menu.addEventListener('keydown', event => {
    const choices = [...options, style].filter(item => !item.disabled), current = choices.indexOf(document.activeElement);
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length;
      choices[index].focus();
    } else if (event.key === 'Tab') close();
  });
  window.addEventListener('resize', () => close()); window.addEventListener('blur', () => close());
  sync();
  return { close, get open() { return !menu.hidden; } };
}
