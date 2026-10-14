/**
 * Tour guidé du robot — anime.js
 * Déplace le bot vers un élément [data-scandoc-nav], pointe, surligne, explique.
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

/** Explications vocales détaillées par section */
export const TOUR_SCRIPTS: Record<TourView, string> = {
  home: "Voici le tableau de bord. Vous y voyez un résumé de votre activité : documents à traiter, envois récents et alertes. C'est le point de départ de ScanDoc.",
  send: "Ici, Nouvel envoi. Choisissez un fichier, le destinataire ou un circuit de plusieurs personnes, l'objet, les observations et les tâches comme sur la fiche de transmission, puis envoyez.",
  inbox: "Voici la boîte de réception. Ce sont les documents que l'on vous a transmis. Ouvrez-en un pour le lire, changer le statut, joindre une version modifiée, ou valider votre étape du circuit.",
  sent: "Section Envoyés. Vous retrouvez tout ce que vous avez transmis, avec le statut de chaque dossier et le suivi du circuit si vous en avez défini un.",
  suivi: "Suivi et circuits. Comme le suivi d'un colis : vous voyez où se trouve chaque dossier, quelle étape est en cours, et ce qui reste à faire avant la clôture.",
  fichiers: "Recherche fichiers. Tapez un identifiant du type S D tiret année, un objet ou un nom de fichier pour retrouver rapidement un dossier, l'archiver ou le rouvrir.",
  messages: "Messagerie. Choisissez un collègue pour discuter en direct. Les pastilles rouges indiquent les messages non lus.",
  actualites: "Actualités. Faites défiler le fil d'annonces de l'administration, avec réactions et commentaires, comme un fil d'actualité interne.",
  announcements: "Publier une annonce. Rédigez le titre et le texte, ajoutez éventuellement une photo, choisissez public, privé ou personnalisé, puis publiez.",
  departments: "Départements. Demandez à rejoindre une direction, acceptez une invitation, ou gérez votre groupe si vous êtes chef de département.",
  accounts: "Comptes, réservé au directeur général. Validez ou refusez les inscriptions, et attribuez les droits d'administration.",
  settings: "Paramètres. Profil, sécurité, personnalisation de votre robot assistant, et options d'export.",
};

const HIGHLIGHT_ID = "scandoc-bot-tour-highlight";
const POINTER_ID = "scandoc-bot-tour-pointer";

function ensureOverlayEls() {
  let ring = document.getElementById(HIGHLIGHT_ID);
  if (!ring) {
    ring = document.createElement("div");
    ring.id = HIGHLIGHT_ID;
    ring.setAttribute("aria-hidden", "true");
    ring.style.cssText =
      "position:fixed;z-index:9998;pointer-events:none;border:3px solid #8b5cf6;border-radius:12px;box-shadow:0 0 0 4px rgba(139,92,246,0.25),0 8px 32px rgba(139,92,246,0.35);opacity:0;transition:opacity .2s;";
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
      "position:fixed;z-index:9999;pointer-events:none;opacity:0;transform:translate(-50%,-50%);";
    document.body.appendChild(pointer);
  }
  return { ring, pointer };
}

function clearTourVisuals() {
  const ring = document.getElementById(HIGHLIGHT_ID);
  const pointer = document.getElementById(POINTER_ID);
  if (ring) ring.style.opacity = "0";
  if (pointer) pointer.style.opacity = "0";
}

export type TourOptions = {
  /** Élément du robot flottant (position left/top en px) */
  botEl: HTMLElement;
  view: TourView;
  /** Position actuelle du bot {x,y} — mise à jour à la fin */
  onBotMoved?: (x: number, y: number) => void;
  durationMs?: number;
};

/**
 * Anime le robot jusqu'à la cible menu, pointe du doigt, surligne.
 */
export async function runBotTour(opts: TourOptions): Promise<void> {
  const { botEl, view, onBotMoved, durationMs = 1100 } = opts;
  const target =
    (document.querySelector(
      `[data-scandoc-nav="${view}"]`,
    ) as HTMLElement | null) ||
    (document.querySelector(".sc-nav-item[data-active='true']") as HTMLElement | null);

  if (!target || !botEl) {
    clearTourVisuals();
    return;
  }

  // Attendre rendu sidebar après navigation
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  await new Promise((r) => setTimeout(r, 180));

  const tr = target.getBoundingClientRect();
  const br = botEl.getBoundingClientRect();
  const { ring, pointer } = ensureOverlayEls();

  // Surbrillance menu
  ring.style.left = `${tr.left - 4}px`;
  ring.style.top = `${tr.top - 4}px`;
  ring.style.width = `${tr.width + 8}px`;
  ring.style.height = `${tr.height + 8}px`;
  ring.style.opacity = "1";

  // Position cible : à droite du menu (ou en dessous sur mobile)
  const margin = 12;
  const botW = br.width || 72;
  const botH = br.height || 90;
  let destX = tr.right + margin;
  let destY = tr.top + tr.height / 2 - botH / 2;
  if (destX + botW > window.innerWidth - 8) {
    destX = Math.max(8, tr.left - botW - margin);
  }
  if (destY < 8) destY = 8;
  if (destY + botH > window.innerHeight - 8) {
    destY = window.innerHeight - botH - 8;
  }

  const startLeft = parseFloat(botEl.style.left || String(br.left)) || br.left;
  const startTop = parseFloat(botEl.style.top || String(br.top)) || br.top;

  // Forcer position fixed pendant le tour
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
      duration: durationMs,
      ease: "outExpo",
      onComplete: () => resolve(),
    });
  });

  onBotMoved?.(destX, destY);

  // Pointeur vers le centre de la cible
  const px = tr.left + tr.width * 0.85;
  const py = tr.top + tr.height / 2;
  pointer.style.left = `${px}px`;
  pointer.style.top = `${py}px`;
  pointer.style.opacity = "1";

  animate(pointer, {
    translateY: [
      { to: -8, duration: 400, ease: "inOutSine" },
      { to: 0, duration: 400, ease: "inOutSine" },
    ],
    loop: 3,
  });

  // Pulse sur le ring
  animate(ring, {
    scale: [
      { to: 1.04, duration: 500, ease: "inOutSine" },
      { to: 1, duration: 500, ease: "inOutSine" },
    ],
    loop: 3,
  });

  // Nettoyage après lecture (environ 8s max)
  window.setTimeout(() => clearTourVisuals(), 9000);
}

export function getTourScript(view: string): string {
  return TOUR_SCRIPTS[view as TourView] ?? "";
}
