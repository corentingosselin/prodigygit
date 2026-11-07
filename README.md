# prodigygit

Client Git de bureau, construit avec Tauri 2 (Rust + `git2`) et React + TypeScript.

## Lancer

```bash
npm install
npm run tauri dev
```

## Tests du backend

```bash
cd src-tauri && cargo test
```

## Organisation

- `src-tauri/src/git.rs` : opérations Git. Lecture, staging, commit et branches passent par `git2`. Pull, push, fetch, clone, merge et stash passent par la CLI `git`, pour réutiliser l'agent SSH et le trousseau macOS.
- `src-tauri/src/settings.rs` : onglets ouverts et profils GitHub, stockés dans `~/Library/Application Support/app.prodigygit/settings.json`.
- `src/components/` : interface (onglets, barre d'outils, sidebar des branches, historique, diff, conflits, changements).
- `PRODUCT.md` et `DESIGN.md` : contexte produit et système visuel « Graphite ».
