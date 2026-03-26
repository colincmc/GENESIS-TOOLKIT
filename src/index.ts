// ============================================================================
// GENESIS-TOOLKIT — Stack Health, Dynamic Repair & Battlegroup Readiness
// Port 8820. "Don't expect, inspect." Perpetual loop mission.
// FIX → REPORT WHAT → REPORT ACTION → REPORT SOLVED → MOVE ON.
// No medals, home. SAS doctrine. 22 endpoints, 6 perpetual loops.
// Cold boot pre-flight: 3 phases, 3 notification channels, GO/NO-GO verdict.
// ============================================================================

import express from "express";
import { InspectorService } from "./services/inspector.service";
import { HealerService } from "./services/healer.service";
import { ReadinessService } from "./services/readiness.service";
import { SyntheticService } from "./services/synthetic.service";
import { PreventiveService } from "./services/preventive.service";
import { ForwarderService } from "./services/forwarder.service";
import { PreflightService } from "./services/preflight.service";
import { NotifierService } from "./services/notifier.service";
import {
  ServiceTier,
  ServiceStatus,
  SyntheticPipeline,
  TIER_PROBE_CADENCE_MS,
  ServiceRegistrationPayload,
} from "./types";

const PORT = Number(process.env.PORT ?? 8820);
const app = express();
app.use(express.json());

// --- Instantiate services ---

const inspector = new InspectorService();
const healer = new HealerService(inspector);
const readiness = new ReadinessService(inspector);
const synthetic = new SyntheticService();
const preventive = new PreventiveService(inspector);
const forwarder = new ForwarderService();
const preflight = new PreflightService(inspector, readiness);
const notifier = new NotifierService();

const startedAt = Date.now();

// --- Wire healer events to forwarder ---

healer.onHeal((event) => {
  forwarder.forwardHealEvent(event);

  // Check escalation conditions
  if (event.action === "ESCALATE" && event.result === "FAILED") {
    forwarder.escalate(
      "CRITICAL",
      `${event.tier} service unrecoverable`,
      [event.service],
      event.detail,
    );
  }
});

// ============================================================================
// ENDPOINTS (18)
// ============================================================================

// 1. GET /health — Toolkit own health + readiness summary
app.get("/health", (_req, res) => {
  const r = readiness.getCurrent();
  const lastPreflight = preflight.getLastResult();
  res.json({
    status: "GREEN",
    service: "GENESIS-TOOLKIT",
    port: PORT,
    readiness: r.composite,
    readinessCategory: r.category,
    totalServices: inspector.getServiceCount(),
    preflight: {
      lastVerdict: lastPreflight?.verdict ?? null,
      lastMcr: lastPreflight?.mcr ?? null,
      lastRun: lastPreflight?.completedAt ?? null,
      running: preflight.isRunning(),
      channels: notifier.getChannelStatus(),
    },
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
  });
});

// 2. GET /state — Full state
app.get("/state", (_req, res) => {
  const r = readiness.getCurrent();
  res.json({
    readiness: r,
    totalServices: inspector.getServiceCount(),
    servicesByStatus: inspector.getStatusCounts(),
    totalProbes: inspector.getTotalProbes(),
    totalHeals: healer.getTotalHeals(),
    totalHealSuccesses: healer.getTotalSuccesses(),
    healRate: healer.getHealRate(),
    totalSyntheticRuns: synthetic.getTotalRuns(),
    syntheticPassRate: synthetic.getPassRate(),
    totalPreventiveFindings: preventive.getTotalFindings(),
    totalEscalations: forwarder.getTotalEscalations(),
    lastForwardAt: forwarder.getLastForwardAt(),
    preflight: preflight.getHistory(),
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
  });
});

// 3. GET /readiness — Battlegroup readiness score + per-tier breakdown
app.get("/readiness", (_req, res) => {
  res.json(readiness.getCurrent());
});

// 4. GET /readiness/history — Readiness score over time
app.get("/readiness/history", (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 100), 2880);
  res.json(readiness.getHistory(limit));
});

// 5. GET /services — All monitored services + current status
app.get("/services", (req, res) => {
  let services = inspector.getAllServices();

  // Filters
  const tier = req.query.tier as string | undefined;
  const status = req.query.status as string | undefined;
  const tag = req.query.tag as string | undefined;

  if (tier) services = services.filter((s) => s.tier === tier);
  if (status) services = services.filter((s) => s.status === status);
  if (tag) services = services.filter((s) => s.tags.includes(tag));

  res.json({
    count: services.length,
    services,
  });
});

// 6. GET /services/green — All GREEN services
app.get("/services/green", (_req, res) => {
  const services = inspector.getServicesByStatus("GREEN");
  res.json({ count: services.length, services });
});

// 7. GET /services/red — All RED/BLACK services
app.get("/services/red", (_req, res) => {
  const red = inspector.getServicesByStatus("RED");
  const black = inspector.getServicesByStatus("BLACK");
  const combined = [...red, ...black];
  res.json({ count: combined.length, services: combined });
});

// 8. GET /service/:name — Specific service detail + probe/heal history
app.get("/service/:name", (req, res) => {
  const name = req.params.name.toUpperCase();
  const service = inspector.getService(name);
  if (!service) {
    res.status(404).json({ error: `Service ${name} not found` });
    return;
  }
  res.json({
    service,
    probeHistory: inspector.getServiceProbeHistory(name, 20),
    healHistory: healer.getHealHistory(50).filter((h) => h.service === name),
    isHealing: healer.isHealing(name),
  });
});

// 9. POST /service/register — Register new service (Model T19)
app.post("/service/register", (req, res) => {
  const payload = req.body as ServiceRegistrationPayload;
  if (!payload.name || !payload.port) {
    res.status(400).json({ error: "name and port are required" });
    return;
  }
  const record = inspector.register(payload);
  res.json({ registered: true, service: record });
});

// 10. POST /service/bulk-register — Bulk register services
app.post("/service/bulk-register", (req, res) => {
  const payloads = req.body as ServiceRegistrationPayload[];
  if (!Array.isArray(payloads)) {
    res.status(400).json({ error: "Expected array of service payloads" });
    return;
  }
  const records = inspector.bulkRegister(payloads);
  res.json({ registered: records.length, services: records });
});

// 11. GET /heals — Recent heal events
app.get("/heals", (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 500);
  res.json(healer.getHealHistory(limit));
});

// 12. GET /heals/active — Currently healing
app.get("/heals/active", (_req, res) => {
  const active = healer.getActiveHeals();
  res.json({ count: active.length, services: active });
});

// 13. GET /synthetic — Synthetic pipeline results
app.get("/synthetic", (_req, res) => {
  res.json({
    totalRuns: synthetic.getTotalRuns(),
    passRate: synthetic.getPassRate(),
    pipelines: synthetic.getResults(),
    failing: synthetic.getFailingPipelines(),
  });
});

// 14. GET /synthetic/:pipeline — Specific pipeline results
app.get("/synthetic/:pipeline", (req, res) => {
  const pipeline = req.params.pipeline.toUpperCase() as SyntheticPipeline;
  const result = synthetic.getResult(pipeline);
  if (!result) {
    res.status(404).json({ error: `Pipeline ${pipeline} not found` });
    return;
  }
  res.json({
    current: result,
    history: synthetic.getPipelineHistory(pipeline, 20),
  });
});

// 15. POST /synthetic/trigger — Manually trigger synthetic test cycle
app.post("/synthetic/trigger", async (_req, res) => {
  const results = await synthetic.runAll();
  res.json({ triggered: true, results });
});

// 16. GET /preventive — Preventive maintenance findings
app.get("/preventive", (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 1000);
  res.json({
    totalFindings: preventive.getTotalFindings(),
    recent: preventive.getFindings(limit),
    highSeverity: preventive.getHighFindings(),
  });
});

// 17. POST /probe/:name — Manually trigger probe for specific service
app.post("/probe/:name", async (req, res) => {
  const name = req.params.name.toUpperCase();
  const service = inspector.getService(name);
  if (!service) {
    res.status(404).json({ error: `Service ${name} not found` });
    return;
  }
  const result = await inspector.probe(service);
  res.json(result);
});

// 18. GET /report — Full battle report
app.get("/report", (_req, res) => {
  const r = readiness.getCurrent();
  const red = inspector.getServicesByStatus("RED");
  const black = inspector.getServicesByStatus("BLACK");

  res.json({
    readiness: r,
    statusSummary: inspector.getStatusCounts(),
    redServices: red.map((s) => ({ name: s.name, tier: s.tier, failures: s.consecutiveFailures, lastProbeAt: s.lastProbeAt })),
    blackServices: black.map((s) => ({ name: s.name, tier: s.tier, failures: s.consecutiveFailures, lastProbeAt: s.lastProbeAt })),
    activeHeals: healer.getActiveHeals(),
    recentHeals: healer.getHealHistory(10),
    syntheticResults: synthetic.getResults(),
    failingPipelines: synthetic.getFailingPipelines(),
    recentPreventive: preventive.getHighFindings().slice(-5),
    recentEscalations: forwarder.getEscalationHistory(5),
    stats: {
      totalProbes: inspector.getTotalProbes(),
      totalHeals: healer.getTotalHeals(),
      healRate: healer.getHealRate(),
      syntheticPassRate: synthetic.getPassRate(),
      totalEscalations: forwarder.getTotalEscalations(),
      uptime: Math.floor((Date.now() - startedAt) / 1000),
    },
    generatedAt: new Date().toISOString(),
  });
});

// 19. POST /preflight/run — Manually trigger pre-flight check
app.post("/preflight/run", async (_req, res) => {
  if (preflight.isRunning()) {
    res.status(409).json({ error: "Pre-flight already running" });
    return;
  }
  const result = await preflight.run();
  notifier.notifyPreflightResult(result).catch(() => {});
  res.json(result);
});

// 20. GET /preflight/last — Last pre-flight result
app.get("/preflight/last", (_req, res) => {
  const result = preflight.getLastResult();
  if (!result) {
    res.status(404).json({ error: "No pre-flight results yet" });
    return;
  }
  res.json(result);
});

// 21. GET /preflight/history — All stored pre-flight results (up to 10)
app.get("/preflight/history", (_req, res) => {
  res.json(preflight.getHistory());
});

// 22. GET /preflight/status — Quick summary
app.get("/preflight/status", (_req, res) => {
  const result = preflight.getLastResult();
  res.json({
    verdict: result?.verdict ?? null,
    mcr: result?.mcr ?? null,
    lastRun: result?.completedAt ?? null,
    retried: result?.retried ?? false,
    servicesUp: result?.servicesUp ?? null,
    servicesTotal: result?.servicesTotal ?? null,
    running: preflight.isRunning(),
    channels: notifier.getChannelStatus(),
  });
});

// ============================================================================
// PERPETUAL LOOPS (6) — Never stop. Money never sleeps. Neither does Toolkit.
// ============================================================================

const intervalHandles: ReturnType<typeof setInterval>[] = [];
const TIERS: ServiceTier[] = ["TIER_0", "TIER_1", "TIER_2", "TIER_3", "TIER_4"];

// --- Loop 1: Inspector Tick (staggered by tier) ---
// Each tier gets its own interval at its probe cadence.
for (const tier of TIERS) {
  const cadence = TIER_PROBE_CADENCE_MS[tier];
  intervalHandles.push(
    setInterval(async () => {
      try {
        await inspector.probeTier(tier);
      } catch {
        // Inspector swallows its own errors
      }
    }, cadence),
  );
}

// --- Loop 2: Heal Check (event-driven via inspector.onStatusChange) ---
// Already wired in HealerService constructor. No interval needed.
// Healer triggers IMMEDIATELY on RED/BLACK detection.

// --- Loop 3: Readiness Compute (every 30s) ---
const READINESS_INTERVAL_MS = 30_000;
intervalHandles.push(
  setInterval(() => {
    try {
      const score = readiness.compute();

      // Check escalation thresholds
      if (score.composite < 60) {
        forwarder.escalate(
          "CRITICAL",
          "Readiness below 60%",
          [],
          `Battlegroup readiness at ${score.composite}% (${score.category}). ${score.redCount} RED, ${score.blackCount} BLACK.`,
        );
      } else if (score.composite < 80) {
        forwarder.escalate(
          "WARNING",
          "Readiness below 80%",
          [],
          `Battlegroup readiness at ${score.composite}% (${score.category}). ${score.redCount} RED, ${score.blackCount} BLACK.`,
        );
      }

      // Check tier-specific thresholds
      const tier0 = readiness.getTierReadiness("TIER_0");
      if (tier0 && tier0.score < 100) {
        const redNames = inspector.getServicesByTier("TIER_0")
          .filter((s) => s.status !== "GREEN")
          .map((s) => s.name);
        forwarder.escalate(
          "CRITICAL",
          "TIER_0 foundation not at 100%",
          redNames,
          `TIER_0 readiness at ${tier0.score}%. Foundation services compromised.`,
        );
      }

      // Check 3+ TIER_1 RED
      const tier1Red = inspector.getServicesByTier("TIER_1")
        .filter((s) => s.status === "RED" || s.status === "BLACK");
      if (tier1Red.length >= 3) {
        forwarder.escalate(
          "WARNING",
          "3+ TIER_1 execution services RED",
          tier1Red.map((s) => s.name),
          `${tier1Red.length} TIER_1 execution services are RED/BLACK. Execution capability degraded.`,
        );
      }

      // Check 10+ TIER_4 ingestors RED
      const tier4Red = inspector.getServicesByTier("TIER_4")
        .filter((s) => s.status === "RED" || s.status === "BLACK");
      if (tier4Red.length >= 10) {
        forwarder.escalate(
          "WATCH",
          "10+ ingestors offline",
          tier4Red.map((s) => s.name),
          `${tier4Red.length} TIER_4 ingestors are RED/BLACK. Price feed coverage degraded.`,
        );
      }
    } catch {
      // readiness compute should not throw, but protect the loop
    }
  }, READINESS_INTERVAL_MS),
);

// --- Loop 4: Synthetic Pipeline (every 5 minutes) ---
const SYNTHETIC_INTERVAL_MS = 300_000;
intervalHandles.push(
  setInterval(async () => {
    try {
      const results = await synthetic.runAll();
      forwarder.forwardSyntheticResults(results);

      // Check for consecutive failures
      const failing = synthetic.getFailingPipelines();
      if (failing.length > 0) {
        forwarder.escalate(
          "WARNING",
          "Synthetic pipeline failures",
          failing.map((f) => f.pipeline),
          `${failing.length} synthetic pipeline(s) failing 3+ consecutive times: ${failing.map((f) => f.pipeline).join(", ")}`,
        );
      }
    } catch {
      // protect the loop
    }
  }, SYNTHETIC_INTERVAL_MS),
);

// --- Loop 5: Preventive Scan (every 15 minutes) ---
const PREVENTIVE_INTERVAL_MS = 900_000;
let preventiveCycleCount = 0;
intervalHandles.push(
  setInterval(async () => {
    try {
      preventiveCycleCount++;

      // Quick scan every 15 min
      const findings = preventive.scan();
      forwarder.forwardPreventiveFindings(findings);

      // Deep inspect TIER_0/1 every 15 min
      const deepFindings01 = await preventive.deepInspect("TIER_0");
      const deepFindings1 = await preventive.deepInspect("TIER_1");
      forwarder.forwardPreventiveFindings([...deepFindings01, ...deepFindings1]);

      // Deep inspect TIER_2/3 every 30 min (every 2nd cycle)
      if (preventiveCycleCount % 2 === 0) {
        const deepFindings2 = await preventive.deepInspect("TIER_2");
        const deepFindings3 = await preventive.deepInspect("TIER_3");
        forwarder.forwardPreventiveFindings([...deepFindings2, ...deepFindings3]);
      }

      // Full stack audit every 60 min (every 4th cycle)
      if (preventiveCycleCount % 4 === 0) {
        const deepFindingsAll = await preventive.deepInspect();
        forwarder.forwardPreventiveFindings(deepFindingsAll);
      }

      // Force re-probe stale services
      const stale = preventive.getStaleServices();
      for (const name of stale) {
        const service = inspector.getService(name);
        if (service) {
          inspector.probe(service).catch(() => {});
        }
      }
    } catch {
      // protect the loop
    }
  }, PREVENTIVE_INTERVAL_MS),
);

// --- Loop 6: Intel Forward (every 2 minutes) ---
const INTEL_FORWARD_INTERVAL_MS = 120_000;
intervalHandles.push(
  setInterval(() => {
    try {
      const score = readiness.getCurrent();
      forwarder.forwardReadiness(score);
    } catch {
      // protect the loop
    }
  }, INTEL_FORWARD_INTERVAL_MS),
);

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

function shutdown(): void {
  console.log("[TOOLKIT] Graceful shutdown — clearing all intervals.");
  for (const handle of intervalHandles) {
    clearInterval(handle);
  }
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// ============================================================================
// START
// ============================================================================

const PREFLIGHT_DELAY_MS = Number(process.env.PREFLIGHT_DELAY_MS ?? 10_000);

app.listen(PORT, () => {
  const channels = notifier.getChannelStatus();
  console.log(`[TOOLKIT] ============================================================`);
  console.log(`[TOOLKIT] GENESIS-TOOLKIT operational on port ${PORT}`);
  console.log(`[TOOLKIT] ${inspector.getServiceCount()} services registered across 5 tiers`);
  console.log(`[TOOLKIT] Perpetual loop mission: ACTIVE (6 loops)`);
  console.log(`[TOOLKIT] Endpoints: 22 | Heal levels: 5 | Synthetic pipelines: 5`);
  console.log(`[TOOLKIT] Notification channels:`);
  console.log(`[TOOLKIT]   Signal: ${channels.SIGNAL ? "CONFIGURED" : "NOT CONFIGURED"}`);
  console.log(`[TOOLKIT]   Email:  ${channels.EMAIL ? "CONFIGURED" : "NOT CONFIGURED"}`);
  console.log(`[TOOLKIT]   GOD:    ${channels.GOD ? "CONFIGURED" : "STUB (future)"}`);
  console.log(`[TOOLKIT] Pre-flight check scheduled in ${PREFLIGHT_DELAY_MS / 1000}s...`);
  console.log(`[TOOLKIT] Doctrine: Don't expect, inspect. Fix first. No medals, home.`);
  console.log(`[TOOLKIT] ============================================================`);

  // Cold boot pre-flight check
  setTimeout(async () => {
    try {
      console.log(`[TOOLKIT] PRE-FLIGHT — Cold boot check initiating...`);
      const result = await preflight.run();
      const notifications = await notifier.notifyPreflightResult(result);
      const sent = notifications.filter((n) => n.sent).map((n) => n.channel);
      console.log(`[TOOLKIT] PRE-FLIGHT COMPLETE — ${result.verdict} | MCR: ${result.mcr}% | Notified: ${sent.length > 0 ? sent.join(", ") : "none (channels not configured)"}`);

      // Forward to GTC for telemetry
      forwarder.forwardSyntheticResults([]);
    } catch (e) {
      console.log(`[TOOLKIT] PRE-FLIGHT FAILED — ${e instanceof Error ? e.message : e}`);
    }
  }, PREFLIGHT_DELAY_MS);
});
