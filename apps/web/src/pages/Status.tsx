import { usePageTitle } from "../lib/usePageTitle.js";
import { useQuery } from "@tanstack/react-query";
import { fetchTransitStatus, fetchHealth, refreshTransitNetwork } from "../lib/api.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { useAuth } from "../lib/AuthContext.js";

const ROWS = [
  ["storage", "Storage Engine", "Reads and writes schema-validated JSON. Needs a writable data directory."],
  ["streetRouting", "Street routing", "Gets walking, cycling and driving geometry. Needs ROUTING_ENGINE_URL and a live provider."],
  ["geocoder", "Place search", "Searches and reverse-geocodes places. Needs GEOCODER_URL and a live provider."],
  ["transit", "Transit network (OpenStreetMap)", "Builds estimated bus, metro and suburban train options from an OpenStreetMap snapshot. Needs a valid snapshot and a successful self-test."],
  ["fareResearch", "Fare research", "Proposes and verifies fare data. Needs GROQ_API_KEY and reachable source pages."],
] as const;

export function Status() {
  usePageTitle("Data status | MileZero");
  const q = useQuery({ queryKey: ["health"], queryFn: fetchHealth, refetchInterval: 30_000 });
  const transit = useQuery({ queryKey: ["transit-status"], queryFn: fetchTransitStatus, refetchInterval: 30_000 });
  const { user } = useAuth();

  return (
    <div className="container section">
      <h1 className="h1-page">Data status</h1>
      <p className="lede">
        What MileZero is connected to right now, checked live. A component that is not set up is reported as not configured, never as working.
      </p>
      {q.isPending && <p role="status">Checking live component health...</p>}
      {q.isError && <p className="alert alert-error" role="alert">{q.error.message}</p>}
      {q.data && (
        <>
          <p className="muted small">
            Overall: <strong>{q.data.status}</strong> &middot; service {q.data.version} &middot; checked{" "}
            {new Date(q.data.time).toLocaleTimeString()}
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Component</th>
                  <th scope="col">Status</th>
                  <th scope="col">Detail</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map(([key, name, what]) => {
                  const c = (q.data.components as any)[key] || { status: "not_configured", detail: "Not set up" };
                  return (
                    <tr key={key}>
                      <th scope="row">
                        {name}
                        <span className="muted small block">{what}</span>
                      </th>
                      <td>
                        <StatusBadge status={c.status} />
                      </td>
                      <td>
                        {c.detail ?? ""}
                        {c.latencyMs != null ? ` (${c.latencyMs} ms)` : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {transit.data && (
            <section>
              <h2>Transit network details</h2>
              <p className="muted">
                Fetch date: {String(transit.data.fetchedAt || "not fetched")} · Routes: {String(transit.data.routeCount || 0)} · Stops: {String(transit.data.stopCount || 0)}
              </p>
              <p>{String(transit.data.message || "")}</p>
              {Boolean(transit.data.lastError) && <p className="alert alert-error">{String(transit.data.lastError)}</p>}
              {user?.role === "admin" && (
                <button className="button button-secondary" type="button" onClick={() => void refreshTransitNetwork()}>
                  Refresh transit network now
                </button>
              )}
            </section>
          )}
          <h2>What the labels mean</h2>
          <dl className="legend">
            <dt>
              <StatusBadge status="ok" />
            </dt>
            <dd>Implemented and verified with a real live check.</dd>
            <dt>
              <StatusBadge status="not_configured" />
            </dt>
            <dd>Implemented but awaiting external data or credentials.</dd>
            <dt>
              <StatusBadge status="down" />
            </dt>
            <dd>Configured, but currently unreachable or answering with an error.</dd>
          </dl>
        </>
      )}
    </div>
  );
}
