import { X } from "lucide-react";

export function GmailOverlay({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-[220] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="relative w-full max-w-5xl h-[85vh] bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b bg-cream text-primary text-sm">
          <span className="font-medium">שליחת ההזמנה דרך Gmail</span>
          <div className="flex items-center gap-2">
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs underline text-primary/70 hover:text-primary">
              פתחי בכרטיסייה חדשה
            </a>
            <button type="button" onClick={onClose} className="h-8 w-8 rounded-full hover:bg-primary/10 flex items-center justify-center" aria-label="סגור">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <iframe src={url} title="Gmail Compose" className="flex-1 w-full" />
      </div>
    </div>
  );
}
