# Default tile artwork brief

Working proposal for human-created default artwork. No AI-generated images.

## Start small

Begin with one stone floor and one stone wall style. Validate connection shapes before producing multiple themed packs. Add grass/dirt, wood, water, doors, and props after the wall template is established.

Suggested working scale: 64 × 64 pixels per logical map cell, with 32 × 32 quarter pieces when using modular artwork. This is a proposal, not an engine restriction: users should be able to import other tile sizes. Choose a consistent size for the first pack. Use transparent PNG for pieces that overlay other terrain.

Keep texture, wall edges, and decorative props separate when possible. Avoid baking a grid, ambient lighting, or long cast shadows into the terrain artwork. This makes brush rotation, recoloring, and editor lighting easier to support.

## First art pass

| Asset | First pass | Notes |
|---|---|---|
| Stone floor | One seamless tile, then 2–3 optional variants | Repeated edges must match |
| Wall fill | One seamless surface | Used within occupied regions |
| Straight wall boundaries | All four orientations | Keep thickness and edge alignment consistent |
| Convex outside corners | All four orientations | Outside of an occupied region |
| Concave inside corners | All four orientations | Notches and enclosed holes |
| Isolated wall and narrow ends | Isolated shape plus four end orientations | Prevent broken one-cell features |
| Diagonal boundaries | Both diagonal directions and occupied sides | These need authored silhouettes, not merely rotated square tiles |
| Slope joins and peaks | Reserve space until shape templates are approved | Must handle diagonal-only contact and slope-to-straight connections |

This is a shape inventory, not a final sprite-sheet layout or complete numbered template. Do not draw 47 full tiles or assign arbitrary positions yet. The technical approach can support full-tile and modular packs, and the final template should make the required roles unambiguous.

If you are starting artwork immediately, the seamless floor, wall surface, and straight boundaries are the safest pieces to begin with. Keep source layers editable so they can be fitted to the final corner and slope templates.

## Two supported authoring options

**Full tiles:** Supply a complete standard 47-shape blob set for ordinary cell terrain. This is predictable and works well with many existing tilesets. Sloped/diagonal connections need additional explicit rules or a separate corner-terrain mode. A 47-shape set by itself does not handle every diagonal-only connection.

**Modular pieces:** Supply quarter pieces for each orientation and connection role, plus full-cell overrides for special joins. This reduces repeated drawing. The exact quarter-piece template must be designed and validated before treating it as the default authoring contract.

A 16-case corner-terrain set is another import mode, with different logical placement from a cell-based 47-shape set. Its two opposite-corner cases need an agreed bridge/separation policy.

## Later default content

- Ground: stone, dirt, grass, sand, wooden floor.
- Walls: square masonry, diagonal masonry, rough cavern.
- Water: surface and boundary artwork, with inner/outer corners.
- Openings: horizontal/vertical doors and windows; later diagonal openings if supported.
- Stairs: four directions.
- Props: table, chair, bed, crate, barrel, rock, tree, bush.

Use the same brush-pack format for all shipped and user-created content. Store author and license information alongside each pack. Visual style is still open; the connection system must work with pixel art or higher-resolution painted artwork.

Technical findings and unresolved reference behavior are recorded in [autotiling-research.md](autotiling-research.md).
