# Trials — VTT Battlemap Maker

A manual tile-based VTT battlemap editor with a pixel fantasy interface. No AI-generated images. Diagonal autotiling is deferred.

**[Open Trials online](https://deukrezia.github.io/trials/)** · [GitHub source](https://github.com/deukrezia/trials)

## Run locally

Run **Start Trials.cmd**, or `npm.cmd start` and open http://127.0.0.1:4173. Node.js 20+ is required for local development. Fonts, tiles and the PDF library are bundled; the desktop build works offline. The old Start Map Maker launcher remains compatible.

## Editions

| Feature | Free web | Paid desktop |
|---|---|---|
| Layers | 6 | 12 |
| Custom tilesets | 2 | Up to 64 (technical limit) |
| Source image imports per custom tileset | 2 | No edition cap |
| Import image bounds | Top-left 160×160 pixels; excess cropped | Up to 8192 px per side |
| Tile setup | 16×16 or 32×32 | Configurable sheet sizes or individual images |
| PNG / JPEG export | Faded pixel-font “Made using Trials Battlemap Maker” | No watermark |
| Print PDF | Physical grid sizes and pagination | Same |
| Ads | Configurable small sponsor space | None |

Buying/downloading the desktop app removes Free upload restrictions and allows 12 layers. General memory, file-size and output limits still apply. Existing projects above Free's layer cap remain viewable, saveable and exportable; content editing is blocked until the user explicitly reduces their layers. Extra library assets are retained for desktop use, never automatically deleted.

## Tilesets

There is one Default Tiles collection. It combines both unchanged source images on a 16×16 base grid: 86 visible brushes in total, including the second image’s four PT cells as one 2×2 Tree prop. The second source follows the owner’s exact category grid. Old individual tree-quarter IDs remain available only for rendering existing maps. Empty cells are omitted.

Default Tiles uses the supplied `Default Tiles.png`: 16×16 setup, 38 visible tiles grouped by similar artwork (water, ground, walls, edges, stonework, furnishings and fire). Fully transparent cells are skipped, including uploaded sheets; partial transparency is retained. Originals are not modified. Open **Manage tilesets → Free Tilesets → Kenney**, then use **+** beside Scribble or Tiny Dungeon. An installed pack shows **×** in the same place. Removing it preserves placed map artwork, and it can be added again later. The Kenney heading links to its site; a CC0 disclaimer appears below these actions. Help contains **Made by Lazarus**; the bottom-right support link is https://ko-fi.com/lazarus_.

Kenney imports use individual +/× actions. There is no dropdown, editable description field, checkbox selection, or bulk Add action. Deleting a pack asks for confirmation. Browsing tabs in the tileset manager leaves the editor's chosen tileset and brush in place. Layers have **Rename layer** in their right-click menu, with Undo/Redo and saved-map persistence. Earlier description metadata is retained in saved data for compatibility, without an editor UI.

Drag palette tiles before/after others in the same tileset to arrange them. Alt+Left/Right moves one place; Alt+Up/Down moves three. Order is saved in the shared library, retained across projects/restarts and included in library backups. Organizing does not alter source images, placement IDs or map cells. The Free edition badge opens a comparison dialog; capacity indicators and contextual limit links replace the old explanatory paragraph.

The library is shared by every project in the same browser profile/origin or desktop installation. Create a tileset once, then append source images through **Import tiles**. Rename, remove individual imports, or delete a custom set in the same manager. Removing library art preserves its existing map placements. Use library backup/import to transfer the library between devices, browsers or web and desktop; there is no cloud synchronization. Opening portable map files adopts their sets without resurrecting explicitly deleted library entries. Saved maps continue to embed artwork for portability. Clearing browser/app data removes local storage, so keep backups.

For future defaults, add the original image and a descriptor in `assets/defaults/tilesets.json` with `packId: "default-tiles"` to extend the same collection, then run `npm.cmd run assets`. A `categoryGrid` can classify atlas cells left-to-right/top-to-bottom with F (Floors), W (Walls), P (Props) and - (excluded); the owner’s current grid gives 21 Floors, 10 Walls and 7 Props. IDs must remain stable after release. No editor code change is needed. Default artwork attribution is optional per the owner's instruction; metadata supports future authors/licenses.

## Editing and export

Select is the first tool. Paint, Erase, Fill, Shape and Pick tile follow. Space/middle drag pans; scroll zooms. Right-click Shape for geometry options. Right-click layers for opacity, duplicate or delete; drag layers to reorder, topmost first. Ctrl/Cmd-click layers selects a group; Shift selects a range. Canvas selections move/delete/rotate/flip across those editable layers in one undo step. Choosing a palette tile resets brush transforms.

**Move map (M)** drags all layer contents inside the fixed map; overflowing moves confirm before cropping. Map Settings changes dimensions/background. Dimensions appear beside Map Settings. Image export (PNG/JPEG) and Print PDF have separate dialogs, with grid lines on by default. The Free watermark appears in PNG and JPEG output, never on the editor canvas or PDF.

PNG supports 8–512 pixels per cell, up to 8192 px per side and 36 megapixels. Print PDF preserves physical cell sizes with A4/Letter paper, orientation, half-inch margins and pagination (up to 100 pages). Print at **Actual size / 100%**; printer-driver scaling is outside the app's control. PDF geometry has been independently checked with `tests/verify_print.py`; no physical printer has been calibrated.

## Build and distribution

```powershell
npm.cmd ci
npm.cmd run assets
npm.cmd test
npm.cmd run test:browser
npm.cmd run build:web
npm.cmd run make:desktop
npm.cmd run test:desktop
```

Web output: `dist/web`. Windows portable ZIP: `out/make/zip/win32/x64/Trials-win32-x64-0.2.0.zip`. Extract the entire ZIP and run Trials.exe; the executable needs its companion files. The Electron build uses sandboxed local content, persistent device storage and a themed draggable title bar with pixel window controls. The title bar uses a restricted preload bridge for minimize, maximize/restore and close. The desktop package is currently unsigned.

`config/distribution.json` configures the Gumroad URL and advertising. The Free web build reserves a full-panel-width, 150px-high display-ad placement above Ko-fi; desktop has no advertising. AdSense publisher `ca-pub-9733707597960049` and unit `3946508423` are configured from the owner's supplied code. The web build includes the verification script and account meta tag; the manual display unit is requested only when its placement becomes visible. Local HTTP previews and the desktop app do not request real ads. Test traffic intercepts the ad script and never serves an impression. Ad blockers, account/site approval and ad inventory can leave the placement empty. Keep Auto ads disabled in the AdSense account to keep advertising confined to the manual placement. Google account review and regional consent-message setup are managed in AdSense. No approval, revenue or fill rate is claimed.

The domain root and `ads.txt` are published from `deukrezia/deukrezia.github.io`, mirrored in `hosting/github-root`; the app remains at `/trials/`. For direct sponsors, select a different ad provider and set an HTTPS image/link. A purchase/download link stays hidden until its URL exists. No purchasing/license verification is integrated. Web edition limits are client-side product behavior, not tamper-proof DRM.

The source repository is `deukrezia/trials`, connected as this project's `origin` on branch `main`. The Pages workflow in `.github/workflows/pages.yml` automatically tests, builds and deploys Free when completed changes are pushed to `main` or `master`. Pages uses **GitHub Actions** as its publishing source. `AGENTS.md` records the owner's instruction to publish completed requested changes from this project and verify the live deployment. The local preview at http://127.0.0.1:4173/ is separate and needs its server running; the GitHub Pages site does not depend on this computer staying on.

Browser storage is scoped to the site address: existing local maps and tileset libraries remain at the local preview address. Save a map and use **Back up library** there, then open/import those backups on the public site to transfer them. No local map or personal library backups are published to the repository.

GitHub's Pages policies need checking before an ad-supported commercial launch: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits . A different static host can serve the same web output. Build paths are relative for repository-subpath hosting. No Gumroad upload has occurred.

Tests use separate headless Edge profiles or a hidden Electron test window and do not operate the user's desktop. Node checks cover editing, shared libraries, policy, catalog bounds and alpha handling. Browser checks cover editing tools, history, selection, layers, crisp rendering, persistence, crop/limits and Free-only PNG watermark. Diagnostic exports/screenshots are in ignored `.test-output`.

## Bundled licenses

Kenney credits/licenses are beside each optional pack. Silkscreen is bundled locally under SIL OFL 1.1 (`assets/fonts/Silkscreen-LICENSE`). jsPDF's license is in `assets/vendor/jspdf-LICENSE.txt`. The software source is currently UNLICENSED; no open-source software license has been selected. Existing storage names and file formats retain their original identifiers to preserve old projects.

Large tiles: drag across the import preview to group a rectangular area into one asset. A 3×3 area of 16px cells becomes one 48×48 brush covering nine map cells. Clicking a marked area ungroups it. Large assets remain linked for selection, transforms and erasing; incomplete stamps at map edges are skipped. Ctrl/Cmd-click or Shift-click palette tiles to select a group, then drag to reorder.

With Shape active, right-click the map to set width and height in cells and preview the shape centered on that cell. Place commits one undoable action; Cancel/Escape leaves the map unchanged. Right-click the Shape button to choose geometry or outline.

Selection clipboard: Ctrl/Cmd+C copies, X cuts, V previews a paste (click to place; Escape cancels), and D duplicates into nearby free space or opens placement if none fits. Clipboard edits respect selected visible/unlocked layers, preserve linked large assets and transforms, and are undoable. Copied custom art remains available for pasting across projects in the same session, even after library removal. Copy, Duplicate and Zoom to selection appear with the existing selection actions.

In Manage tilesets, use Edit on an import to regroup its source cells after importing. Save regions changes the shared palette without consuming another import slot; old definitions used on maps remain embedded.

Export offers PNG or JPEG. JPEG uses the map background, has a 50–100% quality control and shows the encoded file size. PNG keeps optional transparency. Free image exports carry the existing faded watermark; paid image exports do not. WebP export is not included.

Map settings → Recovery snapshots keeps local automatic checkpoints (at most once every two minutes when edits autosave), manual snapshots and a checkpoint before switching/restoring. Up to 12 snapshots per map are retained within a shared 96 MB / 48-entry budget. Restore saves the current state first. This is local recovery, separate from file backups; clearing browser/app storage removes it. No recent-maps screen is included.

Default source descriptors can define `regions` with stable IDs and `[x, y, width, height]` cell bounds. Region brushes retain the original grid footprint; their earlier individual cell IDs stay hidden and renderable for saved-map compatibility. Existing palette orders from separate default sources migrate into the unified collection.
