# prodigygit

Client Git de bureau, construit avec Tauri 2 (Rust + `git2`) et React + TypeScript.

## Télécharger

Chaque push sur `main` construit l'app pour macOS (Apple Silicon et Intel) et publie le `.dmg` dans la release `v<version>` de [Releases](https://github.com/corentingosselin/prodigygit/releases). La version vient de `src-tauri/tauri.conf.json` : change-la pour créer une nouvelle release.

L'app n'est pas signée par un certificat Apple. Si macOS refuse de l'ouvrir au premier lancement :

```bash
xattr -cr /Applications/prodigygit.app
```

## Lancer en développement

```bash
npm install
npm run tauri dev
```

## Tests du backend

```bash
cd src-tauri && cargo test
```

## Dépôts de test

```bash
scripts/make-fixtures.sh
```

Crée `~/Documents/prodigygit-fixtures` : `demo` (commits à pousser et à tirer, fichiers stagés et non stagés, stash, branches en dossiers) et `demo-conflit` (merge arrêté sur des conflits), avec un remote local. Relancer le script remet tout à zéro.

## Organisation

- `src-tauri/src/git.rs` : opérations Git. Lecture, staging, commit et branches passent par `git2`. Pull, push, fetch, clone, merge et stash passent par la CLI `git`, pour réutiliser l'agent SSH et le trousseau macOS.
- `src-tauri/src/gh.rs` : comptes de GitHub CLI (`gh`), pour importer les profils et pousser avec le token du bon compte.
- `src-tauri/src/settings.rs` : onglets ouverts et profils GitHub, stockés dans `~/Library/Application Support/app.prodigygit/settings.json`.
- `src/components/` : interface (onglets, barre d'outils, sidebar des branches, historique, diff, conflits, changements).
- `PRODUCT.md` et `DESIGN.md` : contexte produit et système visuel « Graphite ».
