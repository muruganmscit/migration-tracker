import { ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

// A modal built on the native <dialog>, which handles focus, Esc and blocking the page behind it.
// Portalled to <body> so it can be opened from anywhere, including inside a table row.
export default function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    // The dialog is already out of the page when this cleans up, so the browser can't restore focus itself.
    const opener = document.activeElement as HTMLElement | null;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      dialog?.close();
      opener?.focus();
    };
  }, []);

  return createPortal(
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="panel m-auto w-[calc(100%-2rem)] max-w-2xl max-h-[calc(100vh-2rem)] overflow-y-auto rounded-lg p-6 text-slate-900 backdrop:bg-black/50"
    >
      <div className="flex items-start justify-between gap-4 mb-5">
        <h2 id="dialog-title" className="text-lg font-semibold text-slate-900 break-words min-w-0">
          {title}
        </h2>
        <button type="button" className="text-slate-500 hover:text-slate-700 shrink-0" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>,
    document.body
  );
}
