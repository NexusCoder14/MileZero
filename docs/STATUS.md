# Implementation status

The only status labels used by the project are:

- Implemented and verified
- Implemented but awaiting external data or credentials
- Not implemented

| Area | Status | What it does and what it needs |
|---|---|---|
| Sign-in and protected routes | Implemented and verified | File-backed sessions and protected API/page access |
| Planner and responsive results | Implemented and verified | Map, locations, aligned cards, detail panel |
| Storage | Implemented and verified | Writable JSON files under `data/` |
| Street routing | Implemented but awaiting external data or credentials | A reachable `ROUTING_ENGINE_URL` |
| Place search | Implemented but awaiting external data or credentials | A reachable `GEOCODER_URL` |
| Transit network (OpenStreetMap) | Implemented but awaiting external data or credentials | A valid city snapshot from `OVERPASS_URL` and a successful self-test |
| Fare research | Implemented but awaiting external data or credentials | `GROQ_API_KEY` and reachable cited source pages |
| Administrator password recovery | Implemented and verified | An administrator can issue a one-time temporary password; email addresses are used only as login names |

## Transit assumptions

OpenStreetMap route relations describe lines and stops, not schedules. Transit
results are explicitly estimated. Average speeds are 18 km/h for bus, 32 km/h
for metro, and 42 km/h for suburban train. Assumed waits are 10, 8, and 12
minutes respectively. These values are assumptions and never imply a timetable.

Live Overpass fetching is environment-dependent. The parser and planner tests
use a small fixture labelled `MOCKED UPSTREAM`; that fixture is test-only and
is never shipped as product data.
