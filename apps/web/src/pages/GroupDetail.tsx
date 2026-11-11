import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext.js";
import { fetchGroupDetail, createChallenge } from "../lib/api.js";
import { usePageTitle } from "../lib/usePageTitle.js";

export function GroupDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  );

  usePageTitle(data?.group ? `${data.group.name} | MileZero` : "Group");

  const load = () => {
    if (id) {
      fetchGroupDetail(id)
        .then(setData)
        .catch((err) => setError(err.message || "Failed to load group"))
        .finally(() => setLoading(false));
    }
  };

  useEffect(() => {
    load();
  }, [id, user]);

  const handleCreateChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !title) return;
    try {
      await createChallenge(id, { title, startDate, endDate });
      setTitle("");
      load();
    } catch (err: unknown) {
      alert((err as Error).message || "Failed to create challenge");
    }
  };

  if (loading) {
    return (
      <div className="content-container">
        <h1>Loading group...</h1>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="content-container">
        <h1>Group not found</h1>
        <p className="notice notice-error">
          {error || "You do not have access to this group, or it does not exist."}
        </p>
        <Link to="/groups" className="button button-secondary">
          Back to Groups
        </Link>
      </div>
    );
  }

  return (
    <div className="content-container">
      <Link to="/groups" style={{ fontSize: "13px", color: "#0969da", marginBottom: "16px", display: "inline-block" }}>
        &larr; Back to all groups
      </Link>
      <h1>{data.group.name}</h1>
      <p className="lead">
        Share join code <strong>{data.group.joinCode}</strong> to invite friends or teammates.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "24px" }}>
        <div>
          <h2>Leaderboard</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Member</th>
                <th>Clean Trips</th>
                <th>CO2 Saved</th>
              </tr>
            </thead>
            <tbody>
              {data.leaderboard.map((m: any, idx: number) => (
                <tr key={m.userId}>
                  <td><strong>#{idx + 1}</strong></td>
                  <td>{m.displayName}</td>
                  <td>{m.tripsCount}</td>
                  <td><strong>{Math.round(m.co2SavedKg * 100) / 100} kg</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <h2>Active Challenges</h2>
          {data.challenges && data.challenges.length > 0 ? (
            <div>
              {data.challenges.map((c: any) => (
                <div key={c.id} className="option-card" style={{ marginBottom: "12px", cursor: "default" }}>
                  <h4>{c.title}</h4>
                  <p style={{ fontSize: "13px", color: "#57606a" }}>
                    Runs {c.startDate} to {c.endDate}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p>No active challenges for this group yet.</p>
          )}

          <div className="auth-card" style={{ marginTop: "20px", maxWidth: "100%" }}>
            <h3>Create Challenge</h3>
            <form onSubmit={handleCreateChallenge}>
              <div className="form-group">
                <label htmlFor="ch-title">Title</label>
                <input
                  id="ch-title"
                  type="text"
                  placeholder="e.g. Metro Week Challenge"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="ch-start">Start Date</label>
                <input
                  id="ch-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="ch-end">End Date</label>
                <input
                  id="ch-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="button button-primary">
                Launch Challenge
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

