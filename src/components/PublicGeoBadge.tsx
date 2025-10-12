import React, { useEffect, useRef } from "react";

type Geo = {
  label: string | null;
  approx?: { lat: number|null; lon: number|null };
  city?: string|null; state?: string|null; country?: string|null;
};

export default function PublicGeoBadge({
  geo, takenAt
}: { geo: Geo|null; takenAt?: string|null }) {
  const mapRef = useRef<HTMLDivElement|null>(null);
  const hasKey = typeof window !== "undefined" && !!process.env.NEXT_PUBLIC_MAPTILER_KEY;

  useEffect(() => {
    if (!geo?.approx || !hasKey || !mapRef.current) return;
    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      const map = new maplibregl.Map({
        container: mapRef.current!,
        style: `https://api.maptiler.com/maps/streets/style.json?key=${process.env.NEXT_PUBLIC_MAPTILER_KEY}`,
        center: [geo.approx.lon!, geo.approx.lat!],
        zoom: 10,
        attributionControl: false,
        interactive: false,
      });
      new maplibregl.Marker({ color: "#222" })
        .setLngLat([geo.approx.lon!, geo.approx.lat!])
        .addTo(map);
      return () => map.remove();
    })();
  }, [geo, hasKey]);

  const label = geo?.label || [geo?.city, geo?.state, geo?.country].filter(Boolean).join(", ");

  return (
    <div className="flex items-center gap-3">
      <div className="rounded-xl overflow-hidden border border-gray-200" style={{ width: 200, height: 120 }}>
        {geo?.approx && hasKey ? (
          <div ref={mapRef} style={{ width: "200px", height: "120px" }} />
        ) : (
          <div className="w-[200px] h-[120px] flex items-center justify-center text-sm text-gray-500 bg-gray-100">
            {label || "Location"}
          </div>
        )}
      </div>
      <div className="text-sm text-gray-700">
        {label ? <div className="font-medium">{label}</div> : null}
        {takenAt ? (
          <div className="text-gray-500">
            Photo taken {new Date(takenAt).toLocaleDateString()}
          </div>
        ) : null}
      </div>
    </div>
  );
}
