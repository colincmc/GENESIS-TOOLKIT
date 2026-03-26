# MISSION BOARD — GENESIS-TOOLKIT (Port 8820)

> **Last Updated**: 2026-03-26
> **Status**: OPERATIONAL — 6 perpetual loops active + cold boot pre-flight
> **Doctrine**: "Don't expect, inspect. Fix first. No medals, home."
> **Role**: Stack Health, Dynamic Repair & Battlegroup Readiness

---

## ACTIVE PERPETUAL MISSIONS (always running)

| # | Mission | Interval | Purpose | Status |
|---|---------|----------|---------|--------|
| 1 | Inspector Tick | 10-120s (by tier) | Probe every service at tier cadence. TIER_0=10s, TIER_1=15s, TIER_2=30s, TIER_3=60s, TIER_4=120s | ACTIVE |
| 2 | Heal Check | Event-driven | Immediate heal on RED/BLACK detection. 5-level: RE_PROBE→RESTART→DEPENDENCY_FIX→ESCALATE | ACTIVE |
| 3 | Readiness Compute | 30s | Compute battlegroup MCR. Escalate if <60% (CRITICAL), <80% (WARNING). TIER_0 must be 100%. | ACTIVE |
| 4 | Synthetic Pipeline | 300s | Run 5 synthetic pipelines through real paths. Escalate on 3+ consecutive failures. | ACTIVE |
| 5 | Preventive Scan | 900s | Quick scan + deep inspect. TIER_0/1 every 15m, TIER_2/3 every 30m, full audit every 60m. | ACTIVE |
| 6 | Intel Forward | 120s | Forward readiness snapshot to Whiteboard + GTC. | ACTIVE |

---

## COLD BOOT PRE-FLIGHT CHECK

On every cold boot, Toolkit runs a 3-phase verification before declaring the stack operational.

### 3 Phases

| Phase | Name | What It Checks | Pass Criteria |
|-------|------|---------------|---------------|
| 1 | HEARTBEAT | Every service /health by tier order (5s timeout) | TIER_0 = 100% UP, TIER_1 >= 80% UP |
| 2 | SYNTHETIC TRACE | 6 E2E traces with UUID fingerprint | >= 5/6 traces pass |
| 3 | CAPITAL & GOVERNANCE | Treasury, Kill Switch, FTS, ARIS | Kill Switch DISARMED + Treasury responding |

### 6 Synthetic Traces

| Trace | Path | Proves |
|-------|------|--------|
| INGESTION | IG → DI | Price feed pipeline works |
| INTELLIGENCE | CIA → Whiteboard | Intel pipeline works |
| EXECUTION | ARB → CEX Executor | Execution chain works |
| TELEMETRY | GTC → Brighton | Telemetry pipeline works |
| GOVERNANCE | SOP-101 → Centurion | Governance chain works |
| DEFENCE | Kill Switch → ARIS | Defence chain works |

### Verdicts

| Verdict | Meaning | Criteria |
|---------|---------|----------|
| GREEN | GO | All 3 phases pass + MCR >= 95% |
| AMBER | CONDITIONAL GO | Phase 1 pass + MCR >= 85% |
| RED | NO-GO | Phase 1 fails OR MCR < 85% (auto-retry once after 30s) |

---

## NOTIFICATION CHANNELS — 3 Active

| Channel | Method | Purpose | Status |
|---------|--------|---------|--------|
| Signal | signal-cli (E2E encrypted) | Commander notification — most secure | CONFIGURED (env vars) |
| Email | nodemailer SMTP | Formal report with HTML formatting | CONFIGURED (env vars) |
| GOD Dashboard | HTTP POST stub | Future development — dashboard integration | STUB |

All channels fire concurrently via Promise.allSettled. Never block. Graceful fallback per channel.

---

## SERVICE REGISTRY — 5 Tiers, 63+ Services

| Tier | Role | Weight | Probe Cadence | Services |
|------|------|--------|---------------|----------|
| TIER_0 | Foundation | 5.0 | 10s | Kill Switch, Ledger Lite, SOP-101, Command Wallet |
| TIER_1 | Execution | 4.0 | 15s | CEX Executor, Beachhead, DI, EE, Treasury, etc. |
| TIER_2 | Intelligence | 3.0 | 30s | Whiteboard, CIA, Academy, Brighton, Iron Halo, GTC |
| TIER_3 | Governance | 2.0 | 60s | ARB, ARIS, Battle Stations, Ghost Fleet, FTS, etc. |
| TIER_4 | Ingestors | 1.0 | 120s | 20 CEX ingestors + DEX Universal + Ingestion Gate |

---

## MCR — Mission Capable Rate

| Category | Score | Meaning |
|----------|-------|---------|
| BATTLE_READY | 95-100% | Full operational capability |
| MISSION_CAPABLE | 85-94% | Can execute with minor degradation |
| DEGRADED | 70-84% | Significant capability loss |
| LIMITED | 50-69% | Critical systems compromised |
| NON_OPERATIONAL | <50% | Stack non-functional |

---

## HEAL FLOW — 5 Levels

| Level | Action | When |
|-------|--------|------|
| 1 | RE_PROBE | First failure — verify with rapid 3-ping |
| 2 | RESTART | 2+ failures — Docker container restart |
| 3 | DEPENDENCY_FIX | Dependency chain broken — restart deps first |
| 4 | ESCALATE | 5+ failures — alert Battle Stations + Whiteboard |
| 5 | BLACK | Unrecoverable — service marked BLACK, Commander notified |

---

## DISTRIBUTION — Outbound

| Target | Port | What Toolkit Sends |
|--------|------|--------------------|
| Whiteboard | 8710 | Heal events, readiness snapshots, preventive findings, escalations |
| GTC | 8600 | Heal events, readiness, synthetic results, escalations |
| Ledger Lite | 8500 | Heal events (operational compliance records) |
| Battle Stations | 8810 | CRITICAL/WARNING escalations only |

---

## ENDPOINTS — 22 Total

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 1 | GET | /health | Toolkit health + readiness + preflight status |
| 2 | GET | /state | Full operational state |
| 3 | GET | /readiness | Battlegroup MCR + tier breakdown |
| 4 | GET | /readiness/history | MCR over time (24h) |
| 5 | GET | /services | All services (filter: tier, status, tag) |
| 6 | GET | /services/green | All GREEN services |
| 7 | GET | /services/red | All RED/BLACK services |
| 8 | GET | /service/:name | Service detail + probe/heal history |
| 9 | POST | /service/register | Register new service |
| 10 | POST | /service/bulk-register | Bulk register services |
| 11 | GET | /heals | Recent heal events |
| 12 | GET | /heals/active | Currently healing services |
| 13 | GET | /synthetic | Synthetic pipeline results |
| 14 | GET | /synthetic/:pipeline | Specific pipeline detail |
| 15 | POST | /synthetic/trigger | Manually trigger synthetic tests |
| 16 | GET | /preventive | Preventive maintenance findings |
| 17 | POST | /probe/:name | Manually probe specific service |
| 18 | GET | /report | Full battle report |
| 19 | POST | /preflight/run | Manually trigger pre-flight check |
| 20 | GET | /preflight/last | Last pre-flight result |
| 21 | GET | /preflight/history | All pre-flight results (up to 10) |
| 22 | GET | /preflight/status | Quick verdict + MCR + channel status |

---

## PENDING COMMANDER REVIEW

| Item | Priority | Notes |
|------|----------|-------|
| Signal configuration | HIGH | Need SIGNAL_SENDER + SIGNAL_RECIPIENT env vars |
| Email SMTP configuration | MEDIUM | Need SMTP credentials for formal reports |
| GOD Dashboard integration | LOW | Stub ready — awaiting GOD service build |

---

**Endpoints**: 22 | **Loops**: 6 | **Services**: 63+ | **Tiers**: 5
**Heal Levels**: 5 | **Synthetic Pipelines**: 5 | **Pre-Flight Phases**: 3 | **Notification Channels**: 3

> "The human in the loop is needed here. Intel needs to be shared and actioned." — Commander
