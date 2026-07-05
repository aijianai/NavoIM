import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Navigation, Search, X } from "lucide-react";
import { useLocationPicker, type LocationPayload } from "../lib/location-picker";
import { cn } from "../lib/utils";
import { useT, getT } from "../lib/i18n";

const t = getT();

const AMAP_KEY = "ee95e52bf08006f63fd29bcfbcf21df0";
const REST_API_BASE = "https://restapi.amap.com/v5";
const GEOCODE_API = "https://restapi.amap.com/v3/geocode/regeo";

interface PoiItem {
  id: string;
  name: string;
  address: string;
  lng: number;
  lat: number;
}

function searchPlaces(keyword: string, signal: AbortSignal): Promise<PoiItem[]> {
  const params = new URLSearchParams({
    key: AMAP_KEY,
    keywords: keyword,
    page_size: "20",
    page_num: "1",
  });
  return fetch(`${REST_API_BASE}/place/text?${params.toString()}`, { signal })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((res) => {
      if (res.status !== "1" || !Array.isArray(res.pois)) return [];
      return res.pois.map((p: { id?: string; name: string; address?: string; location: string }, i: number) => {
        const [lngStr, latStr] = (p.location ?? "0,0").split(",");
        return {
          id: p.id ?? `poi_${i}`,
          name: p.name,
          address: p.address ?? "",
          lng: Number(lngStr) || 0,
          lat: Number(latStr) || 0,
        };
      });
    });
}

function reverseGeocode(lng: number, lat: number, signal: AbortSignal): Promise<{ name: string; address: string }> {
  const params = new URLSearchParams({
    key: AMAP_KEY,
    location: `${lng},${lat}`,
    radius: "1000",
    extensions: "all",
  });
  return fetch(`${GEOCODE_API}?${params.toString()}`, { signal })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((res) => {
      if (res.status !== "1" || !res.regeocode) {
        return { name: t("location.selected"), address: `${lng.toFixed(5)}, ${lat.toFixed(5)}` };
      }
      const comp = res.regeocode.addressComponent ?? {};
      const name =
        comp.building?.name ||
        comp.neighborhood?.name ||
        comp.streetNumber?.street ||
        comp.township ||
        t("location.selected");
      return { name, address: res.regeocode.formatted_address ?? `${lng.toFixed(5)}, ${lat.toFixed(5)}` };
    })
    .catch(() => ({ name: t("location.selected"), address: `${lng.toFixed(5)}, ${lat.toFixed(5)}` }));
}

function makeStaticMap(lng: number, lat: number, w: number, h: number) {
  return `https://restapi.amap.com/v3/staticmap?location=${lng},${lat}&zoom=16&size=${w}*${h}&markers=mid,,A:${lng},${lat}&key=${AMAP_KEY}`;
}

interface LocationPickerBodyProps {
  embedded?: boolean;
  onClose?: () => void;
}

/**
 * Shared UI for picking a location. Used in two places:
 *  - Desktop: rendered inside a centered modal (`<LocationPickerModal/>`).
 *  - Mobile : rendered as a full-screen page (`<LocationPickerPage/>`).
 *
 * It exposes the same controls either way: a static-map preview at the top
 * (re-fetched when the user picks a result or moves the crosshair), a search
 * field, an explicit "use my current location" button, and a confirm CTA.
 */
export function LocationPickerBody({ embedded, onClose }: LocationPickerBodyProps) {
  const [keyword, setKeyword] = useState("");
  const [poiList, setPoiList] = useState<PoiItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [center, setCenter] = useState<{ lng: number; lat: number } | null>(null);
  const [resolved, setResolved] = useState<{ name: string; address: string } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [permissionAsked, setPermissionAsked] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const closePicker = useLocationPicker((s) => s.closePicker);
  const onConfirm = useLocationPicker((s) => s.onConfirm);
  const t = useT();

  // Try to auto-request location on mount.
  useEffect(() => {
    requestLocate();
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function requestLocate() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocateError(t("location.notSupported"));
      return;
    }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLocating(false);
        setPermissionDenied(false);
        setPermissionAsked(true);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setCenter({ lng, lat });
        abortRef.current?.abort();
        const ac = new AbortController();
        abortRef.current = ac;
        const rev = await reverseGeocode(lng, lat, ac.signal);
        setResolved(rev);
      },
      (err) => {
        setLocating(false);
        setPermissionAsked(true);
        if (err.code === err.PERMISSION_DENIED) {
          setPermissionDenied(true);
          setLocateError(t("location.noPermission"));
        } else if (err.code === err.TIMEOUT) {
          setLocateError(t("location.timeout"));
        } else {
          setLocateError(t("location.failed"));
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  const runSearch = useCallback(async (kw: string) => {
    const term = kw.trim();
    if (!term) {
      setPoiList(null);
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setSearching(true);
    setSearchError(null);
    try {
      const list = await searchPlaces(term, ac.signal);
      setPoiList(list);
    } catch (e) {
      if (!ac.signal.aborted) setSearchError(e instanceof Error ? e.message : t("common.unknown"));
    } finally {
      if (!ac.signal.aborted) setSearching(false);
    }
  }, []);

  function pickPoi(poi: PoiItem) {
    setCenter({ lng: poi.lng, lat: poi.lat });
    setResolved({ name: poi.name, address: poi.address || poi.name });
    setPoiList(null);
    setKeyword(poi.name);
  }

  function confirm() {
    if (!center || !resolved) return;
    const payload: LocationPayload = {
      latitude: center.lat,
      longitude: center.lng,
      name: resolved.name,
      address: resolved.address,
    };
    onConfirm?.(payload);
    closePicker();
  }

  const mapSrc = center
    ? makeStaticMap(center.lng, center.lat, embedded ? 900 : 720, embedded ? 360 : 480)
    : null;

  return (
    <div className={cn("flex h-full flex-col", embedded ? "gap-3" : "gap-4 p-4")}>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              void runSearch(e.target.value);
            }}
            placeholder={t("common.search")}
            className="input-base pl-9"
            autoFocus={!embedded}
          />
          {searching && (
            <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ink-muted" />
          )}
        </div>
        <button
          type="button"
          onClick={requestLocate}
          disabled={locating}
          className="flex shrink-0 items-center gap-1.5 rounded-xl border border-line-light bg-surface px-3 py-2 text-sm text-ink-primary hover:bg-surface-soft disabled:opacity-60"
          title={t("location.useMyLocation")}
        >
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4 text-ocean" />}
          <span className="hidden sm:inline">{locating ? t("location.locating") : t("location.myLocation")}</span>
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-ink-muted hover:bg-surface-soft"
            title={t("common.close")}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {locateError && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {locateError}
          {permissionAsked && permissionDenied && (
            <span className="ml-1 text-ink-muted">{t("location.permissionHint")}</span>
          )}
        </div>
      )}
      {searchError && <div className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{searchError}</div>}

      <div className="relative aspect-[5/3] w-full shrink-0 overflow-hidden rounded-2xl border border-line-light/70 bg-surface-soft">
        {mapSrc ? (
          <img src={mapSrc} alt={t("location.mapPreview")} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-sm text-ink-muted">
            {locating ? t("location.locating") : t("location.noPreview")}
          </div>
        )}
        {center && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-ocean text-white shadow-soft">
              <MapPin className="h-4 w-4" />
            </div>
          </div>
        )}
      </div>

      {resolved && (
        <div className="rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm">
          <div className="font-medium text-ink-primary">{resolved.name}</div>
          {resolved.address && <div className="truncate text-xs text-ink-muted">{resolved.address}</div>}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {poiList === null ? (
          <div className="py-4 text-center text-xs text-ink-muted">
            {t("location.searchHint")}
          </div>
        ) : poiList.length === 0 ? (
          <div className="py-4 text-center text-xs text-ink-muted">{t("common.noData")}</div>
        ) : (
          <ul className="space-y-1">
            {poiList.map((poi) => (
              <li key={poi.id}>
                <button
                  type="button"
                  onClick={() => pickPoi(poi)}
                  className="flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left hover:bg-surface-soft"
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ocean" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink-primary">{poi.name}</div>
                    <div className="truncate text-[11px] text-ink-muted">{poi.address}</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line-light/60 pt-3">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-line-light bg-surface px-4 py-2 text-sm text-ink-primary hover:bg-surface-soft"
          >
            {t("common.cancel")}
          </button>
        )}
        <button
          type="button"
          onClick={confirm}
          disabled={!center || !resolved}
          className="rounded-xl bg-brand-gradient px-4 py-2 text-sm font-medium text-white shadow-soft hover:shadow-glow disabled:opacity-50"
        >
          {t("common.send")}
        </button>
      </div>
    </div>
  );
}
