import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { norm, EDIT_FLAG, EDIT_EVENT } from "@/lib/site-texts";

type Info = { orig: string; applied: string };
const SKIP = "script,style,textarea,input,noscript,[data-no-edit]";

function readMode() {
  try {
    return sessionStorage.getItem(EDIT_FLAG) === "1";
  } catch {
    return false;
  }
}

/**
 * Lets an admin click any text on the live site and edit it in place, with
 * no per-string migration of the ~3,000 hardcoded Hebrew strings across
 * this app. Works by walking RENDERED DOM TEXT NODES (not React state or
 * props): matches each node's current text against `site_texts
 * .original_text`, swaps in the admin's `new_text` override if one exists,
 * and re-applies on every DOM change (route navigation, async content)
 * via a MutationObserver. Ported from the exact same working mechanism
 * already shipped on a sibling Lovable project (benoam-siach / Hananya
 * Mense, `claude/edit-texts` branch's `src/components/site-texts.tsx`) —
 * this file mirrors it near-verbatim, swapping that project's
 * AccountContext for this app's useAuth().isAdmin.
 */
export function SiteTexts() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const rows = useQuery({
    queryKey: ["site-texts"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("site_texts").select("original_text,new_text");
      if (error) throw error;
      return data;
    },
  });
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState<{ node: Text; orig: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    const sync = () => setEditing(readMode());
    sync();
    window.addEventListener(EDIT_EVENT, sync);
    return () => window.removeEventListener(EDIT_EVENT, sync);
  }, []);

  // Applies the override map over the live DOM, and keeps re-applying as
  // the DOM changes (SPA navigation, async content) — see this component's
  // own doc comment above for why this walks text nodes instead of
  // wrapping every string in a component.
  useEffect(() => {
    const map = new Map<string, string>((rows.data ?? []).map((r) => [r.original_text, r.new_text]));
    const infos = new WeakMap<Text, Info>();
    let busyApplying = false;
    function origOf(node: Text) {
      const info = infos.get(node);
      return info && node.data === info.applied ? info.orig : node.data;
    }
    function apply(root: Node) {
      busyApplying = true;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
      for (const node of nodes) {
        if (node.parentElement?.closest(SKIP)) continue;
        const orig = origOf(node);
        const key = norm(orig);
        if (!key) continue;
        const replacement = map.get(key);
        const next =
          replacement === undefined
            ? orig
            : orig.replace(/^(\s*)[\s\S]*?(\s*)$/, (_m, a: string, b: string) => a + replacement + b);
        if (next !== node.data) node.data = next;
        infos.set(node, { orig, applied: node.data });
      }
      busyApplying = false;
      (window as unknown as { __textInfos?: WeakMap<Text, Info> }).__textInfos = infos;
    }
    apply(document.body);
    const observer = new MutationObserver((muts) => {
      if (busyApplying) return;
      observer.disconnect();
      for (const m of muts) {
        if (m.type === "characterData") apply(m.target.parentNode ?? document.body);
        else m.addedNodes.forEach((n) => apply(n));
      }
      observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, [rows.data]);

  // Click-to-edit: only active for an admin with edit mode on.
  useEffect(() => {
    document.body.classList.toggle("text-edit-mode", isAdmin && editing);
    if (!isAdmin || !editing) return;
    function pick(e: MouseEvent) {
      const el = e.target as Element | null;
      if (!el || el.closest("[data-no-edit]")) return;
      let node: Text | null = null;
      const doc = document as Document & {
        caretRangeFromPoint?: (x: number, y: number) => Range | null;
        caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node } | null;
      };
      const hit =
        doc.caretRangeFromPoint?.(e.clientX, e.clientY)?.startContainer ??
        doc.caretPositionFromPoint?.(e.clientX, e.clientY)?.offsetNode;
      if (hit && hit.nodeType === Node.TEXT_NODE && el.contains(hit)) node = hit as Text;
      if (!node)
        node =
          (Array.from(el.childNodes).find(
            (n) => n.nodeType === Node.TEXT_NODE && norm((n as Text).data),
          ) as Text | undefined) ?? null;
      if (!node || !norm(node.data)) return;
      e.preventDefault();
      e.stopPropagation();
      const infos = (window as unknown as { __textInfos?: WeakMap<Text, Info> }).__textInfos;
      const info = infos?.get(node);
      const orig = norm(info && node.data === info.applied ? info.orig : node.data);
      setTarget({ node, orig });
      setDraft(norm(node.data));
      setNote("");
    }
    document.addEventListener("click", pick, true);
    return () => document.removeEventListener("click", pick, true);
  }, [isAdmin, editing]);

  async function save(restore: boolean) {
    if (!target) return;
    setBusy(true);
    const res = restore
      ? await supabase.from("site_texts").delete().eq("original_text", target.orig)
      : await supabase
          .from("site_texts")
          .upsert({ original_text: target.orig, new_text: norm(draft), updated_at: new Date().toISOString() });
    setBusy(false);
    if (res.error) {
      setNote("השמירה נכשלה. ודאי שהמיגרציה של site_texts הורצה מול ה-DB.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["site-texts"] });
    setTarget(null);
  }

  function toggle() {
    try {
      sessionStorage.setItem(EDIT_FLAG, editing ? "0" : "1");
    } catch {
      // ignore storage errors (private mode, quota)
    }
    window.dispatchEvent(new Event(EDIT_EVENT));
  }

  if (!isAdmin) return null;
  return (
    <div data-no-edit className="text-edit-ui">
      <button type="button" className="text-edit-fab" onClick={toggle} aria-pressed={editing}>
        {editing ? <X size={16} /> : <Pencil size={16} />}
        {editing ? "סיום עריכת טקסטים" : "עריכת טקסטים"}
      </button>
      {editing && !target && <div className="text-edit-hint">לחצי על כל טקסט באתר כדי לערוך אותו</div>}
      {target && (
        <div className="text-edit-dialog" role="dialog" aria-label="עריכת טקסט">
          <label htmlFor="text-edit-area">עריכת טקסט</label>
          <textarea id="text-edit-area" value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} autoFocus />
          {note && <p className="text-edit-note">{note}</p>}
          <div className="text-edit-actions">
            <button type="button" disabled={busy || !norm(draft)} onClick={() => void save(false)}>
              שמירה
            </button>
            <button type="button" disabled={busy} onClick={() => void save(true)}>
              החזרת המקור
            </button>
            <button type="button" disabled={busy} onClick={() => setTarget(null)}>
              ביטול
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
