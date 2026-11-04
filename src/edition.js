import { prepareAdSense } from './adsense.js';

export async function configureEdition() {
  const response = await fetch('assets/edition.json');
  if (!response.ok) return { edition: 'web' };
  const config = await response.json(), slot = document.getElementById('sponsor-slot');
  document.documentElement.dataset.edition = config.edition === 'desktop' ? 'desktop' : 'web';
  if (config.edition === 'web' && config.gumroadUrl) {
    try { const url = new URL(config.gumroadUrl); if (url.protocol === 'https:') { const link = document.getElementById('desktop-download'); link.href = url.href; link.hidden = false; } } catch {}
  }
  if (config.edition !== 'web' || !config.ad?.enabled) return config;
  slot.dataset.state = 'empty'; slot.hidden = !config.ad.reserveSpace;
  const width = Math.max(120, Math.min(200, Number(config.ad.width) || 180)), height = Math.max(50, Math.min(150, Number(config.ad.height) || 150));
  slot.style.setProperty('--ad-width', `${width}px`); slot.style.setProperty('--ad-height', `${height}px`);
  if (config.ad.provider === 'adsense') { prepareAdSense(slot, config.ad, width, height); return config; }
  if (!config.ad.imageUrl || !config.ad.targetUrl) return config;
  const imageUrl = new URL(config.ad.imageUrl, document.baseURI), targetUrl = new URL(config.ad.targetUrl);
  if ((imageUrl.origin !== location.origin && imageUrl.protocol !== 'https:') || targetUrl.protocol !== 'https:') return config;
  const link = slot.querySelector('a'), image = slot.querySelector('img');
  link.href = targetUrl.href; image.alt = config.ad.alt || 'Sponsor';
  image.onload = () => { link.hidden = false; slot.dataset.state = 'filled'; slot.hidden = false; };
  image.onerror = () => { link.hidden = true; slot.dataset.state = 'empty'; slot.hidden = !config.ad.reserveSpace; }; image.src = imageUrl.href;
  return config;
}
