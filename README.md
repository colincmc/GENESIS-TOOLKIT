# GENESIS-TOOLKIT
### Stack Health, Dynamic Repair & Battlegroup Readiness

**Port: 8820**

> "Don't expect, inspect. FIX. REPORT WHAT. REPORT ACTION. REPORT SOLVED. MOVE ON. No medals, home." -- SAS Doctrine

## What It Does

1. **Perpetual health probing** of 63+ services across 5 criticality tiers (TIER_0 foundation through TIER_4 ingestors), each at tier-appropriate cadence (10s to 120s)
2. **Dynamic repair via Docker socket** -- on RED/BLACK detection: rapid re-probe (3x) then Docker restart then dependency chain fix then escalation (TIER_0/1 only)
3. **Weighted Mission Capable Rate (0-100)** -- the single metric that tells Commander if the battlegroup is ready: BATTLE_READY(95+), MISSION_CAPABLE(85-94), DEGRADED(70-84), LIMITED(50-69), NON_OPERATIONAL(<50)
4. **Synthetic pipeline testing** -- 5 pipelines (PRICE_FEED, INTELLIGENCE_LOOP, SESSION_MANIFEST, TELEMETRY_INGEST, EXECUTION_READINESS) run every 5 minutes with `_synthetic: true` tags so downstream quarantines test data
5. **Preventive maintenance** -- staleness detection, high-latency warnings, dependency chain analysis, memory pressure monitoring, deep inspections via `/state` endpoints (not just `/health`)
6. **Escalation to Battle Stations** -- TIER_0 unrecoverable triggers CRITICAL, 3+ TIER_1 RED triggers WARNING, readiness below 60% triggers CRITICAL
7. **Intelligence forwarding** -- every heal event, readiness snapshot, preventive finding, and escalation forwarded to Whiteboard, GTC, Ledger Lite, and Battle Stations

## Architecture

| File | Purpose | Lines |
|------|---------|-------|
| `src/index.ts` | Express server, 18 endpoints, 6 perpetual loops, graceful shutdown | 468 |
| `src/types.ts` | Full type system: tiers, statuses, probes, heals, readiness, synthetics, preventive, escalation | 225 |
| `src/services/inspector.service.ts` | Perpetual probe engine with 63-service seed catalog, tier-based cadence, status change listeners | 370 |
| `src/services/healer.service.ts` | Dynamic repair via Docker socket (`dockerode`): re-probe, restart, dependency fix, escalate | 268 |
| `src/services/readiness.service.ts` | Weighted Mission Capable Rate computation with per-tier breakdown and 24h history | 149 |
| `src/services/synthetic.service.ts` | 5 synthetic pipelines testing real service paths with synthetic data | 260 |
| `src/services/preventive.service.ts` | Staleness detection, high-latency alerts, dependency chain analysis, deep `/state` inspections | 229 |
| `src/services/forwarder.service.ts` | Downstream writes to Whiteboard, GTC, Ledger Lite, Battle Stations | 224 |
| `package.json` | Dependencies: express, dockerode | 20 |
| `Dockerfile` | node:20.20.0-slim, port 8820 | 14 |

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Toolkit own health + readiness summary |
| GET | `/state` | Full state: probes, heals, synthetics, preventive, escalations |
| GET | `/readiness` | Battlegroup readiness score + per-tier breakdown |
| GET | `/readiness/history` | Readiness score over time (up to 2880 entries / 24h) |
| GET | `/services` | All monitored services with tier/status/tag filters |
| GET | `/services/green` | All GREEN services |
| GET | `/services/red` | All RED/BLACK services |
| GET | `/service/:name` | Specific service detail + probe/heal history |
| POST | `/service/register` | Register new service (Model T19 extensibility) |
| POST | `/service/bulk-register` | Bulk register services |
| GET | `/heals` | Recent heal events |
| GET | `/heals/active` | Currently healing services |
| GET | `/synthetic` | Synthetic pipeline results + pass rate |
| GET | `/synthetic/:pipeline` | Specific pipeline results + history |
| POST | `/synthetic/trigger` | Manually trigger synthetic test cycle |
| GET | `/preventive` | Preventive maintenance findings |
| POST | `/probe/:name` | Manually trigger probe for specific service |
| GET | `/report` | Full battle report (readiness, heals, synthetics, preventive, escalations) |

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `8820` | Service port |
| `WHITEBOARD_URL` | `http://genesis-whiteboard:8710` | Whiteboard intel forwarding |
| `GTC_URL` | `http://genesis-global-telemetry-cloud:8600` | GTC telemetry forwarding |
| `LEDGER_LITE_URL` | `http://genesis-ledger-lite:8500` | Ledger Lite compliance forwarding |
| `BATTLE_STATIONS_URL` | `http://genesis-battle-stations:8810` | Escalation target |
| `INGESTION_GATE_URL` | `http://genesis-ingestion-gate:8700` | Synthetic pipeline: price feed test |
| `FOLLOW_THE_SUN_URL` | `http://genesis-follow-the-sun:8815` | Synthetic pipeline: session manifest test |
| `BEACHHEAD_EXECUTOR_URL` | `http://genesis-beachhead-executor:8411` | Synthetic pipeline: execution readiness test |

## Integration

- **Reads from**: All 63+ services via HTTP `/health` and `/state` endpoints
- **Writes to**: Whiteboard (intel), GTC (telemetry), Ledger Lite (operational compliance), Battle Stations (escalation)
- **Docker socket**: Only GENESIS-TOOLKIT has `/var/run/docker.sock` access for container restarts
- **Three roles**: AA (reactive defence -- heal on RED/BLACK), Green Flag (proactive inspection -- synthetic pipelines), Insurance (preventive maintenance -- staleness/latency/memory)

## Current State

- 63 services seeded across 5 tiers at build time
- 6 perpetual loops running: tier-staggered probes, readiness compute (30s), synthetic pipelines (5min), preventive scan (15min), intel forward (2min)
- Docker socket healing: re-probe, restart, dependency fix, escalate
- Model T19: POST `/service/register` adds new services at runtime

## Future Editions

1. GPU-accelerated anomaly detection via RAPIDS cuML for latency pattern recognition
2. Predictive failure: detect degradation trends before RED threshold
3. Auto-scaling: trigger container scaling events based on sustained load patterns
4. Cross-rail readiness: unified readiness score across Rail 1 through Rail N
5. Self-healing playbooks: configurable repair sequences per service type

## Rail Deployment

| Rail | Status | Notes |
|------|--------|-------|
| Rail 1 (Cash Rail) | BUILT | 63 services monitored, Docker socket healing, 18 endpoints |
| Rail 2 (DeFi) | Planned | Same architecture, additional DeFi-specific service catalog |
| Rail 3+ | Future | GOD/Ray Trace dashboard for multi-rail readiness visualisation |
