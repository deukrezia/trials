import { printLayout } from './model.js';

let library;
function pdfLibrary() {
  if (!library) library = new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'assets/vendor/jspdf.umd.min.js';
    script.onload = () => resolve(window.jspdf.jsPDF); script.onerror = () => { library = null; reject(new Error('The local PDF library could not be loaded.')); }; document.head.append(script);
  });
  return library;
}
export async function printPDF(map, renderRegion, progress) {
  const layout = printLayout(map), s = map.settings, pages = layout.pagesX * layout.pagesY;
  if (pages > 100) throw new Error(`This layout requires ${pages} pages. Use a smaller printed grid or larger paper (maximum 100 pages).`);
  const jsPDF = await pdfLibrary(), doc = new jsPDF({ unit: 'in', format: s.paper, orientation: s.orientation, compress: true });
  doc.setProperties({ title: map.name, subject: `Tabletop map: ${s.cellInches} inch cells, print at 100% scale` });
  let number = 0;
  for (let row = 0; row < layout.pagesY; row++) for (let col = 0; col < layout.pagesX; col++) {
    if (number++) doc.addPage();
    const x = col * layout.columns, y = row * layout.rows, width = Math.min(layout.columns, map.width - x), height = Math.min(layout.rows, map.height - y);
    const image = renderRegion(x, y, width, height, layout.pixels, { grid: false, transparent: !s.printBackground, print: true });
    doc.addImage(image, 'PNG', layout.margin, layout.margin, width * s.cellInches, height * s.cellInches, undefined, 'FAST');
    // Grid geometry is in physical PDF units, independent of raster DPI.
    if (s.printGrid) {
      doc.setDrawColor(145); doc.setLineWidth(.5 / 72);
      for (let column = 1; column < width; column++) { const xx = layout.margin + column * s.cellInches; doc.line(xx, layout.margin, xx, layout.margin + height * s.cellInches); }
      for (let rowIndex = 1; rowIndex < height; rowIndex++) { const yy = layout.margin + rowIndex * s.cellInches; doc.line(layout.margin, yy, layout.margin + width * s.cellInches, yy); }
    }
    doc.setDrawColor(150); doc.setLineWidth(.005);
    doc.rect(layout.margin, layout.margin, width * s.cellInches, height * s.cellInches);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(75);
    const label = map.name.replace(/[^\x20-\x7E]/g, '?').slice(0, 70);
    doc.text(`${label} | ${col + 1},${row + 1} | ${s.cellInches} in/cell | Print at 100% (Actual size)`, layout.margin, layout.pageHeight - layout.margin - .05);
    doc.text(`${number}/${pages}`, layout.pageWidth - layout.margin, layout.pageHeight - layout.margin - .05, { align: 'right' });
    image.width = 1; image.height = 1;
    progress?.(number, pages);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return doc.output('blob');
}
