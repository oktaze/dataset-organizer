---
description: Branche → implémente → lint/tests → commit → push → PR prête (feature)
argument-hint: <description de la feature>
---

Tu vas exécuter en autonomie le flux complet « feature » pour cette demande :

**$ARGUMENTS**

Si `$ARGUMENTS` est vide, demande d'abord à l'utilisateur la description de la feature et arrête-toi là.

Suis ces étapes dans l'ordre. Ne demande de validation que si un garde-fou l'exige (voir plus bas) ; sinon enchaîne tout seul.

## 1. Pré-checks
- `git status --short` : si le working tree n'est **pas** propre, **arrête-toi** et demande quoi faire (stash / commit / abandonner) — ne jamais écraser du travail non commité.
- `git fetch origin` pour partir d'un `main` à jour.

## 2. Créer la branche
- Dérive un slug court en kebab-case depuis la description (ex : `feat/export-csv-button`).
- `git switch -c feat/<slug> origin/main` (branche à partir du `main` distant à jour, pas du working tree courant).

## 3. Implémenter
- Réalise la feature proprement, en respectant `CLAUDE.md` et les conventions du repo (TypeScript strict, composants fonctionnels, Tailwind, Zustand par domaine, sidecar via TanStack Query, Pydantic côté Python, kebab-case pour les fichiers React, etc.).
- Réutilise l'existant plutôt que de dupliquer.

## 4. Garde-fous avant commit (obligatoire)
- `pnpm lint` puis `pnpm test`.
- Si des fichiers du `sidecar/` Python ont changé : `ruff check sidecar` puis `cd sidecar && pytest -q`.
- Si c'est **rouge** : corrige. Si tu ne peux pas corriger de façon fiable, **arrête-toi**, ne committe pas, et explique le problème. Jamais de commit qui casse lint/tests.

## 5. Commit
- Un commit **Conventional** `feat: <résumé impératif concis>`.
- **Aucun trailer `Co-Authored-By`** (préférence utilisateur).

## 6. Push + PR
- `git push -u origin feat/<slug>`.
- Crée la PR **prête à merge** (pas draft) :
  `gh pr create --base main --title "feat: <résumé>" --body "<ce que fait la PR + comment tester>"`
- **Ne merge pas** la PR — c'est l'utilisateur qui décide.
- Renvoie l'URL de la PR en fin de réponse.
