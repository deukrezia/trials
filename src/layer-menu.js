import { MAX_LAYERS } from './model.js';
export function createLayerMenu(menu, onAction) {
  let layerId = null;
  const buttons = [...menu.querySelectorAll('button')];
  function close() { menu.hidden = true; }
  function open(layer, count, x, y, maxLayers = MAX_LAYERS) {
    layerId = layer.id; menu.querySelector('[data-layer-name]').textContent = layer.name;
    for (const button of buttons) {
      if (button.dataset.opacity !== undefined) { const active = Number(button.dataset.opacity) === (layer.opacity ?? 1); button.setAttribute('aria-checked', active); button.classList.toggle('active', active); }
      if (button.dataset.layerAction === 'duplicate') { button.disabled = count >= maxLayers; button.title = maxLayers === 6 && count >= maxLayers ? 'Free supports 6 layers. The desktop app supports 12.' : ''; }
      if (button.dataset.layerAction === 'delete') button.disabled = count <= 1;
    }
    menu.hidden = false;
    menu.style.left = `${Math.max(8, Math.min(innerWidth - menu.offsetWidth - 8, x))}px`;
    menu.style.top = `${Math.max(8, Math.min(innerHeight - menu.offsetHeight - 8, y))}px`;
    (buttons.find(button => button.getAttribute('aria-checked') === 'true') || buttons[0]).focus();
  }
  for (const button of buttons) button.onclick = () => { const id = layerId; close(); onAction(button.dataset.opacity !== undefined ? 'opacity' : button.dataset.layerAction, id, Number(button.dataset.opacity)); };
  document.addEventListener('pointerdown', event => { if (!menu.contains(event.target)) close(); });
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    else if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      const items = buttons.filter(button => !button.disabled), current = items.indexOf(document.activeElement);
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1) + items.length) % items.length;
      items[index].focus();
    } else if (event.key === 'Tab') close();
  });
  window.addEventListener('resize', close); window.addEventListener('blur', close);
  return { open, close, get isOpen() { return !menu.hidden; } };
}
