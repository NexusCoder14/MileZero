import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface MapViewProps {
  from?: { lat: number; lon: number; name?: string } | null;
  to?: { lat: number; lon: number; name?: string } | null;
  selectedGeometry?: [number, number][] | null;
  selectedMode?: string;
  tileUrlTemplate?: string;
  tileAttribution?: string;
  onMapClick?: (lat: number, lon: number) => void;
}

export function MapView({
  from,
  to,
  selectedGeometry,
  selectedMode,
  tileUrlTemplate = "https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png",
  tileAttribution = '&copy; OpenStreetMap France | &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  onMapClick,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const fromMarkerRef = useRef<L.Marker | null>(null);
  const toMarkerRef = useRef<L.Marker | null>(null);
  const routeOutlineRef = useRef<L.Polyline | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const animMarkerRef = useRef<L.CircleMarker | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const [isAnimationPaused, setIsAnimationPaused] = useState(false);
  const markerIcon = L.divIcon({
    className: "milezero-map-marker",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

  // Check user prefers-reduced-motion
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mediaQuery.matches) {
      setIsAnimationPaused(true);
    }
  }, []);

  // 1. Initialize Map (Default centered on Mumbai: 18.98, 72.83)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [18.98, 72.83],
      zoom: 12,
    });

    L.tileLayer(tileUrlTemplate, {
      attribution: tileAttribution,
      maxZoom: 19,
    }).addTo(map);

    map.on("click", (e: L.LeafletMouseEvent) => {
      if (onMapClick) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 2. Update Origin / Destination Markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Origin
    if (from) {
      if (!fromMarkerRef.current) {
        fromMarkerRef.current = L.marker([from.lat, from.lon], {
          title: from.name || "Origin",
          icon: markerIcon,
        }).addTo(map);
      } else {
        fromMarkerRef.current.setLatLng([from.lat, from.lon]);
      }
    } else if (fromMarkerRef.current) {
      fromMarkerRef.current.remove();
      fromMarkerRef.current = null;
    }

    // Destination
    if (to) {
      if (!toMarkerRef.current) {
        toMarkerRef.current = L.marker([to.lat, to.lon], {
          title: to.name || "Destination",
          icon: markerIcon,
        }).addTo(map);
      } else {
        toMarkerRef.current.setLatLng([to.lat, to.lon]);
      }
    } else if (toMarkerRef.current) {
      toMarkerRef.current.remove();
      toMarkerRef.current = null;
    }

    // Fit bounds if both exist and no route
    if (from && to && !selectedGeometry) {
      map.fitBounds(
        L.latLngBounds([
          [from.lat, from.lon],
          [to.lat, to.lon],
        ]),
        { padding: [40, 40] }
      );
    }
  }, [from, to]);

  // 3. Draw Selected Route Geometry & Animated Vehicle Marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (routeOutlineRef.current) {
      routeOutlineRef.current.remove();
      routeOutlineRef.current = null;
    }
    if (routeLineRef.current) {
      routeLineRef.current.remove();
      routeLineRef.current = null;
    }
    if (animMarkerRef.current) {
      animMarkerRef.current.remove();
      animMarkerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    if (!selectedGeometry || selectedGeometry.length < 2) return;

    // Spec colors:
    // walk: #6B7A73 dashed
    // cycle: #1FA971
    // bus: #E08A1E
    // metro: #3B82F6
    // train: #C2410C
    // car: --text
    const isDark = document.documentElement.dataset.theme === "dark" || 
      (!document.documentElement.dataset.theme && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const textColor = isDark ? "#E8EEEB" : "#161A18";
    const bgColor = isDark ? "#0F1412" : "#F4F6F5";

    let color = textColor;
    let isDashed = false;

    if (selectedMode === "walk") {
      color = "#6B7A73";
      isDashed = true;
    } else if (selectedMode === "cycle") {
      color = "#1FA971";
    } else if (selectedMode === "bus") {
      color = "#E08A1E";
    } else if (selectedMode === "metro") {
      color = "#3B82F6";
    } else if (selectedMode === "train" || selectedMode === "transit") {
      color = "#C2410C";
    } else {
      color = textColor;
    }

    // 2 px outline in --bg to separate from the tiles
    const outline = L.polyline(selectedGeometry, {
      color: bgColor,
      weight: 8,
      opacity: 1,
    }).addTo(map);
    routeOutlineRef.current = outline;

    const line = L.polyline(selectedGeometry, {
      color,
      weight: 4,
      opacity: 0.95,
      dashArray: isDashed ? "8, 6" : undefined,
    }).addTo(map);
    routeLineRef.current = line;

    map.fitBounds(line.getBounds(), { padding: [50, 50] });

    // Animated vehicle dot marker
    const dot = L.circleMarker(selectedGeometry[0] as [number, number], {
      radius: 6,
      color: "#ffffff",
      fillColor: color,
      fillOpacity: 1,
      weight: 2,
    }).addTo(map);
    animMarkerRef.current = dot;

    let startTime: number | null = null;
    const duration = 6000; // 6 seconds per loop

    const step = (timestamp: number) => {
      if (isAnimationPaused) return;
      if (!startTime) startTime = timestamp;
      const progress = ((timestamp - startTime) % duration) / duration;

      const totalSegments = selectedGeometry.length - 1;
      const exactIndex = progress * totalSegments;
      const segIndex = Math.floor(exactIndex);
      const segProgress = exactIndex - segIndex;

      const p1 = selectedGeometry[segIndex];
      const p2 = selectedGeometry[Math.min(segIndex + 1, totalSegments)];

      if (p1 && p2) {
        const curLat = p1[0] + (p2[0] - p1[0]) * segProgress;
        const curLon = p1[1] + (p2[1] - p1[1]) * segProgress;
        dot.setLatLng([curLat, curLon]);
      }

      animFrameRef.current = requestAnimationFrame(step);
    };

    if (!isAnimationPaused) {
      animFrameRef.current = requestAnimationFrame(step);
    }

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [selectedGeometry, selectedMode, isAnimationPaused]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: "420px" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%", minHeight: "420px" }} />
      {selectedGeometry && selectedGeometry.length > 0 && (
        <button
          type="button"
          onClick={() => setIsAnimationPaused((prev) => !prev)}
          className="button button-secondary"
          style={{
            position: "absolute",
            bottom: "12px",
            right: "12px",
            zIndex: 1000,
            fontSize: "12px",
            padding: "4px 10px",
          }}
        >
          {isAnimationPaused ? "Play vehicle replay" : "Pause vehicle replay"}
        </button>
      )}
    </div>
  );
}
