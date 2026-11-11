import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext.js";
import { fetchGroups, createGroup, joinGroup } from "../lib/api.js";
import { usePageTitle } from "../lib/usePageTitle.js";

export function Groups() {
  usePageTitle("Community Groups & Challenges");
  const { user } = useAuth();
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [newGroupName, setNewGroupName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = () => {
    if (user) {
      fetchGroups()
        .then((res) => setGroups(res as any[]))
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [user]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName) return;
    try {
      await createGroup(newGroupName);
      setNewGroupName("");
      setMsg("Group created successfully!");
      load();
    } catch (err: unknown) {
      setMsg((err as Error).message);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode) return;
    try {
      await joinGroup(joinCode);
      setJoinCode("");
      setMsg("Joined group!");
      load();
    } catch (err: unknown) {
      setMsg((err as Error).message);
    }
  };

  if (!user) {
    return (
      <div className="content-container">
        <h1>Groups & Challenges</h1>
        <p>Please <Link to="/auth/login">sign in</Link> to join community groups and participate in commute challenges.</p>
      </div>
    );
  }

  return (
    <div className="content-container">
      <h1>Groups & Challenges</h1>
      <p className="lead">Join workplaces, university campuses, or neighbourhood commuting circles.</p>

      {msg && <div className="notice">{msg}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "32px" }}>
        <div className="auth-card" style={{ maxWidth: "100%" }}>
          <h3>Create a Group</h3>
          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label htmlFor="group-name">Group Name</label>
              <input
                id="group-name"
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="e.g. Bandra Commuters Club"
                required
              />
            </div>
            <button type="submit" className="button button-primary">Create Group</button>
          </form>
        </div>

        <div className="auth-card" style={{ maxWidth: "100%" }}>
          <h3>Join with Code</h3>
          <form onSubmit={handleJoin}>
            <div className="form-group">
              <label htmlFor="join-code">6-Character Join Code</label>
              <input
                id="join-code"
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="e.g. AB12CD"
                required
              />
            </div>
            <button type="submit" className="button button-secondary">Join Group</button>
          </form>
        </div>
      </div>

      <h2>Your Groups</h2>
      {loading ? (
        <p>Loading your groups...</p>
      ) : groups.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
          {groups.map((g) => (
            <div key={g.id} className="option-card" style={{ cursor: "default" }}>
              <h3>{g.name}</h3>
              <p style={{ fontSize: "13px", color: "#57606a" }}>
                Join Code: <strong>{g.joinCode}</strong> • {g.members.length} members
              </p>
              <Link to={`/groups/${g.id}`} className="button button-secondary" style={{ marginTop: "12px", display: "inline-block" }}>
                View Leaderboard & Challenges
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <p>You are not a member of any group yet. Create one or join with a code above.</p>
      )}
    </div>
  );
}
