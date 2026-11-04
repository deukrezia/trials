export async function addFreePNGWatermark(canvas, pixelsPerCell) {
  await document.fonts.load('12px "Tiny5"');
  const context = canvas.getContext('2d'), text = 'Made using Trials Battlemap Maker', padding = Math.max(2, Math.min(12, Math.round(pixelsPerCell * .12)));
  let size = Math.max(6, Math.min(18, Math.round(pixelsPerCell * .2)));
  context.save(); context.font = `${size}px "Tiny5", monospace`;
  if (context.measureText(text).width > canvas.width - padding * 2) { size = Math.max(1, Math.floor(size * (canvas.width - padding * 2) / context.measureText(text).width)); context.font = `${size}px "Tiny5", monospace`; }
  context.globalAlpha = .35; context.textAlign = 'right'; context.textBaseline = 'bottom'; context.fillStyle = '#fff4d4';
  context.shadowColor = '#171020'; context.shadowBlur = 0; context.shadowOffsetX = 1; context.shadowOffsetY = 1;
  context.fillText(text, canvas.width - padding, canvas.height - padding); context.restore();
}
