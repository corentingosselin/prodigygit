import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";

/** The gitmojis people actually use, with their usual meaning. */
export const GITMOJIS: { emoji: string; code: string; desc: string }[] = [
  { emoji: "✨", code: "sparkles", desc: "Nouvelle fonctionnalité" },
  { emoji: "🐛", code: "bug", desc: "Correction de bug" },
  { emoji: "🚑️", code: "ambulance", desc: "Hotfix critique" },
  { emoji: "🩹", code: "adhesive_bandage", desc: "Petite correction" },
  { emoji: "♻️", code: "recycle", desc: "Refactorisation" },
  { emoji: "💄", code: "lipstick", desc: "UI et styles" },
  { emoji: "🎨", code: "art", desc: "Structure ou format du code" },
  { emoji: "⚡️", code: "zap", desc: "Performance" },
  { emoji: "🔥", code: "fire", desc: "Suppression de code ou de fichiers" },
  { emoji: "📝", code: "memo", desc: "Documentation" },
  { emoji: "✅", code: "white_check_mark", desc: "Tests" },
  { emoji: "🔧", code: "wrench", desc: "Configuration" },
  { emoji: "🚀", code: "rocket", desc: "Déploiement" },
  { emoji: "🔒️", code: "lock", desc: "Sécurité" },
  { emoji: "⬆️", code: "arrow_up", desc: "Mise à jour de dépendances" },
  { emoji: "➕", code: "heavy_plus_sign", desc: "Ajout de dépendance" },
  { emoji: "➖", code: "heavy_minus_sign", desc: "Retrait de dépendance" },
  { emoji: "🚧", code: "construction", desc: "Travail en cours" },
  { emoji: "💚", code: "green_heart", desc: "Correction de la CI" },
  { emoji: "👷", code: "construction_worker", desc: "Système de CI" },
  { emoji: "🌐", code: "globe_with_meridians", desc: "Traductions" },
  { emoji: "💬", code: "speech_balloon", desc: "Textes et libellés" },
  { emoji: "✏️", code: "pencil2", desc: "Faute de frappe" },
  { emoji: "🗃️", code: "card_file_box", desc: "Base de données" },
  { emoji: "🏷️", code: "label", desc: "Types" },
  { emoji: "🚨", code: "rotating_light", desc: "Avertissements du linter" },
  { emoji: "🔊", code: "loud_sound", desc: "Logs" },
  { emoji: "♿️", code: "wheelchair", desc: "Accessibilité" },
  { emoji: "🍱", code: "bento", desc: "Assets" },
  { emoji: "📦️", code: "package", desc: "Build et paquets" },
  { emoji: "🔀", code: "twisted_rightwards_arrows", desc: "Merge de branches" },
  { emoji: "⏪️", code: "rewind", desc: "Revert" },
  { emoji: "🙈", code: "see_no_evil", desc: ".gitignore" },
  { emoji: "🎉", code: "tada", desc: "Premier commit" },
];

const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const sprites = new Map<string, { src: string; w: number; h: number } | null>();

/**
 * The emoji as an image cropped to its visible pixels. Emoji fonts place their artwork
 * off-center in the line box, and WebKit differently from Chrome, so centering text is
 * never exact; an image trimmed to the ink centers exactly in any engine.
 */
function sprite(emoji: string, size: number) {
  const key = `${emoji}@${size}`;
  if (sprites.has(key)) return sprites.get(key)!;
  let out: { src: string; w: number; h: number } | null = null;
  try {
    const scale = Math.max(2, Math.ceil(window.devicePixelRatio || 1));
    const px = size * scale;
    const box = px * 2;
    const c = document.createElement("canvas");
    c.width = c.height = box;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      ctx.font = `${px}px ${EMOJI_FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(emoji, box / 2, box / 2);
      const { data } = ctx.getImageData(0, 0, box, box);
      let x0 = box, y0 = box, x1 = -1, y1 = -1;
      for (let y = 0; y < box; y++) {
        for (let x = 0; x < box; x++) {
          if (data[(y * box + x) * 4 + 3] > 8) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      if (x1 >= x0 && y1 >= y0) {
        const w = x1 - x0 + 1;
        const h = y1 - y0 + 1;
        const crop = document.createElement("canvas");
        crop.width = w;
        crop.height = h;
        crop.getContext("2d")!.drawImage(c, x0, y0, w, h, 0, 0, w, h);
        // Fit the ink in a size x size square, keeping its proportions.
        const k = size / Math.max(w, h);
        out = { src: crop.toDataURL(), w: w * k, h: h * k };
      }
    }
  } catch {
    /* no canvas: fall back to text */
  }
  sprites.set(key, out);
  return out;
}

/** An emoji drawn exactly centered in its box. */
export function Emoji({ value, size }: { value: string; size: number }) {
  const img = sprite(value, size);
  if (!img) return <span className="emoji" style={{ fontSize: size }}>{value}</span>;
  return <img className="emoji-img" src={img.src} width={img.w} height={img.h} alt={value} draggable={false} />;
}

interface Props {
  value: string;
  onChange: (emoji: string) => void;
}

/** Button showing the chosen gitmoji, opening a searchable list above it. */
export function GitmojiPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const options = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = t
      ? GITMOJIS.filter((g) => g.code.includes(t) || g.desc.toLowerCase().includes(t) || g.emoji === t)
      : GITMOJIS;
    return [{ emoji: "", code: "aucun", desc: "Pas de gitmoji" }, ...list];
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => root.current && !root.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => setActive(Math.min(1, options.length - 1)), [q, options.length]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pick = (emoji: string) => {
    onChange(emoji);
    setOpen(false);
    setQ("");
  };

  const current = GITMOJIS.find((g) => g.emoji === value);

  return (
    <div className="gitmoji" ref={root}>
      <button
        type="button"
        className="gitmoji-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={current ? `Gitmoji : ${current.desc}` : "Choisir un gitmoji"}
        title={current ? `${current.emoji} ${current.desc}` : "Pas de gitmoji"}
        onClick={() => setOpen((o) => !o)}
      >
        {value ? <Emoji value={value} size={20} /> : <span className="none">:)</span>}
      </button>
      {open && (
        <div className="gitmoji-pop" role="dialog" aria-label="Gitmojis">
          <label className="search">
            <Search size={14} strokeWidth={2} aria-hidden />
            <input
              autoFocus
              placeholder="bug, ui, perf…"
              aria-label="Chercher un gitmoji"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, options.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  if (options[active]) pick(options[active].emoji);
                } else if (e.key === "Escape") {
                  e.stopPropagation();
                  setOpen(false);
                }
              }}
            />
          </label>
          <div className="gitmoji-list" role="listbox" ref={listRef}>
            {options.map((g, i) => (
              <button
                type="button"
                key={g.code}
                data-i={i}
                role="option"
                aria-selected={g.emoji === value}
                className={`gitmoji-opt${i === active ? " active" : ""}${g.emoji === value ? " chosen" : ""}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(g.emoji)}
              >
                <span className="e">{g.emoji ? <Emoji value={g.emoji} size={17} /> : "∅"}</span>
                <span className="d">{g.desc}</span>
                {g.emoji && <span className="c mono">:{g.code}:</span>}
              </button>
            ))}
            {options.length === 1 && <div className="empty-note">Aucun gitmoji ne correspond</div>}
          </div>
        </div>
      )}
    </div>
  );
}
