# UI cleanup

Applied on 2026-11-02 after review of the entire visible editor and its dialogs.

| Finding | Change |
|---|---|
| Pack cards and dropdown select the same thing | Keep one tileset dropdown, including custom packs and All tilesets |
| Kenney name repeated in pack names, labels, and a persistent credit | Short pack names; credit once in Help, full licenses retained in assets |
| Selected pack repeated above palette and under preview | The selector is the sole pack label |
| Map name repeated in header and canvas overlay | One editable name in the header |
| Dimensions repeated in overlay and settings | One header dimension readout |
| Map layers counter, layer numbers, and bottom layer count | Remove all three |
| Selected layer repeated in toolbar and footer | Selection appears on its layer row only |
| Selected tool repeated in footer | Selection appears on its tool button only |
| Arrow/cursor selection ornaments in addition to highlights | Remove arrows and selected-tile corner marker |
| Tile slot numbers change when filtering and are not asset IDs | Remove misleading numbers |
| Brush size slider, size readout, and size shortcuts | Remove; paint one cell, use rectangle/fill for areas |
| FREE/LOCK text is an awkward state control | Use pixel open/closed lock symbols, accessible labels, and tooltips |
| ON/OFF visibility text | Use pixel eye symbols with accessible labels and tooltips |
| Decorative frame corner studs | Remove |
| YOUR INVENTORY, CHOOSE YOUR TILESET, CURRENT ADVENTURE, EDIT MODE, SELECT COMMAND | Remove filler headings |
| Layer instructions and inspirational tagline permanently occupy space | Remove; keep instructions in Help |
| CLICK TO EQUIP and selected tile name repeated at palette footer | Remove; native tile-name tooltips and preview remain |
| Tile category, source pixel size, and pack label crowd preview | Remove preview metadata; preserve tile name, preview, rotation, and flip |
| Hardcoded 64px export information outside export dialog | Remove; export dimensions remain in export dialog |
| Selected custom pack export is buried in Help | Move to library, show only when a custom pack is selected |
| Routine success notifications obscure the canvas after save, export, new map, and pick | Remove those toasts; retain errors and import/load confirmations |
| Coordinates mixed with another layer readout | Show coordinates alone |

Pixel styling is retained. Painting, rectangle/fill, rotation/flip, layers, pack mixing/import/export, map files, and PNG export remain available. The headless integration flow checks the cleaned UI as well as the editing and file flows, without controlling user windows.
