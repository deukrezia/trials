# Trials project instructions

- Do not use AI-generated images. Use the owner's supplied art and optional Kenney packs.
- Do not operate native desktop controls or the user's open browser windows. Verify UI changes with isolated headless browser profiles or hidden Electron test windows.
- Preserve the shared tileset library and placed map artwork across projects, upgrades and library removal.
- Keep UI text concise. Avoid redundant counts, repeated selected-state labels, decorative arrows and explanatory paragraphs where contextual controls work better.

## Publishing changes

The owner requested GitHub Pages hosting and automatic updates from this project. After completing an authorized editor change, run the relevant checks, commit the intended source changes and push the deployment branch to the configured GitHub origin. GitHub Actions in `.github/workflows/pages.yml` rebuilds and publishes the Free web edition on pushes to `main` or `master`. Check the workflow result and public URL before reporting that the live site is updated.

This instruction authorizes publishing completed requested changes without asking again. Do not publish unfinished work or unrelated user changes. Keep `node_modules`, `.test-output`, `dist`, `out`, credentials, local maps and personal tile-library backups out of source commits. Never force-push. If GitHub authentication or the remote is unavailable, finish and verify the local work and report the specific remaining connection requirement; do not claim a deployment occurred.

The Windows desktop build is a separate artifact; Pages publishes only `dist/web`. Do not publish the Windows ZIP as part of the web site. Advertising and purchase links appear only after the owner supplies their configuration.
