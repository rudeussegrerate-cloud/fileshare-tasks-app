import { BrandLogo, Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Building2,
  Camera,
  CheckCircle2,
  Crown,
  FileText,
  Gauge,
  Inbox,
  ListChecks,
  Lock,
  ScanLine,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";

const SECTIONS = [
  { id: "fonctionnalites", label: "Fonctionnalités" },
  { id: "parcours", label: "Comment ça marche" },
  { id: "roles", label: "Rôles" },
];

const FEATURES = [
  {
    icon: Send,
    title: "Envoi d'un fichier + tâche",
    text: "L'émetteur dépose le document et précise la tâche exacte à réaliser. Le destinataire sait immédiatement quoi faire.",
  },
  {
    icon: Sparkles,
    title: "Résumé automatique",
    text: "Chaque document reçu arrive avec un résumé de l'essentiel : plus besoin de lire un rapport de 40 pages pour comprendre.",
  },
  {
    icon: Gauge,
    title: "Statut en temps réel",
    text: "Consulté, en cours de traitement, traité : l'émetteur suit l'avancement sans relancer personne.",
  },
  {
    icon: Building2,
    title: "Organisation par département",
    text: "Le destinataire se choisit en deux temps : d'abord le département, puis un membre. Fini les erreurs d'affectation.",
  },
  {
    icon: Lock,
    title: "Accès maîtrisé",
    text: "Seuls les membres d'un département voient les documents qui leur sont adressés.",
  },
  {
    icon: ScanLine,
    title: "Import ou photo",
    text: "PDF, Word, Excel, image ou photo prise au téléphone : jusqu'à 10 Mo par document.",
  },
];

const STEPS = [
  {
    icon: Camera,
    title: "1. Le document",
    text: "Importez un fichier ou prenez une photo du document à transmettre.",
  },
  {
    icon: Building2,
    title: "2. Le département",
    text: "Choisissez le département concerné dans l'organigramme.",
  },
  {
    icon: UserRound,
    title: "3. Le destinataire",
    text: "Sélectionnez le membre qui doit traiter le document.",
  },
  {
    icon: ListChecks,
    title: "4. La tâche",
    text: "Décrivez précisément ce qui est attendu sur ce document.",
  },
  {
    icon: Inbox,
    title: "5. Le suivi",
    text: "Le récepteur consulte le résumé puis met à jour le statut : vous êtes informé.",
  },
];

const ROLES = [
  {
    icon: ShieldCheck,
    title: "Le super utilisateur",
    subtitle: "Root — au-dessus du DG",
    points: [
      "Désigne qui est le DG général",
      "Révoque un DG en cas de besoin",
      "Supervise toute l'organisation",
    ],
  },
  {
    icon: Crown,
    title: "Le DG général",
    subtitle: "Admin principal",
    points: [
      "Valide ou rejette les demandes de compte",
      "Crée les départements de l'entreprise",
      "Désigne le chef de chaque département parmi les comptes validés",
      "Garde une vue d'ensemble des échanges",
    ],
  },
  {
    icon: Users,
    title: "Le chef de département",
    subtitle: "Responsable d'équipe",
    points: [
      "Rattache les membres qui ont déjà un compte",
      "Envoie et reçoit des documents",
      "Suit les tâches de son équipe",
    ],
  },
  {
    icon: UserRound,
    title: "Le membre",
    subtitle: "Collaborateur",
    points: [
      "Crée son compte avec email et mot de passe",
      "Attend la validation du DG avant de rejoindre un département",
      "Reçoit les documents qui lui sont adressés",
      "Lit le résumé automatique avant le document",
    ],
  },
];

export default function Landing() {
  const { isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate("/dashboard", { replace: true });
    }
  }, [isLoading, isAuthenticated, navigate]);

  if (isLoading || isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 lg:px-6">
          <BrandLogo />
          <nav className="hidden items-center gap-7 md:flex">
            {SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {section.label}
              </a>
            ))}
          </nav>
          <Button asChild size="sm" className="gap-2">
            <Link to="/auth">
              Se connecter
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-br from-brand-deep via-brand to-brand-sky/70">
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
              backgroundSize: "22px 22px",
            }}
          />
          <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-4 py-20 lg:grid-cols-[1.05fr_0.95fr] lg:px-6 lg:py-28">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white/90">
                <Sparkles className="size-3.5" />
                Résumé automatique à la réception
              </span>
              <h1 className="mt-6 text-4xl font-bold leading-[1.1] tracking-tight text-white sm:text-5xl">
                Transmettez vos documents entre départements, sans rien perdre
                en route.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-white/75">
                ScanDoc digitalise le circuit du courrier interne : l'émetteur
                dépose un fichier et précise la tâche à réaliser, le
                destinataire reçoit un résumé automatique et met à jour le
                statut du traitement.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button
                  asChild
                  size="lg"
                  className="gap-2 bg-white text-brand hover:bg-white/90"
                >
                  <Link to="/auth">
                    Créer un compte / Se connecter
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
                >
                  <a href="#parcours">Voir le parcours</a>
                </Button>
              </div>
              <dl className="mt-10 grid max-w-lg grid-cols-3 gap-6 border-t border-white/15 pt-6">
                {[
                  { value: "5 étapes", label: "pour un envoi complet" },
                  { value: "10 Mo", label: "par document partagé" },
                  { value: "3 statuts", label: "de suivi du traitement" },
                ].map((item) => (
                  <div key={item.label}>
                    <dt className="text-lg font-semibold text-white">
                      {item.value}
                    </dt>
                    <dd className="text-[11px] leading-tight text-white/60">
                      {item.label}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Product preview mock */}
            <div className="relative">
              <div className="rounded-2xl border border-white/15 bg-white/95 p-4 shadow-2xl">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-brand text-primary-foreground">
                      <FileText className="size-3.5" />
                    </span>
                    <div className="leading-tight">
                      <p className="text-xs font-semibold">
                        Resume_Projet_ScanDoc.docx
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Fichiers de Phoenix · 2,4 Mo
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
                    En cours de traitement
                  </span>
                </div>

                <div className="mt-3 space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Tâche demandée
                  </p>
                  <p className="rounded-lg border-l-4 border-brand-sky bg-brand-soft px-3 py-2 text-[11px] leading-relaxed">
                    Vérifier les montants du budget et renvoyer le fichier
                    corrigé avant vendredi.
                  </p>
                  <p className="flex items-center gap-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <Sparkles className="size-3 text-brand-sky" />
                    Résumé automatique
                  </p>
                  <ul className="space-y-1 rounded-lg border border-border px-3 py-2 text-[11px] leading-relaxed text-foreground/80">
                    <li>• Budget prévisionnel revu à la hausse de 8 %.</li>
                    <li>• Trois postes dépassent l'enveloppe allouée.</li>
                    <li>• Validation attendue avant le comité de direction.</li>
                  </ul>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {["Consulté", "En cours", "Traité"].map((status, index) => (
                    <span
                      key={status}
                      className={
                        index === 1
                          ? "rounded-full bg-brand px-2.5 py-1 text-[10px] font-medium text-primary-foreground"
                          : "rounded-full border border-border px-2.5 py-1 text-[10px] font-medium text-muted-foreground"
                      }
                    >
                      {status}
                    </span>
                  ))}
                </div>
              </div>

              <div className="absolute -bottom-5 -left-4 hidden rounded-xl border border-border bg-white px-3 py-2 shadow-lg sm:block">
                <p className="text-[10px] font-medium text-muted-foreground">
                  Destinataire
                </p>
                <p className="text-xs font-semibold">
                  Finance · M. Kouamé
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="fonctionnalites" className="mx-auto w-full max-w-6xl px-4 py-20 lg:px-6">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-sky">
              Fonctionnalités
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">
              Le circuit du courrier interne, enfin traçable
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              ScanDoc remplace les envois informels par un flux clair : chaque
              document a un émetteur, un destinataire, une tâche, un résumé et
              un statut.
            </p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="rounded-2xl border border-border bg-card p-6 transition-shadow hover:shadow-md"
                >
                  <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-4 text-sm font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {feature.text}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* How it works */}
        <section id="parcours" className="border-y border-border bg-brand-soft/50 py-20">
          <div className="mx-auto w-full max-w-6xl px-4 lg:px-6">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-sky">
                Parcours utilisateur
              </p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight">
                De la connexion à la confirmation d'envoi
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Cinq étapes simples, pensées pour ne jamais se tromper de
                destinataire.
              </p>
            </div>
            <ol className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              {STEPS.map((step, index) => {
                const Icon = step.icon;
                return (
                  <li
                    key={step.title}
                    className="relative rounded-2xl border border-border bg-card p-5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex size-9 items-center justify-center rounded-xl bg-brand text-primary-foreground">
                        <Icon className="size-4" />
                      </span>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Étape {index + 1}
                      </span>
                    </div>
                    <h3 className="mt-3 text-sm font-semibold">{step.title}</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      {step.text}
                    </p>
                  </li>
                );
              })}
            </ol>
            <div className="mt-6 flex items-start gap-2 rounded-xl border-l-4 border-brand-sky bg-card px-4 py-3">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-sky" />
              <p className="text-xs font-medium leading-relaxed">
                Règle fondamentale : le destinataire se choisit toujours en deux
                temps — d'abord le département, puis un membre de ce
                département. Cela évite les erreurs d'affectation.
              </p>
            </div>
          </div>
        </section>

        {/* Roles */}
        <section id="roles" className="mx-auto w-full max-w-6xl px-4 py-20 lg:px-6">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-sky">
              Rôles
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">
              Chacun ses responsabilités
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              L'organisation est structurée dès le départ : le super
              utilisateur désigne le DG, le DG crée les départements et les
              chefs y ajoutent leurs membres.
            </p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {ROLES.map((role) => {
              const Icon = role.icon;
              return (
                <div
                  key={role.title}
                  className="flex flex-col rounded-2xl border border-border bg-card p-6"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-brand text-primary-foreground">
                      <Icon className="size-5" />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold">{role.title}</h3>
                      <p className="text-[11px] text-muted-foreground">
                        {role.subtitle}
                      </p>
                    </div>
                  </div>
                  <ul className="mt-4 space-y-2">
                    {role.points.map((point) => (
                      <li
                        key={point}
                        className="flex items-start gap-2 text-sm text-muted-foreground"
                      >
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>

        {/* CTA */}
        <section className="bg-gradient-to-br from-brand-deep via-brand to-brand-sky/70 py-16">
          <div className="mx-auto flex w-full max-w-4xl flex-col items-center px-4 text-center lg:px-6">
            <h2 className="text-3xl font-bold tracking-tight text-white">
              Prêt à envoyer votre premier document ?
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/75">
              Créez votre compte avec votre email professionnel. Après la
              validation du DG, rejoignez votre département et commencez à
              transmettre vos fichiers en quelques clics.
            </p>
            <Button
              asChild
              size="lg"
              className="mt-7 gap-2 bg-white text-brand hover:bg-white/90"
            >
              <Link to="/auth">
                Se connecter à ScanDoc
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 text-xs text-muted-foreground sm:flex-row lg:px-6">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-lg bg-brand text-primary-foreground">
              <FileText className="size-3" />
            </span>
            ScanDoc — gestion des fichiers inter-départements
          </div>
          <p>Version 1 · envoi d'un fichier + tâche</p>
        </div>
      </footer>
    </div>
  );
}
