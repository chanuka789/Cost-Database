"use client";

import { Toaster as Sonner } from "sonner";

/** Toasts: dark grey surface with light text in both themes, 10px radius. */
export function Toaster() {
  return (
    <Sonner
      className="toaster"
      position="bottom-right"
      toastOptions={{ unstyled: false, classNames: { toast: "qs-toast" } }}
    />
  );
}
