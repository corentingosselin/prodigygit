// Browser-only stand-in for the Tauri backend, used when the UI runs in a plain
// browser during development (`npm run dev`). Never bundled into the Tauri app logic:
// it is only installed when `__TAURI_INTERNALS__` is missing.

const now = Math.floor(Date.now() / 1000);
const H = 3600;
const c = (sha: string, summary: string, author: string, ago: number) => ({
  sha: sha.padEnd(40, "0"),
  short: sha.slice(0, 7),
  summary,
  author,
  time: now - ago,
});

const CG = "Corentin Gosselin";
const BL = "Bob Durand";
const repo = "/Users/prodigy/dev/loyalty";
const cur = "corentingosselin/loy-463-loyalty-wallet-cards";

const state = {
  merging: false,
  unstaged: [
    { path: "apps/api/project.json", status: "M" },
    { path: "apps/loyalty-app/app/components/MobileLoyaltyApp.tsx", status: "M" },
    { path: "libs/loyalty/feature/src/index.ts", status: "M" },
    { path: "libs/loyalty/feature/src/lib/components/WalletSheet.tsx", status: "M" },
  ],
  staged: [{ path: "libs/loyalty/feature/src/lib/components/WalletShare.tsx", status: "A" }],
  conflicted: [] as string[],
};

const history = {
  head: cur,
  base: "develop",
  mine: [
    c("a1f3c2e", "LOY-463 Rework the Wallet tab identity section", CG, 2 * H),
    c("9be14d0", "LOY-463 Keep Wallet platform state after saving", CG, 26 * H),
    c("77c0a91", "LOY-463 Don't lose Wallet edits made while an image uploads", CG, 27 * H),
  ],
  theirs: [
    c("e4d21b7", "Merge pull request #142 from acme-app/develop", BL, 1 * H),
    c("c03f8aa", "Merge pull request #141 from acme-app/LOY-FIX-partner-onboarding", BL, 3 * H),
  ],
  shared: [
    c("5d1e9c0", "Merge pull request #138 Partner onboarding, steps 1 and 2", BL, 5 * 24 * H),
    c("b81a4f2", "Onboarding step 3: hide admin settings from clients", CG, 6 * 24 * H),
    c("0ac93de", "Add the billing and users scopes to the API", CG, 7 * 24 * H),
    c("f7e20b1", "Menu import tools (read, import, update, publish)", CG, 8 * 24 * H),
    c("2c11e08", "Disable axios proxying for the menu download", CG, 9 * 24 * H),
  ],
};

const branches = {
  local: [
    { name: "claude/new-session-39e153", isHead: false, tip: null, upstream: null, ahead: 0, behind: 0 },
    { name: "corentingosselin/loy-416-contact-panel-redesign", isHead: false, tip: null, upstream: "origin/corentingosselin/loy-416-contact-panel-redesign", ahead: 0, behind: 0 },
    { name: cur, isHead: true, tip: history.mine[0].sha, upstream: `origin/${cur}`, ahead: 3, behind: 2 },
    { name: "corentingosselin/loy-455-automations-stats", isHead: false, tip: null, upstream: null, ahead: 0, behind: 0 },
    { name: "develop", isHead: false, tip: history.theirs[0].sha, upstream: "origin/develop", ahead: 0, behind: 0 },
    { name: "main", isHead: false, tip: null, upstream: "origin/main", ahead: 0, behind: 0 },
  ],
  remote: [
    { name: "origin/bob/01-block-2", tip: null },
    { name: "origin/bob/02-lib-foundation", tip: null },
    { name: `origin/${cur}`, tip: history.mine[1].sha },
    { name: "origin/LOY-FIX-partner-onboarding-step2", tip: null },
    { name: "origin/develop", tip: history.theirs[0].sha },
    { name: "origin/main", tip: null },
  ],
};

const diff = {
  path: "",
  additions: 5,
  deletions: 2,
  binary: false,
  hunks: [
    {
      header: "@@ -12,9 +12,12 @@ export function WalletSheet",
      lines: [
        [" ", 12, 12, "import { Sheet, Button } from '@acme/ui';"],
        [" ", 13, 13, "import { useWallet } from '../hooks/useWallet';"],
        [" ", 14, 14, ""],
        ["-", 15, null, "export function WalletSheet({ wallet }: Props) {"],
        ["+", null, 15, "export function WalletSheet({ wallet, onSave }: Props) {"],
        [" ", 16, 16, "  const [draft, setDraft] = useState(wallet);"],
        ["-", 17, null, "  const handleSave = () => save(draft);"],
        ["+", null, 17, "  const handleSave = async () => {"],
        ["+", null, 18, "    const saved = await save(draft);"],
        ["+", null, 19, "    onSave?.(saved);"],
        ["+", null, 20, "  };"],
        [" ", 18, 21, "  return <Sheet title={wallet.name} onClose={onClose} />;"],
      ].map(([kind, old, n, text]) => ({ kind, old, new: n, text })),
    },
  ],
};

const conflict = {
  segments: [
    { kind: "ctx", lines: ["import { Sheet } from '@acme/ui';", "", "export function WalletSheet({ wallet, onClose }: Props) {", "  const { t } = useTranslation();"] },
    { kind: "hunk", ours: ["  const title = wallet.name;", "  const subtitle = wallet.shopName;"], theirs: ["  const title = t('wallet.title', { name: wallet.name });"] },
    { kind: "ctx", lines: ["", "  return ("] },
    { kind: "hunk", ours: ["    <Sheet title={title} subtitle={subtitle} onClose={onClose}>"], theirs: ["    <Sheet title={title} onClose={onClose} compact>"] },
    { kind: "ctx", lines: ["      <WalletPreview wallet={wallet} />", "    </Sheet>", "  );", "}"] },
  ],
  wholeFile: false,
};

let settings = {
  tabs: [repo, "/Users/prodigy/dev/prodigygit"],
  activeTab: 0,
  profiles: [
    { id: "p1", label: "Perso", login: "corentingosselin", name: "Corentin Gosselin", email: "corentin@example.com", sshKey: "" },
    { id: "p2", label: "Pro", login: "corentin-work", name: "Corentin Gosselin", email: "corentin@work.example", sshKey: "" },
  ],
  defaultProfile: "p2",
  repoProfiles: {},
};

const move = (from: typeof state.unstaged, to: typeof state.unstaged, files: string[]) => {
  for (const f of files) {
    const i = from.findIndex((x) => x.path === f);
    if (i >= 0) to.push(...from.splice(i, 1));
  }
};

async function invoke(cmd: string, args: Record<string, any> = {}): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 60));
  switch (cmd) {
    case "load_settings": return settings;
    case "save_settings": settings = args.settings; return null;
    case "repo_info": {
      const path = args.path as string;
      return { path, name: path.split("/").pop(), head: cur, merging: state.merging };
    }
    case "branches": return branches;
    case "history": return history;
    case "status": return { unstaged: state.unstaged, staged: state.staged, conflicted: state.conflicted };
    case "stash_list": return [{ index: 0, message: "WIP on loy-463: essai de couleur" }];
    case "diff_file": return { ...diff, path: args.file };
    case "stage": move(state.unstaged, state.staged, args.files); return null;
    case "unstage": move(state.staged, state.unstaged, args.files); return null;
    case "stage_all": move(state.unstaged, state.staged, state.unstaged.map((f) => f.path)); return null;
    case "unstage_all": move(state.staged, state.unstaged, state.staged.map((f) => f.path)); return null;
    case "commit": state.staged = []; return "4f2a9c1";
    case "merge":
      state.merging = true;
      state.conflicted = ["libs/loyalty/feature/src/lib/components/WalletSheet.tsx", "apps/api/project.json"];
      return { conflicted: state.conflicted };
    case "conflict_file": return { path: args.file, ...conflict };
    case "resolve_with_content":
    case "resolve_with_side":
      state.conflicted = state.conflicted.filter((f) => f !== args.file);
      return null;
    case "merge_abort":
    case "merge_continue":
      state.merging = false;
      state.conflicted = [];
      return null;
    case "fetch": case "pull": case "push": case "checkout": case "create_branch":
    case "delete_branch": case "stash_push": case "stash_pop": case "discard":
      return null;
    default:
      throw `Commande inconnue en mode démo : ${cmd}`;
  }
}

export function installDevMock() {
  const w = window as any;
  if (w.__TAURI_INTERNALS__) return;
  w.__TAURI_INTERNALS__ = {
    invoke,
    transformCallback: () => 0,
    unregisterCallback: () => {},
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
  };
}
