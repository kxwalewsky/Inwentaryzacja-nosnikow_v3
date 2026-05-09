# Naprawa GitHub Actions

Ta wersja workflow nie używa `tauri-apps/tauri-action`, tylko bezpośrednio uruchamia:

```bash
npm run tauri:build -- --target x86_64-pc-windows-msvc
```

Dzięki temu pasuje do skryptu z `package.json`:

```json
"tauri:build": "tauri build"
```

Jeżeli na GitHubie pojawia się błąd `Missing script: tauri`, podmień plik:

`.github/workflows/windows-build.yml`

na wersję z tej paczki.
