# App icons

The app's identity is a **lantern flame in the fog** — the game's recurring visual
motif (its *leitmotif*), warm gold with a calm teal-white heart against cool haze.

- **Source:** `leitmotif-source.svg` (edit this).
- **Generated set:** `icon.ico` / `icon.png` / `icon.icns` and the `Square*Logo`
  PNGs, produced by Tauri's generator.

Regenerate after editing the SVG:

```bash
npm run tauri icon src-tauri/icons/leitmotif-source.svg --output src-tauri/icons
```

(The mobile `android/`/`ios/` trees it also emits are removed — this is a Windows
desktop app.)
