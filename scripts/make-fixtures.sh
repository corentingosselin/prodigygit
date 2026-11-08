#!/usr/bin/env bash
# Builds throwaway Git repositories to test prodigygit by hand.
#
#   scripts/make-fixtures.sh [target-dir]     (default: ~/Documents/prodigygit-fixtures)
#
# Creates:
#   origin.git      bare "GitHub" remote shared by the clones below
#   demo/           everyday repo: feature branch vs develop, ahead 2 / behind 1,
#                   staged + unstaged + untracked + deleted files, a stash,
#                   ~15 branches grouped in folders, a branch that conflicts
#   demo-conflit/   same project, stopped in the middle of a merge with conflicts
#
# Re-running the script deletes and rebuilds the target directory.
set -euo pipefail

ROOT="${1:-$HOME/Documents/prodigygit-fixtures}"
ROOT="${ROOT%/}"
case "$ROOT" in
  */prodigygit-fixtures*) ;;
  *) echo "Refus: le dossier cible doit contenir 'prodigygit-fixtures' ($ROOT)" >&2; exit 1 ;;
esac

rm -rf "$ROOT"
mkdir -p "$ROOT"
cd "$ROOT"

export GIT_CONFIG_NOSYSTEM=1
T=1767225600 # 2026-01-01, then one hour per commit
tick() { T=$((T + 3600)); export GIT_AUTHOR_DATE="@$T +0100" GIT_COMMITTER_DATE="@$T +0100"; }
as() { export GIT_AUTHOR_NAME="$1" GIT_AUTHOR_EMAIL="$2" GIT_COMMITTER_NAME="$1" GIT_COMMITTER_EMAIL="$2"; }
me() { as "Corentin Gosselin" "corentin@example.com"; }
alice() { as "Alice Martin" "alice@example.com"; }
bob() { as "Bob Durand" "bob@example.com"; }
commit() { git add -A && tick && git commit -q -m "$1" ${2:+-m "$2"}; }
g() { git -c init.defaultBranch=main -c advice.detachedHead=false "$@"; }

git init -q --bare -b main origin.git

# ---------- seed project (pushed to origin) ----------
g clone -q origin.git seed 2>/dev/null
cd seed
git config user.name x && git config user.email x@x

me
mkdir -p src/wallet src/api docs
cat > README.md <<'EOF'
# Loyalty

Application de cartes de fidélité.
EOF
cat > package.json <<'EOF'
{
  "name": "loyalty",
  "version": "1.0.0",
  "scripts": { "dev": "vite", "build": "vite build" }
}
EOF
commit "Initial commit"

cat > src/wallet/card.ts <<'EOF'
export interface Card {
  id: string;
  shop: string;
  points: number;
}

// Ajout de points sur une carte.
// Utilisé par le scan en caisse.
// Voir aussi src/api/client.ts.

export function addPoints(card: Card, amount: number): Card {
  return { ...card, points: card.points + amount };
}

// Affichage des points dans l'interface.
// Utilisé par la liste et le détail.
// Toujours en français.

export function formatPoints(card: Card): string {
  return `${card.points} points`;
}

export const MAX_POINTS = 1000;
EOF
commit "Ajoute le modèle Card"

cat > src/api/client.ts <<'EOF'
const BASE_URL = "https://api.example.com";

export async function get(path: string) {
  const res = await fetch(BASE_URL + path);
  return res.json();
}
EOF
commit "Client HTTP minimal"

alice
cat > docs/architecture.md <<'EOF'
# Architecture

- `src/wallet` : logique des cartes
- `src/api` : appels réseau
EOF
commit "Doc d'architecture"

cat > src/config.ts <<'EOF'
export const config = {
  locale: "fr-FR",
  currency: "EUR",
  timeout: 5000,
};
EOF
commit "Ajoute la configuration"

me
cat >> src/api/client.ts <<'EOF'

export async function post(path: string, body: unknown) {
  const res = await fetch(BASE_URL + path, { method: "POST", body: JSON.stringify(body) });
  return res.json();
}
EOF
commit "Ajoute post() au client"
git push -q origin main

# develop = base branch for features
git checkout -q -b develop
bob
cat > src/wallet/shop.ts <<'EOF'
export interface Shop {
  id: string;
  name: string;
}
EOF
commit "Modèle Shop"
alice
sed -i '' 's/timeout: 5000/timeout: 8000/' src/config.ts
commit "Augmente le timeout réseau"
git push -q origin develop

# ---------- branches grouped by folder ----------
mk_branch() { # name, file, message, author
  git checkout -q develop
  git checkout -q -b "$1"
  "$4"
  mkdir -p "$(dirname "$2")"
  echo "// $3" >> "$2"
  commit "$3"
  git push -q origin "$1"
}
mk_branch corentingosselin/loy-412-onboarding-screens src/onboarding.ts "Écrans d'onboarding" me
mk_branch corentingosselin/loy-455-push-notifications src/push.ts "Notifications push" me
mk_branch alice/loy-430-stripe-checkout src/api/stripe.ts "Paiement Stripe" alice
mk_branch alice/loy-441-fix-login-crash src/login.ts "Corrige le crash au login" alice
mk_branch bob/loy-398-dark-mode src/theme.ts "Mode sombre" bob
mk_branch bob/loy-460-analytics-events src/analytics.ts "Événements analytics" bob
mk_branch release/1.4 CHANGELOG.md "Release 1.4" me
mk_branch release/1.5 CHANGELOG.md "Release 1.5" me
mk_branch hotfix/loy-471-crash-android src/android.ts "Hotfix crash Android" alice
# remote-only branch (deleted locally later)
mk_branch alice/loy-480-remote-only src/remote.ts "Branche présente seulement sur origin" alice

# branch that conflicts with develop (same lines changed on both sides)
git checkout -q develop
git checkout -q -b corentingosselin/loy-470-points-rounding
me
cat > src/wallet/card.ts <<'EOF'
export interface Card {
  id: string;
  shop: string;
  points: number;
  tier: "bronze" | "silver" | "gold";
}

// Ajout de points sur une carte.
// Utilisé par le scan en caisse.
// Voir aussi src/api/client.ts.

export function addPoints(card: Card, amount: number): Card {
  const rounded = Math.round(amount);
  return { ...card, points: Math.min(card.points + rounded, MAX_POINTS) };
}

// Affichage des points dans l'interface.
// Utilisé par la liste et le détail.
// Toujours en français.

export function formatPoints(card: Card): string {
  return `${card.points.toLocaleString("fr-FR")} pts`;
}

export const MAX_POINTS = 1000;
EOF
sed -i '' 's/timeout: 8000/timeout: 3000/' src/config.ts
commit "Arrondit les points et plafonne à MAX_POINTS"
git push -q origin corentingosselin/loy-470-points-rounding

# develop moves on, touching the same lines
git checkout -q develop
bob
cat > src/wallet/card.ts <<'EOF'
export interface Card {
  id: string;
  shop: string;
  points: number;
  expiresAt?: Date;
}

// Ajout de points sur une carte.
// Utilisé par le scan en caisse.
// Voir aussi src/api/client.ts.

export function addPoints(card: Card, amount: number): Card {
  if (amount < 0) throw new Error("amount must be positive");
  return { ...card, points: card.points + amount };
}

// Affichage des points dans l'interface.
// Utilisé par la liste et le détail.
// Toujours en français.

export function formatPoints(card: Card): string {
  return `${card.points} point${card.points > 1 ? "s" : ""}`;
}

export const MAX_POINTS = 1000;
EOF
commit "Date d'expiration et validation du montant"
alice
sed -i '' 's/timeout: 8000/timeout: 10000/' src/config.ts
commit "Timeout à 10 s pour les réseaux lents"
git push -q origin develop

# main feature branch: started from an older develop, so develop has commits it lacks
git checkout -q -b corentingosselin/loy-463-loyalty-wallet-cards develop~2
me
cat > src/wallet/list.ts <<'EOF'
import { Card } from "./card";

export function sortByPoints(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => b.points - a.points);
}
EOF
commit "Liste des cartes triée par points"
cat > src/wallet/wallet.ts <<'EOF'
import { Card } from "./card";
import { sortByPoints } from "./list";

export class Wallet {
  private cards: Card[] = [];

  add(card: Card) {
    this.cards.push(card);
  }

  all(): Card[] {
    return sortByPoints(this.cards);
  }
}
EOF
commit "Classe Wallet" "Regroupe les cartes et expose une liste triée."
cat >> src/wallet/wallet.ts <<'EOF'

export function emptyWallet(): Wallet {
  return new Wallet();
}
EOF
commit "Ajoute emptyWallet()"
git push -q -u origin corentingosselin/loy-463-loyalty-wallet-cards
cd ..

# ---------- demo: everyday repo ----------
g clone -q origin.git demo
cd demo
me
git config user.name "Corentin Gosselin"
git config user.email "corentin@example.com"
git checkout -q corentingosselin/loy-463-loyalty-wallet-cards
for b in corentingosselin/loy-412-onboarding-screens corentingosselin/loy-470-points-rounding \
         alice/loy-430-stripe-checkout bob/loy-398-dark-mode release/1.5; do
  git branch -q --track "$b" "origin/$b"
done

# behind 1: a teammate pushes to the same branch from elsewhere
cd ../seed
alice
echo 'export const WALLET_VERSION = 2;' > src/wallet/version.ts
commit "Version du format de wallet"
git push -q origin corentingosselin/loy-463-loyalty-wallet-cards
cd ../demo
git fetch -q origin

# ahead 2: local commits not pushed yet
me
cat >> src/wallet/wallet.ts <<'EOF'

export function totalPoints(w: Wallet): number {
  return w.all().reduce((sum, c) => sum + c.points, 0);
}
EOF
commit "Ajoute totalPoints()"
sed -i '' 's/Application de cartes de fidélité./Application de cartes de fidélité (wallet Apple et Google)./' README.md
commit "Précise le README"

# a stash
echo '// TODO: animation de la carte' >> src/wallet/card.ts
git stash push -q -m "WIP animation carte"

# working tree: staged, unstaged, untracked, deleted
sed -i '' 's/"version": "1.0.0"/"version": "1.1.0"/' package.json
git add package.json
cat >> src/wallet/list.ts <<'EOF'

export function byShop(cards: Card[], shop: string): Card[] {
  return cards.filter((c) => c.shop === shop);
}
EOF
git add src/wallet/list.ts
sed -i '' 's/locale: "fr-FR"/locale: "fr-BE"/' src/config.ts
printf '\n## Wallet\n\nVoir `src/wallet/wallet.ts`.\n' >> docs/architecture.md
cat > src/wallet/qr.ts <<'EOF'
export function qrPayload(cardId: string): string {
  return `loyalty://card/${cardId}`;
}
EOF
cat > notes.txt <<'EOF'
Penser à tester le scan QR sur Android.
EOF
rm src/api/client.ts
cd ..

# ---------- demo-conflit: merge stopped on conflicts ----------
g clone -q origin.git demo-conflit
cd demo-conflit
git config user.name "Corentin Gosselin"
git config user.email "corentin@example.com"
git checkout -q -b corentingosselin/loy-470-points-rounding origin/corentingosselin/loy-470-points-rounding
git branch -q --track develop origin/develop 2>/dev/null || true
git merge develop >/dev/null 2>&1 || true
cd ..

rm -rf seed

cat <<EOF

Fixtures prêtes dans $ROOT

  demo/          branche corentingosselin/loy-463-loyalty-wallet-cards (base develop)
                 - 2 commits à pousser, 1 à tirer (Pull/Push)
                 - stagés : package.json, src/wallet/list.ts
                 - non stagés : src/config.ts, docs/architecture.md, src/api/client.ts (supprimé)
                 - non suivis : src/wallet/qr.ts, notes.txt
                 - 1 stash « WIP animation carte » (Pop)
                 - pour provoquer un conflit : checkout corentingosselin/loy-470-points-rounding,
                   puis clic droit sur develop > merger dans la branche courante
                   (conflits sur src/wallet/card.ts et src/config.ts)

  demo-conflit/  merge de develop en cours, conflits à résoudre :
EOF
git -C demo-conflit diff --name-only --diff-filter=U | sed 's/^/                 - /'
echo
echo "Remote « GitHub » local : $ROOT/origin.git"
