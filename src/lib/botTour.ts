/**
 * Tour guidé multi-étapes (Anime.js)
 * Le robot se déplace vers les VRAIS éléments de l'interface
 * (formulaire, listes, carte circuit…), pas seulement le menu.
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
  /** data-scandoc-tour="…" ou data-scandoc-nav="…" */
  target: string;
  /** Texte lu à voix haute pour CETTE étape */
  script: string;
  /** Pause après l'animation avant la voix (ms) */
  holdMs?: number;
};

/** Séquences de pointage liées à l'intention */
export const TOUR_SEQUENCES: Record<string, { view: TourView; steps: TourStep[] }> = {
  open_home: {
    view: "home",
    steps: [
      {
        target: "home-stats",
        script:
          "Voici votre tableau de bord : compteurs de documents reçus, à traiter et envoyés. C'est la vue d'ensemble de votre activité.",
      },
      {
        target: "home-actions",
        script:
          "Ces raccourcis permettent d'envoyer un document ou d'ouvrir la boîte de réception en un clic.",
      },
    ],
  },
  open_send: {
    view: "send",
    steps: [
      {
        target: "send-file",
        script:
          "Commencez ici : importez le fichier PDF ou image du document à transmettre, comme une fiche scannée.",
      },
      {
        target: "send-recipient",
        script:
          "Choisissez le destinataire, ou plusieurs personnes pour un circuit séquentiel entre directions.",
      },
      {
        target: "send-objet",
        script:
          "Indiquez l'objet de l'envoi, comme sur la fiche de transmission du Secrétariat Général.",
      },
      {
        target: "send-observations",
        script:
          "Zone observations : par exemple D T D m'en parler, comme une note manuscrite du SG.",
      },
      {
        target: "send-tasks",
        script:
          "Cochez les tâches demandées : pour signature, pour avis, pour classement, scan et e-mail, et les autres mentions de la fiche papier.",
      },
      {
        target: "send-submit",
        script:
          "Quand tout est prêt, validez l'envoi. Le système crée un identifiant unique et notifie les destinataires.",
      },
    ],
  },
  open_inbox: {
    view: "inbox",
    steps: [
      {
        target: "docs-list",
        script:
          "Voici vos documents reçus. Chaque ligne est un dossier à consulter ou à traiter.",
      },
      {
        target: "docs-filters",
        script:
          "Utilisez la recherche et les filtres de statut pour retrouver un dossier précis.",
      },
    ],
  },
  remind_tasks: {
    view: "inbox",
    steps: [
      {
        target: "docs-list",
        script:
          "Les documents non encore marqués comme traités apparaissent ici. Ouvrez-en un pour agir.",
      },
    ],
  },
  open_sent: {
    view: "sent",
    steps: [
      {
        target: "docs-list",
        script:
          "Vos envois : statut, destinataire, et accès au suivi du circuit si vous en avez défini un.",
      },
    ],
  },
  open_suivi: {
    view: "suivi",
    steps: [
      {
        target: "suivi-list",
        script:
          "Suivi des circuits : comme un colis, vous voyez où se trouve chaque dossier et les étapes restantes.",
      },
    ],
  },
  open_fichiers: {
    view: "fichiers",
    steps: [
      {
        target: "files-search",
        script:
          "Recherchez par identifiant S D, objet ou nom de fichier pour retrouver n'importe quel dossier.",
      },
    ],
  },
  open_messages: {
    view: "messages",
    steps: [
      {
        target: "messages-panel",
        script:
          "Messagerie interne : sélectionnez un collègue pour discuter. Les pastilles rouges signalent les non-lus.",
      },
    ],
  },
  open_actualites: {
    view: "actualites",
    steps: [
      {
        target: "actualites-feed",
        script:
          "Fil d'actualités : annonces de l'administration, réactions et commentaires.",
      },
    ],
  },
  open_announcements: {
    view: "announcements",
    steps: [
      {
        target: "announce-form",
        script:
          "Publiez une annonce : titre, texte, média, visibilité publique, département ou personnalisée.",
      },
    ],
  },
  open_departments: {
    view: "departments",
    steps: [
      {
        target: "departments-panel",
        script:
          "Départements MNDPT : demandez une adhésion, gérez les invitations, ou administrez votre direction si vous êtes chef.",
      },
    ],
  },
  open_accounts: {
    view: "accounts",
    steps: [
      {
        target: "accounts-panel",
        script:
          "Gestion des comptes, réservée au DG : validation des inscriptions et droits d'administration.",
      },
    ],
  },
  open_settings: {
    view: "settings",
    steps: [
      {
        target: "settings-panel",
        script:
          "Paramètres : profil, sécurité, personnalisation du robot, exports.",
      },
    ],
  },
};

/** Cibles dans la fiche document (sans changer de vue) */
export const DOC_TOUR_STEPS: TourStep[] = [
  {
    target: "doc-objet",
    script: "L'objet rappelle pourquoi ce document circule.",
  },
  {
    target: "doc-circuit-map",
    script:
      "La carte 3D montre où se trouve le dossier dans le circuit et les étapes encore à parcourir. Cliquez un nœud pour le détail.",
  },
  {
    target: "doc-status",
    script:
      "Ici vous changez le statut : consulté, en cours, ou traité pour votre étape.",
  },
  {
    target: "doc-revision",
    script:
      "Joignez une version modifiée du fichier : même identifiant, le suivi continue. Vous pouvez cocher des tâches pour le suivant.",
  },
];

const HIGHLIGHT_ID = "scandoc-bot-tour-highlight";
const POINTER_ID = "scandoc-bot-tour-pointer";

function ensureOverlayEls() {
  let ring = document.getElementById(HIGHLIGHT_ID);
  if (!ring) {
    ring = document.createElement("div");
    ring.id = HIGHLIGHT_ID;
    ring.setAttribute("aria-hidden", "true");
    ring.style.cssText =
      "position:fixed;z-index:9998;pointer-events:none;border:3px solid #7c3aed;border-radius:14px;box-shadow:0 0 0 6px rgba(124,58,237,0.2),0 12px 40px rgba(0,0,0,0.25);opacity:0;";
    document.body.appendChild(ring);
  }
  let pointer = document.getElementById(POINTER_ID);
  if (!pointer) {
    pointer = document.createElement("div");
    pointer.id = POINTER_ID;
    pointer.setAttribute("aria-hidden", "true");
    pointer.innerHTML =
      '<span style="font-size:32px;filter:drop-shadow(0 3px 6px rgba(0,0,0,.35))">👆</span>';
    pointer.style.cssText =
      "position:fixed;z-index:9999;pointer-events:none;opacity:0;transform:translate(-40%,-10%);";
    document.body.appendChild(pointer);
  }
  return { ring, pointer };
}

export function clearTourVisuals() {
  const ring = document.getElementById(HIGHLIGHT_ID);
  const pointer = document.getElementById(POINTER_ID);
  if (ring) ring.style.opacity = "0";
  if (pointer) pointer.style.opacity = "0";
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
  const pad = 6;
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
      { to: -10, duration: 380, ease: "inOutSine" },
      { to: 0, duration: 380, ease: "inOutSine" },
    ],
    loop: 2,
  });
  animate(ring, {
    scale: [
      { to: 1.02, duration: 450, ease: "inOutSine" },
      { to: 1, duration: 450, ease: "inOutSine" },
    ],
    loop: 2,
  });
}

export type RunTourOpts = {
  botEl: HTMLElement;
  steps: TourStep[];
  onBotMoved?: (x: number, y: number) => void;
  speak?: (text: string) => void;
  onStep?: (step: TourStep, index: number) => void;
};

/**
 * Enchaîne les étapes : déplacement robot → pointage → voix.
 */
export async function runMultiStepTour(opts: RunTourOpts): Promise<void> {
  const { botEl, steps, onBotMoved, speak, onStep } = opts;
  if (!steps.length) return;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    onStep?.(step, i);

    // Attendre le rendu éventuel de la page
    await new Promise((r) => setTimeout(r, i === 0 ? 320 : 200));

    let target = findTarget(step.target);
    // Repli : menu latéral si la cible page n'existe pas encore
    if (!target && step.target.includes("-")) {
      const viewGuess = step.target.split("-")[0];
      target = findTarget(viewGuess || step.target);
    }
    if (!target) {
      // dernier recours : premier élément tour visible
      target = document.querySelector(
        "[data-scandoc-tour]",
      ) as HTMLElement | null;
    }
    if (!target) continue;

    target.scrollIntoView({ behavior: "smooth", block: "center" });
    await new Promise((r) => setTimeout(r, 280));

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

    await new Promise<void>((resolve) => {
      animate(botEl, {
        left: `${destX}px`,
        top: `${destY}px`,
        duration: 900,
        ease: "outBack(1.2)",
        onComplete: () => resolve(),
      });
    });
    onBotMoved?.(destX, destY);
    placeHighlight(target);

    if (speak && step.script) {
      speak(step.script);
    }

    // Durée approximative lecture + marge
    const hold =
      step.holdMs ??
      Math.min(9000, Math.max(2800, 700 + step.script.length * 48));
    await new Promise((r) => setTimeout(r, hold));
  }

  window.setTimeout(() => clearTourVisuals(), 2500);
}

/** @deprecated compat — un seul menu */
export async function runBotTour(opts: {
  botEl: HTMLElement;
  view: TourView;
  onBotMoved?: (x: number, y: number) => void;
  durationMs?: number;
}): Promise<void> {
  const seq =
    TOUR_SEQUENCES[`open_${opts.view}`] ||
    TOUR_SEQUENCES[
      opts.view === "home" ? "open_home" : `open_${opts.view}`
    ];
  const steps = seq?.steps ?? [
    {
      target: opts.view,
      script: `Voici la section ${opts.view}.`,
    },
  ];
  await runMultiStepTour({
    botEl: opts.botEl,
    steps,
    onBotMoved: opts.onBotMoved,
  });
}

export function getTourScript(view: string): string {
  const key = view.startsWith("open_") ? view : `open_${view}`;
  const seq = TOUR_SEQUENCES[key];
  if (!seq) return "";
  return seq.steps.map((s) => s.script).join(" ");
}

export function getSequenceForAction(
  action: string,
): { view: TourView; steps: TourStep[] } | null {
  return TOUR_SEQUENCES[action] ?? null;
}
