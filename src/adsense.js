// A manual display unit only. No request is made without real configuration,
// on local previews, or while the placement is hidden/offscreen.
export function prepareAdSense(slot, ad, height) {
  if (!/^ca-pub-\d{16}$/.test(ad.publisherId || '') || !/^\d{1,20}$/.test(ad.slotId || '') || location.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return;
  const unit = document.createElement('ins'); unit.className = 'adsbygoogle';
  unit.style.cssText = `display:block;width:100%;height:${height}px`;
  unit.dataset.adClient = ad.publisherId; unit.dataset.adSlot = ad.slotId;
  slot.querySelector('.ad-frame').replaceChildren(unit); slot.dataset.state = 'ready'; slot.hidden = false;
  const status = new MutationObserver(() => {
    const value = unit.getAttribute('data-ad-status');
    if (['filled', 'unfilled'].includes(value)) { slot.dataset.state = value; status.disconnect(); }
  });
  status.observe(unit, { attributes: true, attributeFilter: ['data-ad-status'] });
  const visible = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    visible.disconnect(); slot.dataset.state = 'loading';
    const requestUnit = () => { try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch { slot.dataset.state = 'unavailable'; status.disconnect(); } };
    if (document.querySelector('script[data-trials-adsense]')) { requestUnit(); return; }
    const script = document.createElement('script'); script.async = true; script.crossOrigin = 'anonymous';
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ad.publisherId}`;
    script.onload = requestUnit;
    script.onerror = () => { slot.dataset.state = 'unavailable'; status.disconnect(); };
    document.head.append(script);
  }, { threshold: .1 });
  visible.observe(unit);
}
