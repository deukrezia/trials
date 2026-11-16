export function cellWithQuarters(base, quarters) {
  if (!quarters?.some(Boolean)) return base;
  return { ...base, quarters };
}

export function cellBase(cell) {
  if (!cell?.tile) return null;
  if (!cell.quarters) return cell;
  const { quarters, ...base } = cell;
  return base;
}

export function* cellPlacements(cell) {
  if (cell?.tile) yield cell;
  if (cell?.quarters) for (const tile of cell.quarters) if (tile) yield tile;
}

export function quarterIndex(x, y) {
  return (x & 1) + 2 * (y & 1);
}
