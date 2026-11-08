const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });

export function relativeTime(seconds: number): string {
  const diff = Date.now() / 1000 - seconds;
  if (diff < 60) return "à l’instant";
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), "minute");
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), "hour");
  if (diff < 7 * 86400) return rtf.format(-Math.round(diff / 86400), "day");
  const d = new Date(seconds * 1000);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function splitPath(p: string): { dir: string; name: string } {
  const i = p.lastIndexOf("/");
  return i < 0 ? { dir: "", name: p } : { dir: p.slice(0, i + 1), name: p.slice(i + 1) };
}

export function lastSegment(branch: string): string {
  return branch.slice(branch.lastIndexOf("/") + 1);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR = ["#C4B5FD", "#5EEAD4", "#FCA5A5", "#FCD34D", "#93C5FD", "#F9A8D4", "#86EFAC"];

export function avatarColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR[h % AVATAR.length];
}

export function errorText(err: unknown): string {
  return typeof err === "string" ? err : err instanceof Error ? err.message : String(err);
}

/**
 * Ticket id at the start of a branch's last segment, uppercased:
 * "corentingosselin/loy-463-loyalty-wallet-cards" -> "LOY-463", "LOY-1137-loyalty" -> "LOY-1137".
 * Null when the branch does not start with one ("develop", "hotfix-ss-prototype").
 */
export function ticketFromBranch(branch: string | null): string | null {
  if (!branch) return null;
  const m = lastSegment(branch).match(/^([A-Za-z][A-Za-z0-9]*-\d+)(?=$|[-_./])/);
  return m ? m[1].toUpperCase() : null;
}
