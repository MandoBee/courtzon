import { useEffect, useRef, useState } from 'react';

/**
 * G11.18 Phase 3 — reusable, KEY-LESS map location picker (Leaflet + OSM).
 *
 * The user NEVER types latitude/longitude:
 *   1. open the map,
 *   2. search for the venue/place (Nominatim/OSM — zero API key),
 *   3. the map centers on the result / the user moves the pin,
 *   4. the system captures city/lat/lng/address automatically,
 *   5. "Confirm Location" returns the resolved venue payload.
 */
export interface PickedLocation {
  venueName?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  mapsUrl?: string | null;
  placeId?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (loc: PickedLocation) => void;
}

const MAPS_URL_FN = (lat: number, lng: number) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;

export default function MapLocationPicker({ open, onClose, onConfirm }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any | null>(null);
  const markerRef = useRef<any | null>(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<PickedLocation[]>([]);
  const [picked, setPicked] = useState<PickedLocation | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load Leaflet on demand exactly like the existing branch location modals.
  async function ensureLeaflet() {
    if ((window as any).L) return (window as any).L;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    document.head.appendChild(script);
    await new Promise((res) => {
      script.onload = res;
      script.onerror = () => setError('Failed to load the map library. Please try again.');
    });
    return (window as any).L;
  }

  useEffect(() => {
    if (!open) return;
    let alive = true;

    (async () => {
      const L = await ensureLeaflet();
      if (!alive || !ref.current) return;
      if (mapRef.current) {
        mapRef.current.invalidateSize();
        return;
      }
      const map = L.map(ref.current, { zoomControl: true, attributionControl: false }).setView([30.0444, 31.2357], 12);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);
      const marker = L.marker([30.0444, 31.2357], { draggable: true }).addTo(map);
      marker.on('dragend', () => {
        const ll = marker.getLatLng();
        setPicked((p) => ({
          ...(p ?? {}),
          latitude: Number(ll.lat.toFixed(6)),
          longitude: Number(ll.lng.toFixed(6)),
          mapsUrl: MAPS_URL_FN(Number(ll.lat.toFixed(6)), Number(ll.lng.toFixed(6))),
        }));
      });
      map.on('click', (e: any) => {
        marker.setLatLng(e.latlng);
        setPicked((p) => ({
          ...(p ?? {}),
          latitude: Number(e.latlng.lat.toFixed(6)),
          longitude: Number(e.latlng.lng.toFixed(6)),
          mapsUrl: MAPS_URL_FN(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))),
        }));
      });
      mapRef.current = map;
      markerRef.current = marker;
    })();

    return () => { alive = false; };
  }, [open]);

  async function search() {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`,
        { headers: { Accept: 'application/json' } },
      );
      const data = await res.json();
      const mapped: PickedLocation[] = (Array.isArray(data) ? data : []).map((r: any) => ({
        venueName: r.display_name?.split(',')[0] ?? null,
        address: r.display_name ?? null,
        city: r.address?.city ?? r.address?.town ?? r.address?.village ?? null,
        country: r.address?.country ?? null,
        latitude: r.lat != null ? Number(Number(r.lat).toFixed(6)) : null,
        longitude: r.lon != null ? Number(Number(r.lon).toFixed(6)) : null,
        placeId: r.osm_id != null ? String(r.osm_id) : null,
        mapsUrl: r.lat != null && r.lon != null ? MAPS_URL_FN(Number(Number(r.lat).toFixed(6)), Number(Number(r.lon).toFixed(6))) : null,
      }));
      setResults(mapped);
    } catch {
      setError('Search failed. Try again or place the pin directly on the map.');
    } finally {
      setSearching(false);
    }
  }

  function selectResult(r: PickedLocation) {
    setPicked(r);
    setResults([]);
    if (mapRef.current && r.latitude != null && r.longitude != null) {
      const ll = { lat: Number(r.latitude), lng: Number(r.longitude) };
      mapRef.current.setView(ll, 16);
      markerRef.current?.setLatLng(ll);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-[var(--color-surface)] w-full max-w-2xl rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-[var(--color-text)]">Select Location on Map</h3>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">✕</button>
        </div>

        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="Search venue / club / address…"
            className="flex-1 px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-input)] text-sm text-[var(--color-text)]"
          />
          <button onClick={search} disabled={searching}
            className="px-4 py-2 bg-[var(--color-primary)] text-white rounded text-sm disabled:opacity-50">
            {searching ? 'Searching…' : 'Search'}
          </button>
        </div>

        {results.length > 0 && (
          <ul className="max-h-40 overflow-y-auto border border-[var(--color-border)] rounded divide-y divide-[var(--color-border)]">
            {results.map((r, i) => (
              <li key={i}>
                <button onClick={() => selectResult(r)}
                  className="w-full text-left px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-2)]">
                  {r.address}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div ref={ref} className="h-72 w-full rounded-lg overflow-hidden" />

        {picked && (
          <div className="text-sm text-[var(--color-text-muted)] space-y-0.5">
            <p><span className="font-medium text-[var(--color-text)]">{picked.venueName ?? 'Selected location'}</span></p>
            {picked.address && <p>{picked.address}</p>}
            {(picked.city || picked.country) && <p>{[picked.city, picked.country].filter(Boolean).join(', ')}</p>}
            {picked.mapsUrl && (
              <a href={picked.mapsUrl} target="_blank" rel="noreferrer"
                className="text-[var(--color-primary)] underline">Open in Maps</a>
            )}
          </div>
        )}
        {error && <p className="text-xs text-[var(--color-error)]">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded text-sm border border-[var(--color-border)] text-[var(--color-text)]">Cancel</button>
          <button
            onClick={() => picked && onConfirm(picked)}
            disabled={!picked}
            className="px-4 py-2 rounded text-sm bg-[var(--color-primary)] text-white disabled:opacity-50">
            Confirm Location
          </button>
        </div>
      </div>
    </div>
  );
}