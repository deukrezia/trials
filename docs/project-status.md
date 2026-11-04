# Trials implementation status — 2026-11-03

Current product: Trials, a VTT Battlemap Maker. README.md describes the live functionality, edition split, builds and remaining distribution setup.

Implemented: shared persistent tileset library, catalog-driven default artwork (38 visible 16×16 brushes), optional Kenney packs/manager credit, transparent-cell omission, partial alpha preservation, library backup/import, retained map artwork after library deletion, Ko-fi link and creator credit. Existing portable map formats and storage names remain compatible.

Free: 6 layers, 2 custom tilesets, 2 source-image imports per custom set, 16×16 or 32×32 setup, top-left 160×160 import cropping, and a small faded pixel-font PNG watermark. Paid desktop: 12 layers, unrestricted edition upload rules, no PNG watermark and no ads. Existing over-limit projects/assets are preserved. Free content edits on projects above 6 layers are blocked; save/view/export remain available.

Local web build and Windows Electron ZIP packaging are implemented, including Pages workflow, configurable small sponsor placement and optional Gumroad link. GitHub source is now connected at `https://github.com/deukrezia/trials`, with GitHub Actions Pages publishing to `https://deukrezia.github.io/trials/` on pushes to `main`. The owner requested future completed changes here to be committed, pushed and deployed automatically; project instructions preserve that request. No Gumroad publication has occurred. A Gumroad URL and real sponsor creative/link have not been supplied. Desktop packaging is unsigned; no license-key/DRM integration. Ads are hidden until configured. Review host policy before monetized deployment.

Verification: 51 Node tests; 8 headless browser flows, including edition limits/cropping/watermark and shared library across new projects/reload; hidden Electron offline/restart persistence smoke test. Tests never use desktop controls. Existing independent PDF checks verify physical geometry; physical printing remains untested.

Deferred: diagonal autotiling, connected terrain rules, multi-tile stamps, freeform props, lighting/fog, annotations, cloud sync and VTT-native wall data. Earlier research documents are historical references.

UI update: Tiny5 replaces Pixelify Sans. The Windows app has a themed draggable title bar and pixel minimize/maximize/close controls via a restricted sandbox preload. Optional Kenney sets can be removed independently, preserving placed artwork and allowing re-addition. Edition limits use a comparison dialog, capacity indicators and contextual links instead of a manager paragraph. Default brushes are curated by visual similarity; palette drag/drop and Alt+arrow ordering persist in the shared library and its backups. New checks cover tile ordering, grouping, custom/default reordering, removal persistence, narrow-screen edition details and desktop control IPC without moving/showing the hidden window.

2026-11-05: The owner selected Silkscreen in place of Tiny5. Regular and bold WOFF2 fonts are bundled locally. UI tracking is tightened by 0.035em, with the same spacing used in the Free PNG watermark.
