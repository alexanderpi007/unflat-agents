"use client";

import { useEffect, useRef } from "react";

export function useAccountScroll() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let previous = -1;
    const render = () => {
      frame = 0;
      const bounds = element.getBoundingClientRect();
      const progress = preference.matches ? 0.35 : Math.max(0, Math.min(1, -bounds.top / Math.max(300, bounds.height - innerHeight * 0.65)));
      if (progress === previous) return;
      previous = progress;
      element.style.setProperty("--account-spread", `${12 + progress * 66}px`);
      element.style.setProperty("--account-tilt", `${54 - progress * 18}deg`);
      element.style.setProperty("--account-turn", `${-22 + progress * 17}deg`);
      element.style.setProperty("--account-depth", `${10 + progress * 24}px`);
      element.style.setProperty("--account-progress", String(progress));
      element.dataset.motion = preference.matches ? "reduced" : "scroll";
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(render); };
    const configure = () => {
      window.removeEventListener("scroll", schedule);
      if (!preference.matches) window.addEventListener("scroll", schedule, { passive: true });
      previous = -1;
      schedule();
    };
    configure();
    window.addEventListener("resize", schedule);
    preference.addEventListener("change", configure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      preference.removeEventListener("change", configure);
    };
  }, []);
  return ref;
}
