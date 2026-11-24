"use client";

import { useEffect, useRef } from "react";
import { Icon } from "./icons";

export function Dialog({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      className={`dialog ${wide ? "wide" : ""}`}
      ref={ref}
      onCancel={close}
      aria-labelledby="dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="dialog-heading">
        <h2 id="dialog-title">{title}</h2>
        <button
          className="icon-button"
          onClick={close}
          aria-label="閉じる"
          autoFocus
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
