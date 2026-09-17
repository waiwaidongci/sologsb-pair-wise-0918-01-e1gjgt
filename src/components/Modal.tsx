import type { ReactNode } from "react";
import type { OrderStatus } from "../types";

export const STATUS_META: Record<OrderStatus, { label: string; cls: string }> = {
  queued: { label: "待充填", cls: "st-queued" },
  inspection: { label: "送检区", cls: "st-inspection" },
  filling: { label: "充填中", cls: "st-filling" },
  rework: { label: "返工", cls: "st-rework" },
  delivered: { label: "已交付", cls: "st-delivered" },
};

export function Modal({
  title,
  onClose,
  children,
  width = 520,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  return (
    <div className="modal-mask" onMouseDown={onClose}>
      <div className="modal" style={{ width }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="m-field">
      <span>
        {label}
        {hint && <em>{hint}</em>}
      </span>
      {children}
    </label>
  );
}
