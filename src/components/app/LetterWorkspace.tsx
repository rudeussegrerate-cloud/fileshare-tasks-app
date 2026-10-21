import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ALL_TEMPLATES,
  wrapLetterHtml,
  type LetterTemplate,
} from "@/lib/letterEditor";
import { cn } from "@/lib/utils";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Download,
  FilePlus2,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Printer,
  Underline,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Éditeur de courrier — page A4 éditable (contentEditable),
 * barre d'outils de mise en forme, modèles optionnels.
 */
export function LetterWorkspace() {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("Nouveau courrier");
  const [zoom, setZoom] = useState(0.95);
  const [showModels, setShowModels] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (editorRef.current && !ready) {
      editorRef.current.innerHTML = ALL_TEMPLATES[0]!.html;
      setReady(true);
    }
  }, [ready]);

  const exec = useCallback((command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
  }, []);

  const applyTemplate = (tpl: LetterTemplate) => {
    if (
      editorRef.current &&
      editorRef.current.innerText.trim().length > 5 &&
      !window.confirm("Remplacer le contenu actuel par ce modèle ?")
    ) {
      return;
    }
    if (editorRef.current) {
      editorRef.current.innerHTML = tpl.html;
      setTitle(tpl.name);
      editorRef.current.focus();
    }
    setShowModels(false);
    toast.success(`Modèle « ${tpl.name} » chargé`);
  };

  const insertImage = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choisissez une image");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error("Image trop lourde (max 4 Mo)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      editorRef.current?.focus();
      document.execCommand(
        "insertHTML",
        false,
        `<img src="${url}" alt="" style="max-width:100%;max-height:220px;display:block;margin:8px auto"/>`,
      );
    };
    reader.readAsDataURL(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const getBodyHtml = () => editorRef.current?.innerHTML ?? "";

  const openPrint = () => {
    const w = window.open("", "_blank");
    if (!w) {
      toast.error("Autorisez les pop-ups pour imprimer / PDF");
      return;
    }
    w.document.write(wrapLetterHtml(title, getBodyHtml()));
    w.document.close();
    w.focus();
    window.setTimeout(() => {
      try {
        w.print();
      } catch {
        /* ignore */
      }
    }, 300);
  };

  const exportHtml = () => {
    const blob = new Blob([wrapLetterHtml(title, getBodyHtml())], {
      type: "text/html;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/\s+/g, "-").slice(0, 40) || "courrier"}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Courrier exporté");
  };

  const ToolBtn = ({
    onClick,
    title: tip,
    children,
  }: {
    onClick: () => void;
    title: string;
    children: React.ReactNode;
  }) => (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="size-8"
      title={tip}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  );

  return (
    <div className="flex h-[calc(100vh-5.5rem)] min-h-[520px] flex-col overflow-hidden rounded-xl border border-border bg-muted/20 shadow-sm">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void insertImage(e.target.files?.[0] ?? null)}
      />

      {/* Barre titre + actions */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="h-9 max-w-[220px] border-0 bg-transparent text-sm font-semibold shadow-none focus-visible:ring-1"
          placeholder="Titre du courrier"
        />
        <Button
          type="button"
          size="sm"
          variant={showModels ? "default" : "outline"}
          onClick={() => setShowModels((v) => !v)}
        >
          <FilePlus2 className="mr-1.5 size-3.5" />
          Modèles
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <ToolBtn title="Zoom −" onClick={() => setZoom((z) => Math.max(0.55, z - 0.08))}>
            <ZoomOut className="size-4" />
          </ToolBtn>
          <span className="w-10 text-center text-[11px] tabular-nums text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <ToolBtn title="Zoom +" onClick={() => setZoom((z) => Math.min(1.3, z + 0.08))}>
            <ZoomIn className="size-4" />
          </ToolBtn>
          <Button type="button" size="sm" variant="outline" onClick={openPrint}>
            <Printer className="mr-1.5 size-3.5" />
            Imprimer / PDF
          </Button>
          <Button type="button" size="sm" onClick={exportHtml}>
            <Download className="mr-1.5 size-3.5" />
            Exporter
          </Button>
        </div>
      </div>

      {/* Mise en forme */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-card/80 px-2 py-1">
        <ToolBtn title="Gras" onClick={() => exec("bold")}>
          <Bold className="size-4" />
        </ToolBtn>
        <ToolBtn title="Italique" onClick={() => exec("italic")}>
          <Italic className="size-4" />
        </ToolBtn>
        <ToolBtn title="Souligné" onClick={() => exec("underline")}>
          <Underline className="size-4" />
        </ToolBtn>
        <span className="mx-1 h-5 w-px bg-border" />
        <ToolBtn title="Aligner à gauche" onClick={() => exec("justifyLeft")}>
          <AlignLeft className="size-4" />
        </ToolBtn>
        <ToolBtn title="Centrer" onClick={() => exec("justifyCenter")}>
          <AlignCenter className="size-4" />
        </ToolBtn>
        <ToolBtn title="Aligner à droite" onClick={() => exec("justifyRight")}>
          <AlignRight className="size-4" />
        </ToolBtn>
        <span className="mx-1 h-5 w-px bg-border" />
        <ToolBtn title="Liste à puces" onClick={() => exec("insertUnorderedList")}>
          <List className="size-4" />
        </ToolBtn>
        <ToolBtn title="Liste numérotée" onClick={() => exec("insertOrderedList")}>
          <ListOrdered className="size-4" />
        </ToolBtn>
        <span className="mx-1 h-5 w-px bg-border" />
        <ToolBtn title="Insérer une image" onClick={() => fileRef.current?.click()}>
          <ImagePlus className="size-4" />
        </ToolBtn>
      </div>

      <div className="flex min-h-0 flex-1">
        {showModels ? (
          <aside className="w-56 shrink-0 overflow-y-auto border-r border-border bg-card p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Modèles
            </p>
            <div className="space-y-2">
              {ALL_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => applyTemplate(tpl)}
                  className="w-full rounded-lg border border-border p-2.5 text-left hover:border-brand/50 hover:bg-brand-soft/30"
                >
                  <p className="text-sm font-semibold">{tpl.name}</p>
                  <p className="text-[11px] text-muted-foreground">{tpl.description}</p>
                </button>
              ))}
            </div>
          </aside>
        ) : null}

        {/* Zone A4 */}
        <div className="min-h-0 flex-1 overflow-auto bg-[#dfe6ee] p-4 md:p-8">
          <div
            className="mx-auto origin-top transition-transform"
            style={{
              width: 680,
              transform: `scale(${zoom})`,
              marginBottom: `${Math.max(0, (zoom - 1) * 180)}px`,
            }}
          >
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-label="Éditeur de courrier"
              className={cn(
                "min-h-[960px] bg-white px-12 py-10 shadow-xl shadow-slate-500/25",
                "font-serif text-[13px] leading-relaxed text-slate-900 outline-none",
                "[&_p]:mb-2.5 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6",
                "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6",
              )}
              style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
