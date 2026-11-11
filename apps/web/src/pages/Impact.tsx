import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext.js";
import { fetchImpact } from "../lib/api.js";
import { usePageTitle } from "../lib/usePageTitle.js";

export function Impact() {
  usePageTitle("My Carbon Impact");
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchImpact()
        .then(setData)
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [user]);

  if (!user) {
    return (
      <div className="content-container">
        <h1>Carbon Impact & Streaks</h1>
        <p>Please <Link to="/auth/login">sign in</Link> to view your logged journeys and personal carbon savings.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="content-container">
        <h1>Carbon Impact</h1>
        <p>Loading your impact metrics...</p>
      </div>
    );
  }

  return (
    <div className="content-container">
      <h1>My Carbon Impact</h1>
      <p className="lead">Every clean trip reduces urban congestion and harmful tailpipe emissions.</p>

      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-val">{data?.totalCo2SavedKg || 0} kg</span>
          <span className="stat-lbl">Total CO2 Saved</span>
        </div>
        <div className="stat-card">
          <span className="stat-val">{data?.totalDistanceKm || 0} km</span>
          <span className="stat-lbl">Clean Distance</span>
        </div>
        <div className="stat-card">
          <span className="stat-val">{data?.totalTrips || 0}</span>
          <span className="stat-lbl">Logged Trips</span>
        </div>
        <div className="stat-card">
          <span className="stat-val">{data?.streakDays || 0} days</span>
          <span className="stat-lbl">Active Streak</span>
        </div>
      </div>

      <h2>Recent Journeys</h2>
      {data?.recentTrips && data.recentTrips.length > 0 ? (
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Mode</th>
              <th>Distance</th>
              <th>Duration</th>
              <th>CO2 Saved</th>
            </tr>
          </thead>
          <tbody>
            {data.recentTrips.map((t: any) => (
              <tr key={t.id}>
                <td>{t.loggedAt.slice(0, 10)}</td>
                <td><span className="tag">{t.mode.toUpperCase()}</span></td>
                <td>{t.distanceKm} km</td>
                <td>{t.durationMinutes} min</td>
                <td><strong>{t.co2SavedKg} kg</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>You haven't logged any trips yet. Plan a trip on the home page and click "Log this trip".</p>
      )}
    </div>
  );
}

