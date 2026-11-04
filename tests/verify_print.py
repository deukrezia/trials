"""Independently inspect generated PDF page units, image placement and grid vectors.

Requires pypdf; this is a development check, not an application dependency.
"""
import argparse
from pypdf import PdfReader
from pypdf.generic import ContentStream

parser = argparse.ArgumentParser()
parser.add_argument('path')
parser.add_argument('--cell-inches', type=float, default=1)
parser.add_argument('--pages', type=int, required=True)
parser.add_argument('--paper', choices=['letter', 'a4-landscape'], required=True)
parser.add_argument('--dpi', type=int, default=100)
args = parser.parse_args()
reader = PdfReader(args.path)
assert len(reader.pages) == args.pages
paper = (612, 792) if args.paper == 'letter' else (297 / 25.4 * 72, 210 / 25.4 * 72)
step = args.cell_inches * 72
for index, page in enumerate(reader.pages):
    width, height = float(page.mediabox.width), float(page.mediabox.height)
    assert abs(width - paper[0]) < .1 and abs(height - paper[1]) < .1
    ops = ContentStream(page.get_contents(), reader).operations
    rects = [list(map(float, values)) for values, op in ops if op == b're']
    assert len(rects) == 1, (index, rects)
    x, y, w, h = rects[0]
    if w < 0:
        x += w
        w = -w
    if h < 0:
        y += h
        h = -h
    # 36 PDF points is exactly half an inch; all content stays within it.
    assert x >= 36 - .01 and y >= 36 - .01
    assert x + w <= width - 36 + .01 and y + h <= height - 36 + .01
    assert abs(w / step - round(w / step)) < 1e-6
    assert abs(h / step - round(h / step)) < 1e-6
    vertical, horizontal, current = [], [], None
    for values, op in ops:
        if op == b'm':
            current = list(map(float, values))
        elif op == b'l' and current:
            end = list(map(float, values))
            if abs(current[0] - end[0]) < .001:
                vertical.append(current[0])
            elif abs(current[1] - end[1]) < .001:
                horizontal.append(current[1])
        elif op == b'Td':
            # Footer text baseline remains above the half-inch bottom margin.
            assert float(values[1]) >= 36
    for positions, start, extent in [(vertical, x, w), (horizontal, y, h)]:
        full = sorted([start, start + extent, *positions])
        for before, after in zip(full, full[1:]):
            assert abs(after - before - step) < .001, (index, after - before, step)
    matrices = [list(map(float, values)) for values, op in ops if op == b'cm']
    assert any(abs(v[0] - w) < .001 and abs(v[3] - h) < .001 and abs(v[4] - x) < .001 and abs(v[5] - y) < .001 for v in matrices)
    names = [values[0] for values, op in ops if op == b'Do']
    assert len(names) == 1
    image = page['/Resources']['/XObject'][names[0]].get_object()
    assert abs(float(image['/Width']) / (w / 72) - args.dpi) < 1
    assert abs(float(image['/Height']) / (h / 72) - args.dpi) < 1
    assert any(abs(float(values[0]) - .5) < .001 for values, op in ops if op == b'w')
print(f'PASS: {len(reader.pages)} pages; {args.cell_inches}-inch grid = {step:g} PDF points at {args.dpi} DPI; page bounds, vector spacing, image placement and footer margins verified.')
