import { useRef, useState, useEffect } from "react";
function toFiniteNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : void 0;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : void 0;
  }
  return void 0;
}
function useTickFlash(value, durationMs = 700) {
  const numericValue = toFiniteNumber(value);
  const prev = useRef(numericValue);
  const [dir, setDir] = useState(null);
  useEffect(() => {
    if (numericValue === void 0) return;
    const previous = prev.current;
    if (previous !== void 0 && Number.isFinite(previous) && numericValue !== previous) {
      setDir(numericValue > previous ? "up" : "down");
      const t = window.setTimeout(() => setDir(null), durationMs);
      prev.current = numericValue;
      return () => window.clearTimeout(t);
    }
    prev.current = numericValue;
  }, [numericValue, durationMs]);
  return dir;
}
export {
  useTickFlash as u
};
