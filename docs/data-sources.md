# Data sources

## OpenStreetMap transit network

MileZero fetches city-wide public transport route relations from the
[Overpass API](https://overpass-api.de/) using the OpenStreetMap data licence,
the [ODbL](https://www.openstreetmap.org/copyright). The default endpoint is
`https://overpass-api.de/api/interpreter`; production deployments should use an
Overpass instance they operate themselves and set `OVERPASS_URL`.

The Mumbai snapshot queries `route=bus`, `route=subway`, `route=light_rail`,
`route=tram`, `route=train`, and `route=monorail` relations. It stores ordered
stops, route geometry, line metadata, and the fetch date in
`data/transit/mumbai.json`. A snapshot older than 14 days is refreshed in the
background. Failed refreshes keep the last valid snapshot.

OSM route relations do not provide a timetable. Transit results are therefore
labelled **Estimated from OpenStreetMap, not a timetable**. MileZero does not
show departure times, delays, or invented fares.

## Estimation assumptions

The planner uses documented average speeds of 18 km/h for buses, 32 km/h for
metro, and 42 km/h for suburban train. It adds assumed waits of 10, 8, and 12
minutes respectively. These are planning assumptions, not observations or
operator schedules.

## Fare data

Fare lookup uses the existing local rate tables where an operator and mode
match. An unmatched operator is retained and its fare is shown as not known.
The source and calculation are shown in the option detail panel.

## No GTFS dependency

MileZero does not download, parse, or require GTFS. Timetables and live
departures are future work and are not represented by the current product.
