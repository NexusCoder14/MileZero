import { usePageTitle } from "../lib/usePageTitle";
import { Link } from "react-router-dom";

export function NotFound() {
  usePageTitle("Page not found | MileZero");
  return (
    <div className="container section">
      <h1 className="h1-page">Page not found</h1>
      <p className="lede">There is no page at this address.</p>
      <Link className="btn" to="/">Back to home</Link>
    </div>
  );
}
