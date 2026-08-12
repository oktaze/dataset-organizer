# CLAUDE.md — Dataset Organizer

## Vision du projet
Application desktop (Tauri v2 + React + Python sidecar) pour organiser des datasets d'images destinés au training de LoRAs (Stable Diffusion / Illustrious XL). Supporte trois types de LoRAs : **Character**, **Style**, **Concept**.

La feature centrale : pour les LoRAs de type Character, l'utilisateur définit des **costumes** (ensembles de tags canoniques). À l'import d'une image, le système détecte automatiquement quel costume est visible et applique les bons tags, en complétant avec les tags visuels détectés par WD Tagger.

---

## Architecture

```
dataset-organizer/
├── src/                        # Frontend React + TypeScript
│   ├── components/
│   │   ├── ui/                 # Composants génériques (shadcn/ui)
│   │   ├── layout/             # Shell, sidebar, topbar
│   │   ├── projects/           # Gestion projets LoRA
│   │   ├── gallery/            # Galerie images + tag editor
│   │   ├── costumes/           # Costume builder (character only)
│   │   └── export/             # Preview & export dataset
│   ├── hooks/                  # Custom hooks React
│   ├── stores/                 # Zustand stores
│   ├── lib/                    # Utils, types, tauri bindings
│   └── App.tsx
├── src-tauri/                  # Backend Rust + config Tauri
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/           # Tauri commands (IPC)
│   │   │   ├── filesystem.rs   # Lecture/écriture images, .txt captions
│   │   │   ├── sidecar.rs      # Spawn/kill Python sidecar
│   │   │   └── db.rs           # SQLite via rusqlite
│   │   └── lib.rs
│   └── tauri.conf.json
├── sidecar/                    # Python FastAPI
│   ├── main.py                 # Entrée FastAPI, routes
│   ├── tagger.py               # WD Tagger v3 (ONNX)
│   ├── costume_matcher.py      # Logique matching costume → tags
│   ├── models/                 # Modèles ONNX téléchargés au premier run
│   └── requirements.txt
├── CLAUDE.md                   # Ce fichier
└── package.json
```

---

## Stack technique

| Couche | Techno | Version |
|---|---|---|
| Shell desktop | Tauri | v2.x |
| Frontend | React + TypeScript | 19.x |
| Styling | Tailwind CSS v4 | latest |
| Composants | shadcn/ui | latest |
| State management | Zustand | 5.x |
| Data fetching | TanStack Query | v5 |
| DB locale | SQLite via rusqlite (Rust) | — |
| Python runtime | FastAPI + Uvicorn | — |
| Auto-tagger | WD Tagger v3 (ONNX) | wd-vit-tagger-v3 |
| Drag & drop | @dnd-kit | v6 |
| Virtualisation liste | TanStack Virtual | v3 |

---

## Modèle de données (SQLite)

```sql
-- Projet LoRA (character / style / concept)
CREATE TABLE projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK(type IN ('character','style','concept')),
  trigger     TEXT NOT NULL,           -- trigger word principal
  base_model  TEXT DEFAULT 'illustrious-xl',
  created_at  INTEGER,
  updated_at  INTEGER
);

-- Costumes (character uniquement)
CREATE TABLE costumes (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,           -- ex: "Battle Armor", "School Uniform"
  trigger     TEXT,                    -- trigger optionnel ex: "outfit1"
  tags        TEXT NOT NULL,           -- JSON array de tags canoniques obligatoires
  color_tags  TEXT,                    -- JSON array tags couleur signature
  sort_order  INTEGER DEFAULT 0
);

-- Images du dataset
CREATE TABLE images (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  costume_id    TEXT REFERENCES costumes(id),   -- NULL si style/concept ou non assigné
  filename      TEXT NOT NULL,
  filepath      TEXT NOT NULL,
  width         INTEGER,
  height        INTEGER,
  tags_auto     TEXT,   -- JSON array (sortie brute WD Tagger)
  tags_final    TEXT,   -- JSON array (tags validés par l'utilisateur)
  caption       TEXT,   -- caption final assemblé
  costume_score TEXT,   -- JSON map {costume_id: score} du matching
  status        TEXT DEFAULT 'pending' CHECK(status IN ('pending','tagged','validated','exported')),
  created_at    INTEGER
);

-- Tags constants du personnage (appris implicitement, ne pas captionner)
CREATE TABLE character_constant_tags (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tag         TEXT NOT NULL
);
```

---

## API Sidecar Python (FastAPI)

Toutes les routes sont exposées sur `http://127.0.0.1:PORT` (port aléatoire communiqué au frontend via Tauri).

### Routes

```
GET  /health                         → { status: "ok", model_loaded: bool }

POST /tag
  body: { image_path: string, threshold?: float }
  return: { tags: [{tag: string, score: float}] }

POST /tag/batch
  body: { image_paths: string[], threshold?: float }
  return: { results: [{path, tags}] }

POST /costume/match
  body: {
    image_path: string,
    costumes: [{id, tags: string[], color_tags: string[]}],
    threshold?: float
  }
  return: {
    best_costume_id: string,
    scores: {[costume_id]: float},
    method: "wd_tagger"
  }

POST /caption/build
  body: {
    trigger: string,
    costume_tags?: string[],
    auto_tags: string[],
    constant_tags: string[],   -- à exclure du caption
    costume_trigger?: string
  }
  return: { caption: string }
```

---

## IPC Tauri → Rust commands

```rust
// filesystem.rs
#[tauri::command] read_images_from_dir(path: String) -> Vec<ImageMeta>
#[tauri::command] write_caption_file(image_path: String, caption: String)
#[tauri::command] export_dataset(project_id: String, output_dir: String)
#[tauri::command] get_image_thumbnail(path: String) -> String  // base64

// sidecar.rs
#[tauri::command] start_sidecar() -> u16  // retourne le port
#[tauri::command] stop_sidecar()

// db.rs
#[tauri::command] db_query(sql: String, params: Vec<Value>) -> Vec<Value>
#[tauri::command] db_execute(sql: String, params: Vec<Value>)
```

---

## Flux principal — Character LoRA avec costumes

```
1. Créer projet (type=character, trigger="miyuki")
2. Définir costumes
   └── Costume A "School Uniform": tags=[school_uniform, white_shirt, blue_skirt, ribbon]
   └── Costume B "Battle Armor": tags=[armor, pauldrons, breastplate, gauntlets]
3. Définir tags constants du perso (ne pas captionner)
   └── [silver_hair, blue_eyes, ahoge]
4. Importer images (drag & drop ou sélection dossier)
5. Pour chaque image → sidecar:
   a. WD Tagger → liste de tags bruts
   b. Costume matcher → score par costume → assigne le meilleur
   c. Caption builder → assemble caption final
      = trigger + costume_trigger + costume_tags + tags_contextuels (excl. constants)
6. L'utilisateur review dans la galerie :
   - Changer le costume assigné
   - Ajouter/retirer des tags individuels
   - Éditer le caption directement
7. Export → pour chaque image, écrire image.txt avec le caption validé
```

---

## Règles de captioning

Le caption final suit toujours cet ordre :
```
{trigger}, {costume_trigger?}, {costume_tags}, {pose_tags}, {expression_tags}, {background_tags}, {quality_tags}
```

Les **tags constants** du personnage (définis par l'utilisateur) sont **exclus** du caption → le LoRA les apprend implicitement.

Les **tags de costume canoniques** sont toujours inclus même s'ils ne sont pas détectés par WD Tagger (c'est le but : forcer la cohérence inter-images).

---

## Conventions de code

- **TypeScript strict** : pas de `any`, interfaces explicites pour tout
- **Composants React** : fonctionnels uniquement, hooks personnalisés pour la logique métier
- **Zustand** : un store par domaine (`useProjectStore`, `useImageStore`, `useCostumeStore`)
- **Appels sidecar** : toujours via TanStack Query (cache, loading states, retry)
- **Rust** : commands Tauri simples, pas de logique métier en Rust (déléguer au sidecar ou au frontend)
- **Python** : typage via Pydantic sur tous les modèles FastAPI
- **Nommage fichiers** : kebab-case pour les composants React (`costume-builder.tsx`)
- **CSS** : Tailwind uniquement, pas de CSS modules, pas de styled-components

---

## UI/UX — Principes

- Dark theme obligatoire (contexte créatif, longue utilisation)
- Palette : fond très sombre (#0a0a0f), accents violet/indigo (`violet-500`)
- Layout : sidebar gauche (projets) + zone centrale (galerie) + panneau droit (tag editor)
- Galerie : grille virtualisée (TanStack Virtual), thumbnails 200×200
- Tag editor : chips cliquables avec score de confiance (couleur selon score)
- Costume badge : visible sur chaque image dans la galerie
- Raccourcis clavier : `A/D` naviguer images, `1-9` assigner costume, `V` valider

---

## Commandes de dev

```bash
# Install deps
pnpm install

# Lancer en dev (Tauri + React + sidecar)
pnpm tauri dev

# Lancer sidecar seul (debug)
cd sidecar && uvicorn main:app --reload --port 7842

# Build production
pnpm tauri build

# Télécharger modèle WD Tagger (premier setup)
cd sidecar && python download_models.py
```

---

## Variables d'environnement

```env
# .env (frontend)
VITE_SIDECAR_PORT=7842          # override port en dev

# sidecar/.env
WD_MODEL=wd-vit-tagger-v3       # ou wd-swinv2-tagger-v3
WD_THRESHOLD=0.35               # seuil de confiance minimum
```

---

## Auto-update & Releases

- Updater intégré : `tauri-plugin-updater` + `tauri-plugin-process`, UX type VS Code (check au démarrage → download silencieux → bannière « Restart »). Hook `src/hooks/use-app-updater.ts` + store `src/stores/use-updater-store.ts` + `src/components/updates/update-banner.tsx`, monté une fois dans `AppShell`. Check manuel dans Settings.
- Endpoint : `plugins.updater.endpoints` → `https://github.com/oktaze/dataset-organizer/releases/latest/download/latest.json`. `bundle.createUpdaterArtifacts: true` ⇒ **chaque `pnpm tauri build` doit être signé**.
- Clé minisign **hors repo** : `~/.tauri/dataset-organizer-updater.key` (sans mot de passe). Pubkey committée dans `tauri.conf.json`. Secret CI : `TAURI_SIGNING_PRIVATE_KEY`. **Perte de la clé = plus aucun client ne peut s'updater.**
- `scripts/tauri.mjs` auto-charge cette clé si `TAURI_SIGNING_PRIVATE_KEY` n'est pas déjà posée ⇒ `pnpm tauri build` signe sans manip.
- CI : `.github/workflows/release.yml`, déclenchée sur **push `main`**. Deux jobs : `release-please` (gère version + changelog + Release PR), puis `build` (gated sur `release_created`, matrice Linux / Windows / macOS arm64). `tauri-action` build, signe et uploade les installers + `latest.json` sur la Release créée par release-please (`releaseId`).
- **Flux release (release-please)** : on ne bumpe **plus jamais** la version à la main. Écrire des commits **Conventional** (`feat:` → minor, `fix:` → patch, `feat!:` ou `BREAKING CHANGE:` → major). À chaque push sur `main`, release-please maintient une **Release PR** (« chore(main): release X.Y.Z ») qui remplit `CHANGELOG.md` et bumpe **les 3 fichiers ensemble** (`package.json` + `src-tauri/tauri.conf.json` + `src-tauri/Cargo.toml`) via `release-please-config.json` + `.release-please-manifest.json`. **Merger cette PR** = tag `vX.Y.Z` + Release + build. L'updater compare à `latest.json` (endpoint inchangé).
  - Sync des versions : `package.json` = package (release-type `node`) ; `tauri.conf.json` via `extra-files` (jsonpath `$.version`) ; `Cargo.toml` via l'updater `generic` (annotation `# x-release-please-version` sur la ligne `version`, **ne pas retirer**). `Cargo.lock` non géré (régénéré au build, pas de `--locked`).
  - Prérequis GitHub : Settings → Actions → General → **Allow GitHub Actions to create and approve pull requests** activé, sinon la Release PR ne peut pas s'ouvrir.
- Première release = install **manuelle** (l'updater n'agit que depuis une version qui l'embarque déjà). Linux : seul l'**AppImage** s'auto-update. macOS non signé : 1re install clic-droit → Ouvrir.

---

## Build & CI — pièges connus

- **PyInstaller ne cross-compile pas** : build sur chaque OS. **macOS Intel non buildé** : le runner `macos-13` ne démarre jamais sur GitHub (file d'attente Intel) ⇒ retiré de la matrice. Apple Silicon (`macos-14`) uniquement.
- `scripts/build-sidecar.mjs` choisit le python du venv selon l'OS (`bin/` vs `Scripts/`) ; `package.json` → `build:sidecar` pointe dessus.
- `bundle.resources` = `"sidecar-bin/*"` (glob) pour embarquer `lora-sidecar` **ou** `lora-sidecar.exe`.
- CI : **Node 22** requis (pnpm 11 utilise `node:sqlite`, absent < Node 22) ; **Python 3.12** (wheels cp312 onnxruntime/numpy/pillow).
- `patchelf` **Linux-only** dans `requirements-build.txt` (`; sys_platform == "linux"`) : pas de wheels macOS/Windows, inutile hors AppImage.
- **`target/` Cargo non relocatable** : déplacer/renommer le repo ⇒ chemins absolus périmés ⇒ `cargo clean` obligatoire.

---

## Git / workflow (préférences)

- **Ne pas commiter ni pusher** sans demande explicite : faire les modifs, laisser l'utilisateur commiter.
- **Aucun trailer `Co-Authored-By`** dans les messages de commit.
- **Commits Conventional** (`feat:`, `fix:`, `chore:`, `docs:`, `ci:`, `feat!:`/`BREAKING CHANGE:`) : release-please en dérive le `CHANGELOG.md` et le bump de version. Ne plus committer de « feat: 0.x.0 » (release-please est la seule source de bump).

---

## Priorités de développement

### Phase 1 — Fondations
- [ ] Init projet Tauri v2 + React + shadcn
- [ ] SQLite setup + migrations
- [ ] Sidecar Python FastAPI (health check)
- [ ] WD Tagger fonctionnel (ONNX local)
- [ ] Import images + thumbnails

### Phase 2 — Core feature Character
- [ ] Gestion projets (CRUD)
- [ ] Costume builder UI
- [ ] Tagging auto au batch import
- [ ] Costume matching
- [ ] Caption builder
- [ ] Galerie + tag editor

### Phase 3 — Style & Concept
- [ ] Flux simplifié sans costume
- [ ] Tags spécifiques style (artist_style, medium, etc.)

### Phase 4 — Polish & Export
- [ ] Export dataset complet
- [ ] Validation UI (review batch)
- [ ] Raccourcis clavier
- [ ] Vision LLM pour enrichissement (idée future, à repenser — l'ancienne implémentation Claude Vision « matching costume » a été retirée car peu de plus-value)
- [x] Auto-update (`tauri-plugin-updater`) + release CI GitHub Actions
- [x] Versioning + changelog automatisés (release-please, Release PR, bump des 3 fichiers)
