import { useEffect } from "react";
import "driver.js/dist/driver.css";
import { useLang } from "../i18n";
import { buildTourSteps } from "./buildTourSteps";
import { consumeTourParamFromUrl } from "./parseTourParam";
import "./tour.css";

/** Starts a short driver.js tour when the URL has `?tour=<id>`; no-op otherwise. */
export default function TourHost() {
  const lang = useLang();

  useEffect(() => {
    const { tourId, url } = consumeTourParamFromUrl(new URL(window.location.href));
    // Strip ?tour= immediately so refresh does not replay forever.
    const cleaned = url.pathname + url.search + url.hash;
    const current = window.location.pathname + window.location.search + window.location.hash;
    if (cleaned !== current) {
      history.replaceState(null, "", cleaned);
    }
    if (!tourId) return;

    let cancelled = false;
    let destroy: (() => void) | undefined;

    (async () => {
      const { driver } = await import("driver.js");
      if (cancelled) return;

      const d = driver({
        showProgress: true,
        animate: true,
        allowClose: true,
        stagePadding: 6,
        popoverClass: "tt-driver-popover",
        nextBtnText: lang === "zh" ? "下一步" : "Next",
        prevBtnText: lang === "zh" ? "上一步" : "Back",
        doneBtnText: lang === "zh" ? "完成" : "Done",
        progressText: lang === "zh" ? "{{current}} / {{total}}" : "{{current}} of {{total}}",
        // Targets may appear a beat after React hydrate.
        waitForElement: 4000,
        steps: buildTourSteps(tourId, lang),
      });
      destroy = () => d.destroy();
      d.drive();
    })().catch((err) => {
      console.warn("[TourHost] failed to start tour", err);
    });

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [lang]);

  return null;
}
