import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

export function DesignerModal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="modal-layer">
      <button className="modal-backdrop" onClick={onClose} aria-label="关闭弹窗" />
      <section className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="designer-modal-title">
        <header><h2 id="designer-modal-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="关闭" autoFocus><X size={20} /></button></header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}
