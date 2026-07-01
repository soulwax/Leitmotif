# App icons

`icon.ico` here is a **minimal gold placeholder** (a 16×16 solid tile) so
`tauri-build` can generate its Windows resource file — it is required even for
`cargo check`/`tauri dev` on Windows, not just release bundles. Replace it with
real artwork when it exists.

To generate the full icon set from a single source PNG (once you have artwork):

```bash
npm run tauri icon path/to/leitmotif-source.png
```

That produces `icon.ico`, `icon.icns`, and the various PNG sizes Tauri expects,
and updates `tauri.conf.json` automatically. Until then, `tauri dev` works and
`tauri build` will prompt for the icon.
