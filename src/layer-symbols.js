// Only the two state controls use symbols, on a consistent 16px pixel grid.
export function layerSymbol(kind, enabled) {
  const node = document.createElement('span'); node.className = 'layer-symbol'; node.setAttribute('aria-hidden', 'true');
  let shape;
  if (kind === 'lock') shape = enabled
    ? '<path fill-rule="evenodd" d="M5 1h6v2h2v5h2v7H1V8h2V3h2zM5 4v4h6V4zM7 10v3h2v-3z"/>'
    : '<path fill-rule="evenodd" d="M1 8h14v7H1zM7 10v3h2v-3z"/><path d="M7 1h6v2h2v3h-2V4H9v4H7z"/>';
  else shape = '<path fill-rule="evenodd" d="M5 3h6v1h2v2h2v1h1v2h-1v1h-2v2h-2v1H5v-1H3v-2H1V9H0V7h1V6h2V4h2zM5 5v1H3v1H2v2h1v1h2v1h6v-1h2V9h1V7h-1V6h-2V5z"/><path d="M6 6h4v4H6z"/>' + (enabled ? '' : '<path d="M1 0h2v2h2v2h2v2h2v2h2v2h2v2h2v2h1v2h-3v-2h-2v-2H9v-2H7V8H5V6H3V4H1z"/>');
  node.innerHTML = `<svg viewBox="0 0 16 16" fill="currentColor" shape-rendering="crispEdges">${shape}</svg>`;
  return node;
}
