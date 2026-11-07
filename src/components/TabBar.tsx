import { Folder, Plus, X } from "lucide-react";
import { splitPath } from "../lib/format";

interface Props {
  tabs: string[];
  active: number;
  newTabOpen: boolean;
  onSelect: (i: number) => void;
  onClose: (i: number) => void;
  onAdd: () => void;
}

export function TabBar({ tabs, active, newTabOpen, onSelect, onClose, onAdd }: Props) {
  return (
    <div className="titlebar" data-tauri-drag-region>
      {tabs.map((path, i) => {
        const isActive = i === active && !newTabOpen;
        return (
          <div
            key={path}
            role="tab"
            aria-selected={isActive}
            tabIndex={0}
            title={path}
            className={`tab${isActive ? " active" : ""}`}
            onClick={() => onSelect(i)}
            onKeyDown={(e) => e.key === "Enter" && onSelect(i)}
            onAuxClick={(e) => e.button === 1 && onClose(i)}
          >
            <Folder size={14} strokeWidth={1.8} aria-hidden />
            <span className="label">{splitPath(path).name}</span>
            <button
              className="close"
              aria-label={`Fermer ${splitPath(path).name}`}
              onClick={(e) => {
                e.stopPropagation();
                onClose(i);
              }}
            >
              <X size={12} strokeWidth={2.2} aria-hidden />
            </button>
          </div>
        );
      })}
      {newTabOpen && (
        <div className="tab active" role="tab" aria-selected>
          <Plus size={14} strokeWidth={1.8} aria-hidden />
          <span className="label">Nouvel onglet</span>
        </div>
      )}
      <button className="tab-add" aria-label="Nouvel onglet" onClick={onAdd}>
        <Plus size={16} strokeWidth={1.8} aria-hidden />
      </button>
    </div>
  );
}
