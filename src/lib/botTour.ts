/**
 * Tour guidé multi-étapes (Anime.js)
 * Arrêt possible à tout moment : stopTour() / clic écran / Échap.
 */
import { animate } from "animejs";

export type TourView =
  | "home"
  | "send"
  | "inbox"
  | "sent"
  | "suivi"
  | "fichiers"
  | "messages"
  | "actualites"
  | "announcements"
  | "departments"
  | "accounts"
  | "settings";

export type TourStep = {
  target: string;
  script: string;
  holdMs?: number;
};

export const TOUR_SEQUENCES: Record<
  string,
  { view: TourView; steps: TourStep[] }
> = {
  open_home: {
    view: "home",
    steps: [
      {
        target: "home-stats",
        script:
          "Voici votre tableau de bord : compteurs de documents reçus, à traiter et envoyés.",
      },
      {
        target: "home-actions",
        script:
          "Ces raccourcis permettent d'envoyer un document ou d'ouvrir la boîte de réception.",
      },
    ],
  },
  open_send: {
    view: "send",
    steps: [
      {
        target: "send-file",
        script: "Importez ici le fichier PDF ou l'image du document à transmettre.",
      },
      {
        target: "send-recipient",
        script:
          "Choisissez le destinataire ou plusieurs personnes pour un circuit.",
      },
      {
        target: "send-objet",
        script: "Indiquez l'objet de l'envoi, comme sur la fiche de transmission.",
      },
      {
        target: "send-observations",
        script: "Zone observations : notes pour le destinataire.",
      },
      {
        target: "send-tasks",
        script: "Cochez les tâches demandées : signature, avis, classement…",
      },
      {
        target: "send-submit",
        script: "Validez l'envoi. Un identifiant unique est créé automatiquement.",
      },
    ],
  },
  open_inbox: {
    view: "inbox",
    steps: [
      {
        target: "docs-list",
        script: "Vos documents reçus. Ouvrez un dossier pour le traiter.",
      },
      {
        target: "docs-filters",
        script: "Recherchez par objet, tâche ou nom de fichier.",
      },
    ],
  },
  remind_tasks: {
    view: "inbox",
    steps: [
      {
        target: "docs-list",
        script: "Les documents encore à traiter apparaissent dans cette liste.",
      },
    ],
  },
  open_sent: {
    view: "sent",
    steps: [
      {
        target: "docs-list",
        script: "Vos envois et le statut de chaque dossier.",
      },
    ],
  },
  open_suivi: {
    view: "suivi",
    steps: [
      {
        target: "suivi-list",
        script: "Suivi des circuits : où se trouve chaque dossier.",
      },
    ],
  },
  open_fichiers: {
    view: "fichiers",
    steps: [
      {
        target: "files-search",
        script: "Recherche par identifiant, objet ou nom de fichier.",
      },
    ],
  },
  open_messages: {
    view: "messages",
    steps: [
      {
        target: "messages-panel",
        script: "Messagerie interne avec vos collègues.",
      },
    ],
  },
  open_actualites: {
    view: "actualites",
    steps: [
      {
        target: "actualites-feed",
        script: "Fil d'actualités et annonces de l'administration.",
      },
    ],
  },
  open_announcements: {
    view: "announcements",
    steps: [
      {
        target: "announce-form",
        script: "Publiez une annonce avec la visibilité souhaitée.",
      },
    ],
  },
  open_departments: {
    view: "departments",
    steps: [
      {
        target: "departments-panel",
        script: "Départements : adhésions, invitations et gestion.",
      },
    ],
  },
  open_accounts: {
    view: "accounts",
    steps: [
      {
        target: "accounts-panel",
        script: "Gestion des comptes : validation des inscriptions.",
      },
    ],
  },
  open_settings: {
    view: "settings",
    steps: [
      {
        target: "settings-panel",
        script: "Paramètres du profil et de l'assistant.",
      },
    ],
  },
};

export const DOC_TOUR_STEPS: TourStep[] = [
  {
    target: "doc-objet",
    script: "L'objet rappelle pourquoi ce document circule.",
  },
  {
    target: "doc-circuit-map",
    script: "La carte montre où se trouve le dossier dans le circuit.",
  },
  {
    target: "doc-status",
    script: "Changez le statut : consulté, en cours ou traité.",
  },
  {
    target: "doc-revision",
    script: "Joignez une version modifiée pour poursuivre le circuit.",
  },
];

const HIGHLIGHT_ID = "scandoc-bot-tour-highlight";
const POINTER_ID = "scandoc-bot-tour-pointer";
const OVERLAY_ID = "scandoc-bot-tour-overlay";
const STOP_BTN_ID = "scandoc-bot-tour-stop";

let abortRequested = false;
let tourActive = false;
const listeners = new Set<(active: boolean) => void>();

export function isTourActive() {
  return tourActive;
}

export function onTourActiveChange(cb: (active: boolean) => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function setTourActive(v: boolean) {
  tourActive = v;
  listeners.forEach((cb) => cb(v));
}

/** Arrête immédiatement le guidage (animation + voix). */
export function stopTour() {
  abortRequested = true;
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
  clearTourVisuals();
  setTourActive(false);
}

function ensureOverlayEls() {
  let overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:9997;background:rgba(15,12,10,0.18);cursor:pointer;";
    overlay.title = "Cliquer pour arrêter le guidage";
    overlay.addEventListener("click", () => stopTour());
    document.body.appendChild(overlay);
  }
  overlay.style.display = "block";

  let stopBtn = document.getElementById(STOP_BTN_ID);
  if (!stopBtn) {
    const btn = document.createElement("button");
    stopBtn = btn;
    btn.id = STOP_BTN_ID;
    btn.type = "button";
    stopBtn.textContent = "Arrêter le guidage";
    stopBtn.style.cssText =
      "position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:10001;padding:10px 18px;border-radius:999px;border:1px solid rgba(0,102,179,0.35);background:#0066b3;color:#ffffff;font:600 13px/1.2 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,0.25);cursor:pointer;";
    stopBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      stopTour();
    });
    document.body.appendChild(stopBtn);
  }
  stopBtn.style.display = "block";

  let ring = document.getElementById(HIGHLIGHT_ID);
  if (!ring) {
    ring = document.createElement("div");
    ring.id = HIGHLIGHT_ID;
    ring.setAttribute("aria-hidden", "true");
    ring.style.cssText =
      "position:fixed;z-index:9998;pointer-events:none;border:2.5px solid #0066b3;border-radius:12px;box-shadow:0 0 0 4px rgba(0,102,179,0.15),0 10px 28px rgba(0,0,0,0.18);opacity:0;";
    document.body.appendChild(ring);
  }
  let pointer = document.getElementById(POINTER_ID);
  if (!pointer) {
    pointer = document.createElement("div");
    pointer.id = POINTER_ID;
    pointer.setAttribute("aria-hidden", "true");
    pointer.innerHTML =
      '<span style="font-size:28px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.3))">👆</span>';
    pointer.style.cssText =
      "position:fixed;z-index:9999;pointer-events:none;opacity:0;transform:translate(-40%,-10%);";
    document.body.appendChild(pointer);
  }
  return { ring, pointer };
}

export function clearTourVisuals() {
  const ring = document.getElementById(HIGHLIGHT_ID);
  const pointer = document.getElementById(POINTER_ID);
  const overlay = document.getElementById(OVERLAY_ID);
  const stopBtn = document.getElementById(STOP_BTN_ID);
  if (ring) ring.style.opacity = "0";
  if (pointer) pointer.style.opacity = "0";
  if (overlay) overlay.style.display = "none";
  if (stopBtn) stopBtn.style.display = "none";
}

function findTarget(key: string): HTMLElement | null {
  return (
    (document.querySelector(
      `[data-scandoc-tour="${key}"]`,
    ) as HTMLElement | null) ||
    (document.querySelector(
      `[data-scandoc-nav="${key}"]`,
    ) as HTMLElement | null)
  );
}

function placeHighlight(el: HTMLElement) {
  const { ring, pointer } = ensureOverlayEls();
  const tr = el.getBoundingClientRect();
  const pad = 5;
  ring.style.left = `${tr.left - pad}px`;
  ring.style.top = `${tr.top - pad}px`;
  ring.style.width = `${tr.width + pad * 2}px`;
  ring.style.height = `${tr.height + pad * 2}px`;
  ring.style.opacity = "1";
  pointer.style.left = `${tr.left + tr.width * 0.72}px`;
  pointer.style.top = `${tr.top + Math.min(tr.height * 0.35, 40)}px`;
  pointer.style.opacity = "1";
  animate(pointer, {
    translateY: [
      { to: -8, duration: 360, ease: "inOutSine" },
      { to: 0, duration: 360, ease: "inOutSine" },
    ],
    loop: 2,
  });
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (abortRequested) {
        resolve();
        return;
      }
      if (Date.now() - start >= ms) {
        resolve();
        return;
      }
      window.setTimeout(tick, 80);
    };
    tick();
  });
}

export type RunTourOpts = {
  botEl: HTMLElement;
  steps: TourStep[];
  onBotMoved?: (x: number, y: number) => void;
  speak?: (text: string) => void;
  onStep?: (step: TourStep, index: number) => void;
};

export async function runMultiStepTour(opts: RunTourOpts): Promise<void> {
  const { botEl, steps, onBotMoved, speak, onStep } = opts;
  if (!steps.length) return;

  abortRequested = false;
  setTourActive(true);
  ensureOverlayEls();

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") stopTour();
  };
  window.addEventListener("keydown", onKey);

  try {
    for (let i = 0; i < steps.length; i++) {
      if (abortRequested) break;
      const step = steps[i]!;
      onStep?.(step, i);

      await sleep(i === 0 ? 280 : 160);
      if (abortRequested) break;

      let target = findTarget(step.target);
      if (!target && step.target.includes("-")) {
        const viewGuess = step.target.split("-")[0];
        target = findTarget(viewGuess || step.target);
      }
      if (!target) {
        target = document.querySelector(
          "[data-scandoc-tour]",
        ) as HTMLElement | null;
      }
      if (!target) continue;

      target.scrollIntoView({ behavior: "smooth", block: "center" });
      await sleep(240);
      if (abortRequested) break;

      const tr = target.getBoundingClientRect();
      const br = botEl.getBoundingClientRect();
      const botW = br.width || 72;
      const botH = br.height || 90;

      let destX = tr.right + 14;
      let destY = tr.top + tr.height / 2 - botH / 2;
      if (destX + botW > window.innerWidth - 8) {
        destX = Math.max(8, tr.left - botW - 14);
      }
      if (destY < 8) destY = 8;
      if (destY + botH > window.innerHeight - 8) {
        destY = window.innerHeight - botH - 8;
      }

      const startLeft =
        parseFloat(botEl.style.left || String(br.left)) || br.left;
      const startTop = parseFloat(botEl.style.top || String(br.top)) || br.top;

      botEl.style.position = "fixed";
      botEl.style.left = `${startLeft}px`;
      botEl.style.top = `${startTop}px`;
      botEl.style.right = "auto";
      botEl.style.bottom = "auto";
      botEl.style.zIndex = "10000";

      if (!abortRequested) {
        await new Promise<void>((resolve) => {
          animate(botEl, {
            left: `${destX}px`,
            top: `${destY}px`,
            duration: 750,
            ease: "outQuad",
            onComplete: () => resolve(),
          });
          // Si abort pendant le move, on sort vite
          const check = window.setInterval(() => {
            if (abortRequested) {
              window.clearInterval(check);
              resolve();
            }
          }, 60);
        });
        onBotMoved?.(destX, destY);
      }

      if (abortRequested) break;
      placeHighlight(target);

      if (speak && step.script && !abortRequested) {
        speak(step.script);
      }

      const hold =
        step.holdMs ??
        Math.min(7000, Math.max(2200, 600 + step.script.length * 40));
      await sleep(hold);
    }
  } finally {
    window.removeEventListener("keydown", onKey);
    clearTourVisuals();
    setTourActive(false);
    abortRequested = false;
  }
}

export async function runBotTour(opts: {
  botEl: HTMLElement;
  view: TourView;
  onBotMoved?: (x: number, y: number) => void;
}): Promise<void> {
  const seq =
    TOUR_SEQUENCES[`open_${opts.view}`] ||
    TOUR_SEQUENCES[opts.view === "home" ? "open_home" : `open_${opts.view}`];
  await runMultiStepTour({
    botEl: opts.botEl,
    steps: seq?.steps ?? [
      { target: opts.view, script: `Voici la section ${opts.view}.` },
    ],
    onBotMoved: opts.onBotMoved,
  });
}

export function getTourScript(view: string): string {
  const key = view.startsWith("open_") ? view : `open_${view}`;
  return (TOUR_SEQUENCES[key]?.steps ?? []).map((s) => s.script).join(" ");
}

export function getSequenceForAction(action: string) {
  return TOUR_SEQUENCES[action] ?? null;
}
