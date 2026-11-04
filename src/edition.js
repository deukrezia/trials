export async function configureEdition() {
  const response = await fetch('assets/edition.json');
  if (!response.ok) return { edition: 'web' };
  const config = await response.json(), slot = document.getElementById('sponsor-slot');
  document.documentElement.dataset.edition = config.edition === 'desktop' ? 'desktop' : 'web';
  if (config.edition === 'web' && config.gumroadUrl) {
    try { const url = new URL(config.gumroadUrl); if (url.protocol === 'https:') { const link = document.getElementById('desktop-download'); link.href = url.href; link.hidden = false; } } catch {}
  }
  if (config.edition !== 'web' || !config.ad?.enabled || !config.ad.imageUrl || !config.ad.targetUrl) return config;
  const imageUrl = new URL(config.ad.imageUrl, document.baseURI), targetUrl = new URL(config.ad.targetUrl);
  if ((imageUrl.origin !== location.origin && imageUrl.protocol !== 'https:') || targetUrl.protocol !== 'https:') return config;
  const link = slot.querySelector('a'), image = slot.querySelector('img');
  link.href = targetUrl.href; image.alt = config.ad.alt || 'Sponsor'; image.onload = () => { slot.hidden = false; }; image.onerror = () => { slot.hidden = true; }; image.src = imageUrl.href;
  return config;
}
