import { usePageTitle } from "../lib/usePageTitle.js";

export function About() {
  usePageTitle("How MileZero Works");

  return (
    <div className="content-container">
      <h1>How Every Number Is Calculated</h1>
      <p className="lead">
        MileZero is built on transparency. We do not invent numbers or guess missing data. Every calculation uses published research factors and official distance slabs.
      </p>

      <h2>1. Carbon Dioxide (CO2) Emissions</h2>
      <p>
        Tailpipe and operational greenhouse gas emissions are calculated per leg:
      </p>
      <ul>
        <li>
          <strong>Walking and Cycling:</strong> 0.000 kg CO2. Completely zero-emission travel.
        </li>
        <li>
          <strong>Suburban Trains (Mumbai Local):</strong> 0.007976 kg CO2 per passenger-km. Sourced from the India GHG Program Technical Paper on Railway Transport.
        </li>
        <li>
          <strong>Metro & Light Rail:</strong> 0.02929 kg CO2 per passenger-km. Sourced from The Energy and Resources Institute (TERI) Report 2020UD02.
        </li>
        <li>
          <strong>CNG Buses (BEST):</strong> 0.02948 kg CO2 per passenger-km. Sourced from TERI Report 2020UD02, Table 4.2.
        </li>
        <li>
          <strong>Private Vehicles (Cars):</strong> Distance multiplied by published vehicle factor (e.g. 0.127 to 0.166 kg CO2/km depending on body class and engine size), divided by vehicle occupancy. Sourced from India GHG Program Road Transport Technical Paper.
        </li>
      </ul>

      <h2>2. Fares and Fuel Cost</h2>
      <p>
        Fares are computed deterministically using distance slab tables published by transit authorities (BEST bus fare charts, MMRDA metro slabs, Metro Line 1 fare brackets).
      </p>
      <p>
        Private vehicle travel cost is computed as <code>(Distance / Mileage km/L) * Petrol price per litre + Parking</code>. Current Mumbai petrol price is tracked and independently verified from official fuel trackers.
      </p>

      <h2>3. Independent Verification & Governance</h2>
      <p>
        When automated fare research runs via Groq, the model only proposes a number and a source URL. The server then independently downloads the cited source page over HTTPS, checks for SSRF vulnerabilities, and confirms that the exact numbers and city appear on the live page. No proposal is published without verification and manual administrator approval.
      </p>
    </div>
  );
}

export function FaresAndFactors() {
  usePageTitle("Fares & Factors");

  return (
    <div className="content-container">
      <h1>Published Fares & Emission Factors</h1>
      <p className="lead">Detailed documentation of every reference factor, slab table, and cited source.</p>

      <h2>Public Transport Emission Factors</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Mode</th>
            <th>Factor (kg CO2 / pkm)</th>
            <th>Basis</th>
            <th>Source Document</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Bus (CNG)</td>
            <td>0.02948</td>
            <td>Delhi DTC & cluster buses, CNG</td>
            <td>TERI Report No. 2020UD02, Table 4.2</td>
          </tr>
          <tr>
            <td>Metro / Light Rail</td>
            <td>0.02929</td>
            <td>Traction electricity incl. renewables</td>
            <td>TERI Report No. 2020UD02, Table 4.6</td>
          </tr>
          <tr>
            <td>Suburban Train</td>
            <td>0.007976</td>
            <td>Indian Railways suburban passenger services</td>
            <td>India GHG Program, Railway Transport Paper</td>
          </tr>
        </tbody>
      </table>

      <h2>Private Vehicle Emission Factors</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Vehicle Type</th>
            <th>Emissions (kg CO2/km)</th>
            <th>Efficiency (km/L)</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Petrol hatchback (&le; 1000 cc)</td>
            <td>0.127</td>
            <td>16.42</td>
            <td>India GHG Program (8% real-world uplift)</td>
          </tr>
          <tr>
            <td>Petrol hatchback (&le; 1400 cc)</td>
            <td>0.140</td>
            <td>16.42</td>
            <td>India GHG Program</td>
          </tr>
          <tr>
            <td>Petrol sedan (&le; 1400 cc)</td>
            <td>0.153</td>
            <td>14.90</td>
            <td>India GHG Program</td>
          </tr>
          <tr>
            <td>Petrol compact SUV (&le; 1600 cc)</td>
            <td>0.166</td>
            <td>11.60</td>
            <td>India GHG Program</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function Privacy() {
  usePageTitle("Privacy Policy");

  return (
    <div className="content-container">
      <h1>Privacy Policy</h1>
      <p className="lead">We protect your privacy by design. We do not sell data or track you across the web.</p>

      <h2>What We Store</h2>
      <ul>
        <li>
          <strong>Accounts:</strong> Email address stored as the login name and a scrypt-hashed password. Passwords are never stored in plain text.
        </li>
        <li>
          <strong>Sessions:</strong> High-entropy cryptographic tokens stored in httpOnly, SameSite=Lax cookies.
        </li>
        <li>
          <strong>Trips:</strong> Only the journeys you explicitly choose to log are saved to your profile to compute carbon metrics.
        </li>
      </ul>

      <h2>What We Never Do</h2>
      <ul>
        <li>We do not share your trip history or search origins/destinations with advertising networks.</li>
        <li>We do not track your real-time GPS location continuously. Coordinates are only received when you search or click the map.</li>
      </ul>
    </div>
  );
}

export function Terms() {
  usePageTitle("Terms of Service");

  return (
    <div className="content-container">
      <h1>Terms of Service</h1>
      <p className="lead">Terms of using the MileZero journey planning platform.</p>

      <h2>Acceptable Use</h2>
      <p>
        MileZero provides estimates for commute duration, fares, and carbon emissions for informational and environmental awareness purposes. Transit timetables, delays, and fares may change due to operational adjustments by transport agencies. Always follow instructions from transit operators.
      </p>

      <h2>Disclaimer</h2>
      <p>
        Route suggestions are provided as-is without warranty of fitness for a particular purpose. Walking and cycling legs use publicly contributed OpenStreetMap data.
      </p>
    </div>
  );
}
