import { isTourId, type TourId } from "./tourIds";

/** Read `?tour=`; unknown values → null (no throw, no tour). */
export function parseTourParam(url: URL): TourId | null {
  const raw = url.searchParams.get("tour");
  return isTourId(raw) ? raw : null;
}

/** Return tour id + a cloned URL with `tour` removed (preserves other search + hash). */
export function consumeTourParamFromUrl(url: URL): { tourId: TourId | null; url: URL } {
  const next = new URL(url.href);
  const tourId = parseTourParam(next);
  if (tourId) next.searchParams.delete("tour");
  return { tourId, url: next };
}
