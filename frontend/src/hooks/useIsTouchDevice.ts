import { useState, useEffect } from "react";

const QUERY = "(pointer: coarse)";

/**
 * Returns true when the primary input is touch/coarse (phone, tablet).
 * Uses CSS pointer media query — more semantically correct than pixel breakpoints.
 * Reacts to changes (e.g. keyboard docked to iPad switching pointer type).
 */
export function useIsTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(QUERY).matches : false
  );

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const handler = (e: MediaQueryListEvent) => setIsTouch(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return isTouch;
}
