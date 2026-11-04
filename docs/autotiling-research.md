# Connecting tiles and diagonal walls

Research date: 2026-11-02. Status: design research, before application implementation.

## Product requirements

- A tabletop map editor with the drawing convenience of RPG Map II.
- A usable default tileset, plus user-imported tilesets that become reusable brushes.
- Connected terrain and walls update automatically during painting and erasing.
- Support diagonal silhouettes and connections, including diagonal-only contact.
- No AI-generated images. Default and sample artwork must follow this constraint.
- Background file/research work only; do not use desktop controls without a new user request authorizing them.

## Evidence from the installed RPG Map II

Examined files under `C:/Users/HOME/Downloads/tabletop-rpg-map-editor-win-directx64/rpgmap` without modifying them.

The installation contains a compiled HashLink program and embedded resources in `hlboot.dat`. The saved map separates collisions, grounds, pools, objects, icons, lights, labels, and skin settings. The inspected cached map is 40 by 40 cells and uses map-format version 10. That is distinct from the bundled application changelog, which goes through release 16.2.

Embedded names include `CollisionSkin`, `Classic`, `Cavern`, and `Slope`; `renderWalls`; and draft shapes named `draftWallFull`, `draftWallSlope`, `draftWallSlopeSingle`, and `draftWallSlopePeak`. These are evidence of separate wall styles and special slope cases, not proof of the precise neighbor tests used to select them.

The embedded atlas text contains the following wall entries:

| Style | Families a/b/c/d | Family s | Total named entries |
|---|---|---|---|
| Classic | Five 16 × 16 entries per family | Four 32 × 32 entries | 24 |
| Cavern | Five 16 × 16 entries per family | Four 32 × 32 entries | 24 |
| Slope | Six 16 × 16 entries per family | Four 32 × 32 entries | 28 |

These counts describe atlas entries, not necessarily distinct images; some entries share atlas coordinates. They strongly suggest quarter-sized pieces plus full-sized special cases. The orientation of a/b/c/d and the meaning of each numbered variant remain unverified. Do not assign artwork roles from these names alone.

The public source repository linked by the author is the original Flash-based ANA Map/RPG Map 1. It is not the source of RPG Map II. The author explicitly distinguishes the versions: https://github.com/deepnight/anamap

The installed bytecode and atlas names have not been fully decoded into RPG Map II's exact wall-selection logic. This research establishes an implementable approach and its limits, not exact behavioral parity.

## Three related algorithms with different jobs

### 1. Cell-based blob terrain

Use this for floors, water boundaries, grass, and ordinary filled wall regions. The center cell stores its terrain identity; the renderer reads its eight neighbors.

Use this bit convention in our own format:

```text
NW=128  N=1  NE=2
W=64     C   E=4
SW=32   S=16 SE=8
```

A side bit is set if the neighbor is compatible terrain. A diagonal bit counts only if both adjacent side bits are also set. For example, NE counts only if N and E also match.

Enumerating all 256 raw neighborhoods under that rule gives 47 canonical masks. Independent enumeration during this research confirmed 47 masks and 15 equivalence classes under 90-degree rotations. An empty center is a separate empty output; mask 0 represents an occupied center with no effective neighbors.

Examples:

- NE alone: normalized mask 0. No diagonal bridge is created.
- N and E, with NE empty: mask 5. The northeast concave corner must be represented.
- N, E, and NE: mask 7. That concave notch is filled.

This explains a common trap: diagonal-aware blob terrain does not automatically create a slanted bridge between two isolated cells touching at a corner.

### 2. Corner-based terrain / marching squares

Store a binary terrain value at each grid vertex, then select each rendered tile from its four corner values. Four binary corners produce 16 masks.

This naturally supports diagonal boundaries with a small authored set. It changes the editing/data model: input edits vertex values rather than directly assigning each rendered cell a terrain value. A dual-grid approach can expose cell-like painting while keeping this distinction internally.

Opposite occupied corners create two ambiguous configurations. Choose a policy explicitly: separate islands or a connected bridge. The rendered shape and the geometry used for lighting must agree. Merely choosing a diagonal-looking sprite is insufficient.

This is a proposed option for our editor, not a claim that RPG Map II uses marching squares.

### 3. Explicit slope rules and modular wall pieces

For editable cells with square/cavern/slope modes, use a neighborhood rule resolver capable of preserving diagonal-only information. Each rule declares required, forbidden, and ignored neighbor states, plus the output pieces and geometry.

Prioritize specific slope junctions, isolated shapes, and peaks before generic edges and full fills. Use an explicit priority number and stable rule ID as the tie-breaker. Allow manual shape overrides for cases where the user wants different connectivity from the automatic default.

The renderer may compose four quarter pieces for common shapes and use a full-cell tile for an exceptional shape. This reduces repeated artwork while leaving room for custom diagonal joins. A complete 47-tile sheet should also be supported so users need not use our modular template.

## Proposed brush pipeline

1. A stroke changes logical terrain/wall cells, not the final rendered sprite IDs.
2. For each affected cell, read terrain compatibility, wall style, and any explicit shape override.
3. Resolve the selected brush's rule mode: single tile, variants, blob, corner terrain, or explicit neighborhood rules.
4. Return sprite pieces and logical geometry from the same resolved shape.
5. Choose decorative variants using a stable hash of map seed, cell coordinates, brush ID, and shape ID. Repainting elsewhere must not reshuffle existing tiles.
6. Refresh the edited cells plus their rule dependency radius. A 3 × 3 rule needs one cell of expansion; larger patterns need a larger radius.
7. Batch geometry and lighting updates after changes; record the whole stroke as one undo operation.

For rectangular strokes, expand the entire edited rectangle by the dependency radius. For changes at map edges, use a documented out-of-bounds policy. Selection movement, erase, fill, undo, and redo must all use the same resolver.

Lighting should use the resolved wall geometry. A slanted image with square light-blocking geometry produces incorrect shadows. For a VTT image exporter this geometry supports rendering; exporting VTT-native walls is a separate feature.

## What a brush pack needs

- Stable pack, brush, terrain, shape, and tile identifiers; schema version.
- Atlas images, tile size, spacing, margins, and piece source rectangles.
- Brush mode and compatibility/connectivity groups.
- Shape mappings or neighborhood rules, priorities, and missing-case fallback.
- Permitted rotations/flips. Disable transformations that would rotate baked highlights or shadows incorrectly.
- Optional weighted artwork variants with stable selection.
- Draw layer, anchor, footprint, and light-blocking behavior.
- Author, attribution, license information, and declared asset provenance.

The default pack must use the same importable format as custom packs. It should not depend on special behavior unavailable to user packs. Keep logical terrain identity distinct from artwork so compatible skins can be exchanged later.

## Required behavior checks before claiming parity

- Isolated cell; horizontal and vertical strips; ends; L/T/cross junctions.
- Solid regions, outside corners, inside corners, holes, and one-cell channels.
- Diagonal-only pairs in both directions, diagonal chains, sharp peaks, and slope-to-square joins.
- Both opposite-corner ambiguity cases and their selected connectivity policies.
- Cavern-to-slope and mixed terrain boundaries with explicit compatibility rules.
- Water/floor under diagonal wall edges; consistent outlines and shadows.
- All 256 neighborhoods for a binary 3 × 3 rule, including map-edge cases.
- Deterministic results regardless of stroke order for identical logical maps.
- Neighbor refresh after erase, fill, move, undo, and redo.
- Missing artwork detected during pack validation, rather than silently selecting an unrelated tile.

## References

- RPG Map features: https://deepnight.net/tools/rpg-map/
- RPG Map release notes, including diagonal rendering and lighting changes: https://deepnight.net/tools/rpg-map/changelog/
- Original ANA Map source and version distinction: https://github.com/deepnight/anamap
- Tiled terrain sets: corner/edge/mixed modes, 16/47/256 cases, transformations, neighbor updates: https://doc.mapeditor.org/en/latest/manual/terrain/
- LDtk logical grids and auto-layer pattern rules: https://ldtk.io/docs/general/auto-layers/
- Sylves author documentation on corner-based marching squares: https://www.boristhebrave.com/docs/sylves/1/articles/tutorials/marching_squares.html

## Remaining uncertainty

Exact RPG Map II rule ordering, a/b/c/d orientations, numbered-piece meanings, and shape/lighting polygon selection remain unverified. The reference application's launch did not yield a targetable window during an earlier attempt; desktop inspection was discontinued at the user's request. No further desktop inspection is required to implement the proposed architecture. Exact parity should be checked later using user-provided reference maps/images or a separately authorized test session.
