import { useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/AuthContext.js";
import {
  searchPlaces,
  reversePlace,
  planJourney,
  logTrip,
  Place,
} from "../lib/api.js";
import { MapView } from "../components/MapView.js";
import { PlanResult, PlanOption } from "@milezero/shared";
import { usePageTitle } from "../lib/usePageTitle.js";

export function Home() {
  usePageTitle("Journey Planner");
  const { user } = useAuth();

  const [fromQuery, setFromQuery] = useState("");
  const [toQuery, setToQuery] = useState("");
  const [fromPlace, setFromPlace] = useState<Place | null>({
    id: "mumbai_cst",
    name: "CSMT Station, Mumbai",
    displayName: "Chhatrapati Shivaji Maharaj Terminus, Fort, Mumbai",
    lat: 18.9401,
    lon: 72.8347,
  });
  const [toPlace, setToPlace] = useState<Place | null>({
    id: "mumbai_bandra",
    name: "Bandra Station, Mumbai",
    displayName: "Bandra Railway Station, Bandra West, Mumbai",
    lat: 19.0544,
    lon: 72.8402,
  });

  const [fromSuggestions, setFromSuggestions] = useState<Place[]>([]);
  const [toSuggestions, setToSuggestions] = useState<Place[]>([]);
  const [activeSuggestion, setActiveSuggestion] = useState<"from" | "to" | null>(null);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [moreOptions, setMoreOptions] = useState(false);
  const [occupancy, setOccupancy] = useState(1);
  const [suggestionBanner, setSuggestionBanner] = useState<string | null>(null);
  const fromSearchId = useRef(0);
  const toSearchId = useRef(0);

  const [loading, setLoading] = useState(false);
  const [planResult, setPlanResult] = useState<PlanResult | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [logSuccessMessage, setLogSuccessMessage] = useState<string | null>(null);
  const [logErrorMessage, setLogErrorMessage] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = fromQuery.trim();
    const id = ++fromSearchId.current;
    if (query.length < 2) { setFromSuggestions([]); return; }
    const timer = window.setTimeout(() => searchPlaces(query).then((r) => {
      if (id === fromSearchId.current) setFromSuggestions(r);
    }).catch(() => setFromSuggestions([])), 300);
    return () => window.clearTimeout(timer);
  }, [fromQuery]);

  useEffect(() => {
    const query = toQuery.trim();
    const id = ++toSearchId.current;
    if (query.length < 2) { setToSuggestions([]); return; }
    const timer = window.setTimeout(() => searchPlaces(query).then((r) => {
      if (id === toSearchId.current) setToSuggestions(r);
    }).catch(() => setToSuggestions([])), 300);
    return () => window.clearTimeout(timer);
  }, [toQuery]);

  const choosePlace = (which: "from" | "to", place: Place) => {
    if (which === "from") { setFromPlace(place); setFromQuery(place.name); setFromSuggestions([]); }
    else { setToPlace(place); setToQuery(place.name); setToSuggestions([]); }
    setActiveSuggestion(null);
    setActiveSuggestionIndex(-1);
  };

  const handlePlaceKey = (event: React.KeyboardEvent<HTMLInputElement>, which: "from" | "to") => {
    const suggestions = which === "from" ? fromSuggestions : toSuggestions;
    if (event.key === "Escape") { setActiveSuggestion(null); setActiveSuggestionIndex(-1); return; }
    if (!suggestions.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const current = activeSuggestion === which ? activeSuggestionIndex : -1;
      const next = event.key === "ArrowDown" ? (current + 1) % suggestions.length : (current - 1 + suggestions.length) % suggestions.length;
      setActiveSuggestion(which);
      setActiveSuggestionIndex(next);
      (document.getElementById(`${which}-suggestion-${next}`) as HTMLElement | null)?.focus();
    }
    if (event.key === "Enter" && activeSuggestion === which) {
      event.preventDefault();
      choosePlace(which, suggestions[activeSuggestionIndex >= 0 ? activeSuggestionIndex : 0]!);
    }
  };

  // Map click handler (sets From then To)
  const handleMapClick = async (lat: number, lon: number) => {
    try {
      const place = await reversePlace(lat, lon);
      if (!fromPlace || (fromPlace && toPlace)) {
        setFromPlace(place);
        setFromQuery(place.name);
        setToPlace(null);
        setToQuery("");
      } else {
        setToPlace(place);
        setToQuery(place.name);
      }
    } catch {
      // fallback
    }
  };

  // Run Plan
  const handlePlan = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!fromPlace || !toPlace) return;

    setLoading(true);
    setLogSuccessMessage(null);
    setLogErrorMessage(null);
    try {
      const result = await planJourney({
        from: { lat: fromPlace.lat, lon: fromPlace.lon, name: fromPlace.name },
        to: { lat: toPlace.lat, lon: toPlace.lon, name: toPlace.name },
        preferences: { occupancy },
      });
      setPlanResult(result);
      setSuggestionBanner(result.options.find((option) => option.nudge)?.nudge || null);
      if (result.options.length > 0 && result.options[0]) {
        setSelectedOptionId(result.options[0].id);
      }
      window.setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    } catch (err: unknown) {
      alert((err as Error).message || "Journey planning failed");
    } finally {
      setLoading(false);
    }
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      try {
        const place = await reversePlace(coords.latitude, coords.longitude);
        choosePlace("from", place);
      } catch { /* keep the existing origin */ }
    });
  };

  // Log Trip
  const handleLogTrip = async (option: PlanOption) => {
    if (!option.token) return;
    setLogSuccessMessage(null);
    setLogErrorMessage(null);

    try {
      await logTrip(option.token);
      setLogSuccessMessage(`Logged trip: ${option.label}. CO2 saved added to your impact!`);
    } catch (err: unknown) {
      setLogErrorMessage((err as Error).message || "Could not log trip.");
    }
  };

  const selectedOption = planResult?.options.find((o) => o.id === selectedOptionId) || planResult?.options[0];
  const selectedGeometry = selectedOption?.legs.flatMap((l) => l.geometry || []) || null;

  return (
    <div className="planner-page">
      <div className="planner-header">
        <h1>Every journey. A better way.</h1>
        <p className="lead">
          Compare walking, cycling, bus, metro, suburban train and driving by time, fare and CO2.
        </p>
      </div>

      <div className="planner-layout">
        {/* Left Panel: Inputs & Option Cards */}
        <div className="planner-controls">
          <form className="plan-form" onSubmit={handlePlan}>
            <div className="form-group" style={{ position: "relative" }}>
              <label htmlFor="from-input">From</label>
              <input
                id="from-input"
                type="text"
                placeholder="Origin location or station"
                value={fromQuery || fromPlace?.name || ""}
                onChange={(e) => { setFromQuery(e.target.value); setFromPlace(null); setActiveSuggestion("from"); }}
                onFocus={() => setActiveSuggestion("from")}
                onKeyDown={(e) => handlePlaceKey(e, "from")}
                aria-controls="from-suggestions"
                aria-autocomplete="list"
                aria-activedescendant={activeSuggestion === "from" && activeSuggestionIndex >= 0 ? `from-suggestion-${activeSuggestionIndex}` : undefined}
                required
              />
              <button type="button" className="location-button" onClick={useCurrentLocation}>Use current location</button>
              {fromSuggestions.length > 0 && (
                <ul className="suggestions-list" id="from-suggestions" role="listbox">
                  {fromSuggestions.map((s, index) => (
                    <li
                      key={s.id}
                      id={`from-suggestion-${index}`} role="option" tabIndex={0}
                      onClick={() => choosePlace("from", s)}
                      onKeyDown={(e) => { if (e.key === "Enter") choosePlace("from", s); }}
                    >
                      <strong>{s.name}</strong>
                      <span className="sub">{s.displayName}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="form-group" style={{ position: "relative" }}>
              <label htmlFor="to-input">To</label>
              <input
                id="to-input"
                type="text"
                placeholder="Destination location or station"
                value={toQuery || toPlace?.name || ""}
                onChange={(e) => { setToQuery(e.target.value); setToPlace(null); setActiveSuggestion("to"); }}
                onFocus={() => setActiveSuggestion("to")}
                onKeyDown={(e) => handlePlaceKey(e, "to")}
                aria-controls="to-suggestions"
                aria-autocomplete="list"
                aria-activedescendant={activeSuggestion === "to" && activeSuggestionIndex >= 0 ? `to-suggestion-${activeSuggestionIndex}` : undefined}
                required
              />
              {toSuggestions.length > 0 && (
                <ul className="suggestions-list" id="to-suggestions" role="listbox">
                  {toSuggestions.map((s, index) => (
                    <li
                      key={s.id}
                      id={`to-suggestion-${index}`} role="option" tabIndex={0}
                      onClick={() => choosePlace("to", s)}
                      onKeyDown={(e) => { if (e.key === "Enter") choosePlace("to", s); }}
                    >
                      <strong>{s.name}</strong>
                      <span className="sub">{s.displayName}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button type="submit" className="button button-primary" disabled={loading}>
              {loading ? "Comparing routes..." : "Find best route"}
            </button>
            <button type="button" className="button button-secondary more-options-toggle" aria-expanded={moreOptions} onClick={() => setMoreOptions((v) => !v)}>
              More options
            </button>
            {moreOptions && (
              <div className="more-options">
                <label htmlFor="occupancy">People in vehicle</label>
                <select id="occupancy" value={occupancy} onChange={(e) => setOccupancy(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            )}
          </form>

          {planResult?.notices && planResult.notices.length > 0 && (
            <div className="planner-notices">
              {planResult.notices.map((n, i) => (
                <div key={i} className="notice">
                  {n}
                </div>
              ))}
            </div>
          )}

          {logSuccessMessage && <div className="notice notice-success">{logSuccessMessage}</div>}
          {logErrorMessage && <div className="notice notice-error">{logErrorMessage}</div>}

          </div>

        {/* Results are intentionally outside the controls column so the grid spans the page. */}
        {planResult && (
            <div className="results-section" ref={resultsRef}>
              <h2>Ranked Options</h2>
              {suggestionBanner && <div className="suggestion-banner" role="status">{suggestionBanner}</div>}
              <div className="results-grid">
              {planResult.options.map((opt) => {
                const isSelected = opt.id === selectedOptionId;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={isSelected}
                    className={`option-card ${isSelected ? "selected" : ""}`}
                    onClick={() => setSelectedOptionId(opt.id)}
                  >
                    <div className="option-header">
                      <span className="option-title">{opt.label}</span>
                      <div className="tags">
                        {opt.tags?.slice(0, 2).map((t, idx) => (
                          <span key={idx} className="tag">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="option-metrics">
                      <div className="metric">
                        <span className="val">{Math.round(opt.durationMinutes)} min</span>
                        <span className="lbl">Travel time</span>
                      </div>
                      <div className="metric">
                        <span className="val">{opt.cost !== null ? `Rs ${Math.round(opt.cost)}` : "Rs -"}</span>
                        <span className="lbl">Fare / Fuel</span>
                      </div>
                      <div className="metric">
                        <span className="val">{opt.co2Kg.toFixed(2)} kg</span>
                        <span className="lbl">CO2 emitted</span>
                      </div>
                    </div>

                    <div className="option-comparison">
                      {opt.id === "opt-car" ? "Baseline vehicle journey" : `${Math.max(0, Math.round(opt.durationMinutes - (planResult.options.find((item) => item.id === "opt-car")?.durationMinutes || opt.durationMinutes)))} min difference from your vehicle`}
                    </div>

                  </button>
                );
              })}
              </div>
              {selectedOption && <div className="option-details detail-panel">
                <h3>{selectedOption.label} details & working</h3>
                {selectedOption.note && <p className="notice">{selectedOption.note}</p>}
                <div className="detail-columns">
                  <div className="legs">{selectedOption.legs.map((leg, i) => <div key={i} className="leg-item"><span className="leg-mode">{leg.mode.toUpperCase()}</span>: {leg.distanceKm.toFixed(1)} km ({Math.round(leg.durationMinutes)} min){leg.line && <div>Line: {leg.line}</div>}{leg.operator && <div>Operator: {leg.operator}</div>}{leg.fromName && <div>{leg.fromName} to {leg.toName}</div>}{leg.stopsCount != null && <div>Stops passed: {leg.stopsCount}</div>}{leg.note && <div>{leg.note}</div>}</div>)}</div>
                  <div className="calculation-notes">
                    <p><strong>Calculation</strong></p>
                    <p>Distance: {selectedOption.distanceKm.toFixed(1)} km</p>
                    <p>Cost: {selectedOption.cost === null ? "Unavailable" : `Rs ${Math.round(selectedOption.cost)}`}</p>
                    <p>CO2: {selectedOption.co2Kg.toFixed(2)} kg</p>
                    {selectedOption.legs.flatMap((leg) => leg.fareInfo?.sourceUrl ? [leg.fareInfo] : []).map((source, i) => <p className="fare-source" key={i}>Fare source: <a href={source.sourceUrl} target="_blank" rel="noreferrer">{source.sourceTitle || source.sourceUrl}</a></p>)}
                  </div>
                </div>
                <button type="button" className="button button-secondary" onClick={() => handleLogTrip(selectedOption)}>Log this trip</button>
              </div>}
            </div>
          )}

        {/* Right Panel: Map */}
        <div className="planner-map">
          <MapView
            from={fromPlace}
            to={toPlace}
            selectedGeometry={selectedGeometry}
            selectedMode={selectedOption?.mode}
            onMapClick={handleMapClick}
          />
        </div>
      </div>
    </div>
  );
}
