# MileZero

**Every journey. A better way.** An intelligent multimodal, low-carbon urban mobility platform, starting with Mumbai.

This repository was Green Shift Commute. It is being rebuilt as one application: a React frontend, a Fastify API and file-backed persistence.

**Current state:** The foundation, account flows, planner, community features and OpenStreetMap transit snapshot are implemented. External providers remain unavailable until reachable. See `docs/STATUS.md` for an honest status.

## Quick start

```bash
npm install
npm run dev              # http://127.0.0.1:5173
```

That is all. The first run creates `.env` and the local data directory. The only optional value you add yourself is `GROQ_API_KEY` in `.env`.

The Data status page shows what is connected. Transit is estimated from a city-wide OpenStreetMap snapshot and never represents a timetable.

Email addresses are stored only as account login names. If a password is forgotten, an administrator can issue a one-time temporary password from the People table; no message is sent.

More in `docs/development.md`. Data sources in `docs/data-sources.md`.

## What is in this project

- `apps/api`: Fastify backend, authentication, planner, community routes and OpenStreetMap transit snapshot service.
- `apps/web`: React/Vite frontend.
- `packages/shared`: Shared schemas and deterministic calculations.
- `data`: Rates and fetched OpenStreetMap transit snapshots.
- `docs`: Current status and source documentation.

## Rules the project follows

Real routing and real transport data only. No invented routes, schedules, fares, stops or geometry. Fares and CO2 are computed by deterministic code; an AI model may propose a fare for review but never calculates one. Every provider that is not set up is shown as not configured.
