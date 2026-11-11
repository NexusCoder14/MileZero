import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext.js";
import {
  fetchProposals,
  publishProposal,
  dismissProposal,
  setManualPetrol,
  fetchAuditLog,
  triggerResearch,
  fetchAdminUsers,
  setTemporaryPassword,
} from "../lib/api.js";
import { usePageTitle } from "../lib/usePageTitle.js";

export function Admin() {
  usePageTitle("Administrator Dashboard");
  const { user } = useAuth();

  const [proposals, setProposals] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [people, setPeople] = useState<Array<{ id: string; email: string; displayName: string; role: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const [manualCity, setManualCity] = useState("Mumbai");
  const [manualPrice, setManualPrice] = useState("");
  const [manualNote, setManualNote] = useState("");

  const load = () => {
    if (user?.role === "admin") {
      Promise.all([fetchProposals(), fetchAuditLog(), fetchAdminUsers()])
        .then(([p, a, users]) => {
          setProposals(p as any[]);
          setAuditLogs(a as any[]);
          setPeople(users);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [user]);

  const handlePublish = async (id: string) => {
    try {
      await publishProposal(id);
      setActionMsg("Proposal successfully published to live rates.");
      load();
    } catch (err: unknown) {
      alert((err as Error).message);
    }
  };

  const handleDismiss = async (id: string) => {
    try {
      await dismissProposal(id);
      setActionMsg("Proposal dismissed.");
      load();
    } catch (err: unknown) {
      alert((err as Error).message);
    }
  };

  const handleManualPetrol = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseFloat(manualPrice);
    if (!p) return;
    try {
      await setManualPetrol(manualCity, p, manualNote);
      setActionMsg(`Petrol for ${manualCity} updated to ₹${p} (marked unverified).`);
      setManualPrice("");
      setManualNote("");
      load();
    } catch (err: unknown) {
      alert((err as Error).message);
    }
  };

  const handleTriggerResearch = async () => {
    try {
      await triggerResearch();
      setActionMsg("Automated Groq research triggered in background. Check proposals shortly.");
    } catch (err: unknown) {
      alert((err as Error).message);
    }
  };

  const handleTemporaryPassword = async (id: string) => {
    try {
      const result = await setTemporaryPassword(id);
      setActionMsg(`Temporary password for ${result.displayName}: ${result.temporaryPassword}`);
    } catch (err: unknown) {
      alert((err as Error).message);
    }
  };

  if (!user || user.role !== "admin") {
    return (
      <div className="content-container">
        <h1>Administrator Dashboard</h1>
        <p className="notice notice-error">
          Access restricted. You must be signed in as an administrator to view this area.
        </p>
        <Link to="/auth/login" className="button button-primary">Sign in</Link>
      </div>
    );
  }

  return (
    <div className="content-container">
      <h1>Administrator Dashboard</h1>
      <p className="lead">
        Review fare proposals, trigger verification research, manage manual fuel rates, and inspect the immutable audit log.
      </p>

      {actionMsg && <div className="notice notice-success">{actionMsg}</div>}

      <section>
        <h2>People</h2>
        <table className="table">
          <thead><tr><th>Name</th><th>Login name</th><th>Role</th><th>Account recovery</th></tr></thead>
          <tbody>
            {people.map((person) => (
              <tr key={person.id}>
                <td>{person.displayName}</td>
                <td>{person.email}</td>
                <td>{person.role}</td>
                <td>
                  <button type="button" className="button button-secondary" onClick={() => void handleTemporaryPassword(person.id)}>
                    Set a temporary password
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
        <button type="button" className="button button-primary" onClick={handleTriggerResearch}>
          Run Groq Fare Research Now
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: "24px" }}>
        <div>
          <h2>Research Proposals for Review</h2>
          {proposals.length > 0 ? (
            <div>
              {proposals.map((p) => (
                <div key={p.id} className="option-card" style={{ marginBottom: "16px", cursor: "default" }}>
                  <div className="option-header">
                    <span className="option-title">
                      {p.city} - {p.type.toUpperCase()}: ₹{p.proposedData.perLitre || p.proposedData.fare}
                    </span>
                    <span className="tag">{p.status.toUpperCase()}</span>
                  </div>

                  <p style={{ fontSize: "13px", marginTop: "8px" }}>
                    <strong>Cited Source:</strong>{" "}
                    <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer">
                      {p.sourceUrl}
                    </a>
                  </p>
                  <p style={{ fontSize: "13px", color: "#57606a", fontStyle: "italic" }}>
                    "{p.quote}"
                  </p>

                  <div style={{ fontSize: "13px", marginTop: "8px" }}>
                    <strong>Independent Verification:</strong>{" "}
                    {p.verification.verified ? (
                      <span style={{ color: "#2da44e", fontWeight: 600 }}>VERIFIED</span>
                    ) : (
                      <span style={{ color: "#cf222e", fontWeight: 600 }}>FAILED ({p.verification.reason})</span>
                    )}
                  </div>

                  {p.status === "pending" && (
                    <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                      {p.verification.verified && (
                        <button
                          type="button"
                          className="button button-primary"
                          onClick={() => handlePublish(p.id)}
                        >
                          Approve & Publish
                        </button>
                      )}
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => handleDismiss(p.id)}
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p>No proposals pending review.</p>
          )}

          <h2 style={{ marginTop: "32px" }}>Immutable Audit Log</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.slice(0, 15).map((log: any, idx: number) => (
                <tr key={idx}>
                  <td style={{ fontSize: "12px" }}>{log.at}</td>
                  <td><strong>{log.action}</strong></td>
                  <td style={{ fontSize: "12px" }}>{JSON.stringify(log)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <div className="auth-card" style={{ maxWidth: "100%" }}>
            <h3>Manual Petrol Price Override</h3>
            <p style={{ fontSize: "13px", color: "#57606a" }}>
              Values entered manually are transparently flagged as <em>"not independently checked"</em> in the UI.
            </p>

            <form onSubmit={handleManualPetrol}>
              <div className="form-group">
                <label htmlFor="m-city">City</label>
                <input
                  id="m-city"
                  type="text"
                  value={manualCity}
                  onChange={(e) => setManualCity(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="m-price">Price per litre (₹)</label>
                <input
                  id="m-price"
                  type="number"
                  step="0.01"
                  placeholder="e.g. 111.50"
                  value={manualPrice}
                  onChange={(e) => setManualPrice(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="m-note">Note / Rationale</label>
                <input
                  id="m-note"
                  type="text"
                  placeholder="e.g. Government fuel price notification"
                  value={manualNote}
                  onChange={(e) => setManualNote(e.target.value)}
                />
              </div>
              <button type="submit" className="button button-secondary">
                Set Manual Price
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
