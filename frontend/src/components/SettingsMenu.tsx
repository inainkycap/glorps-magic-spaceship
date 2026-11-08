import { useEffect, useId, useRef, useState } from "react";
import { buildDemoSave } from "../game/demoSave";
import { clearSavedProgress, replaceSavedProgress } from "../hooks/useProgress";
import { useSpeciesData } from "../hooks/useSpeciesData";

type Confirm = null | "reset" | "demo";

/** Reload at the map, so every screen and store starts from the new save. */
const reloadAtMap = () => window.location.assign(import.meta.env.BASE_URL);

/**
 * Settings in the nav: "Load demo save" (a mid-game preset, game/demoSave.ts) and
 * "Reset game". Both replace the player's progress, so each asks to confirm first.
 */
export default function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [error, setError] = useState<string | null>(null);
  const species = useSpeciesData();
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const close = () => {
    setOpen(false);
    setConfirm(null);
    setError(null);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      setConfirm(null);
      buttonRef.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setConfirm(null);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const resetGame = () => {
    clearSavedProgress();
    reloadAtMap();
  };

  const loadDemo = () => {
    if (species.status !== "ok") return;
    try {
      replaceSavedProgress(buildDemoSave(species.data.byId));
      reloadAtMap();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="settings" ref={wrapRef}>
      <button
        ref={buttonRef}
        className="px-button settings-btn"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close() : setOpen(true))}
      >
        Settings
      </button>
      {open && (
        <div id={menuId} className="settings-menu" role="group" aria-label="Settings">
          {confirm === null && (
            <>
              <button className="px-button" onClick={() => setConfirm("demo")} disabled={species.status !== "ok"}>
                Load demo save
              </button>
              <button className="px-button danger" onClick={() => setConfirm("reset")}>
                Reset game
              </button>
            </>
          )}
          {confirm === "reset" && (
            <div className="settings-confirm" role="alertdialog" aria-label="Confirm reset">
              <p>Reset the game? This deletes all your progress and can't be undone.</p>
              <div className="settings-actions">
                <button className="px-button danger" onClick={resetGame} autoFocus>
                  Yes, reset
                </button>
                <button className="px-button" onClick={() => setConfirm(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          {confirm === "demo" && (
            <div className="settings-confirm" role="alertdialog" aria-label="Confirm demo save">
              <p>Load the demo save? It replaces your current progress.</p>
              <div className="settings-actions">
                <button className="px-button primary" onClick={loadDemo} autoFocus>
                  Load demo
                </button>
                <button className="px-button" onClick={() => setConfirm(null)}>
                  Cancel
                </button>
              </div>
              {error && <p className="error small">{error}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
