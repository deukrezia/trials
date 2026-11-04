# Trials — VTT Battlemap Maker

A manual tile-based VTT battlemap editor with a pixel fantasy interface. No AI-generated images. Diagonal autotiling is deferred.

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
| PNG export | Faded pixel-font “Made using Trials Battlemap Maker” | No watermark |
| Print PDF | Physical grid sizes and pagination | Same |
| Ads | Configurable small sponsor space | None |

Buying/downloading the desktop app removes Free upload restrictions and allows 12 layers. General memory, file-size and output limits still apply. Existing projects above Free's layer cap remain viewable, saveable and exportable; content editing is blocked until the user explicitly reduces their layers. Extra library assets are retained for desktop use, never automatically deleted.

## Tilesets

Default Tiles uses the supplied `Default Tiles.png`: 16×16 setup, 38 visible tiles grouped by similar artwork (water, ground, walls, edges, stonework, furnishings and fire). Fully transparent cells are skipped, including uploaded sheets; partial transparency is retained. Originals are not modified. Kenney Scribble Dungeons and Tiny Dungeon are optional through **Manage tilesets → Add Kenney Tilesets**. Select either set and use **Remove tileset** to remove it from the library while preserving placed artwork; it can be added again later. Kenney credit appears beside its Add action. Help contains **Made by Lazarus**; the bottom-right support link is https://ko-fi.com/lazarus_.

Drag palette tiles before/after others in the same tileset to arrange them. Alt+Left/Right moves one place; Alt+Up/Down moves three. Order is saved in the shared library, retained across projects/restarts and included in library backups. Organizing does not alter source images, placement IDs or map cells. The Free edition badge opens a comparison dialog; capacity indicators and contextual limit links replace the old explanatory paragraph.

The library is shared by every project in the same browser profile/origin or desktop installation. Create a tileset once, then append source images through **Import tiles**. Rename, remove individual imports, or delete a custom set in the same manager. Removing library art preserves its existing map placements. Use library backup/import to transfer the library between devices, browsers or web and desktop; there is no cloud synchronization. Opening portable map files adopts their sets without resurrecting explicitly deleted library entries. Saved maps continue to embed artwork for portability. Clearing browser/app data removes local storage, so keep backups.

For future defaults, add the original image and a descriptor in `assets/defaults/tilesets.json`, then run `npm.cmd run assets`. IDs must remain stable after release. No editor code change is needed. Default artwork attribution is optional per the owner's instruction; metadata supports future authors/licenses.

## Editing and export

Select is the first tool. Paint, Erase, Fill, Shape and Pick tile follow. Space/middle drag pans; scroll zooms. Right-click Shape for geometry options. Right-click layers for opacity, duplicate or delete; drag layers to reorder, topmost first. Ctrl/Cmd-click layers selects a group; Shift selects a range. Canvas selections move/delete/rotate/flip across those editable layers in one undo step. Choosing a palette tile resets brush transforms.

**Move map (M)** drags all layer contents inside the fixed map; overflowing moves confirm before cropping. Map Settings changes dimensions/background. Dimensions appear beside Map Settings. PNG and Print PDF have separate dialogs, with grid lines on by default. The Free watermark appears only in PNG output, never on the editor canvas or PDF.

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

Configure `config/distribution.json` before distribution: Gumroad URL and optional HTTPS sponsor image/link. Missing ad configuration collapses the slot. A purchase/download link stays hidden until its URL exists. No ad-provider script or purchasing/license verification is integrated. Web edition limits are client-side product behavior, not tamper-proof DRM.

The Pages workflow in `.github/workflows/pages.yml` automatically tests, builds and deploys Free when completed changes are pushed to `main` or `master`. Pages must be enabled with **GitHub Actions** as its publishing source once for the connected repository. `AGENTS.md` records the owner's instruction to publish completed requested changes from this project and verify the live deployment. GitHub account connection and initial repository setup are still required; no public deployment has occurred yet. The local preview at http://127.0.0.1:4173/ is separate and needs its server running.

GitHub's Pages policies need checking before an ad-supported commercial launch: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits . A different static host can serve the same web output. Build paths are relative for repository-subpath hosting. No Gumroad upload has occurred.

Tests use separate headless Edge profiles or a hidden Electron test window and do not operate the user's desktop. Node checks cover editing, shared libraries, policy, catalog bounds and alpha handling. Browser checks cover editing tools, history, selection, layers, crisp rendering, persistence, crop/limits and Free-only PNG watermark. Diagnostic exports/screenshots are in ignored `.test-output`.

## Bundled licenses

Kenney credits/licenses are beside each optional pack. Tiny5 is bundled locally under SIL OFL 1.1 (`assets/fonts/Tiny5-LICENSE`). jsPDF's license is in `assets/vendor/jspdf-LICENSE.txt`. The software source is currently UNLICENSED; no open-source software license has been selected. Existing storage names and file formats retain their original identifiers to preserve old projects.
