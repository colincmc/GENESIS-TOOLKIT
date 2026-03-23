// ============================================================================
// GENESIS-TOOLKIT — Preventive Maintenance Service
// Don't wait for failure. Inspect every vulnerable moving part.
// Deep inspections, staleness detection, scheduled maintenance checks.
// "We haven't spoken to Peru exchange in X time" — Toolkit knows.
// ============================================================================

import { InspectorService } from "./inspector.service";
import {
  PreventiveEvent,
  PreventiveFinding,
  ServiceTier,
  TIER_PROBE_CADENCE_MS,
} from "../types";

// Staleness thresholds per tier (multiples of probe cadence)
const STALENESS_MULTIPLIER: Record<ServiceTier, number> = {
  TIER_0: 6,   // 60s (6 × 10s)
  TIER_1: 4,   // 60s (4 × 15s)
  TIER_2: 4,   // 120s (4 × 30s)
  TIER_3: 5,   // 300s (5 × 60s)
  TIER_4: 5,   // 600s (5 × 120s)
};

const HIGH_LATENCY_THRESHOLD_MS: Record<ServiceTier, number> = {
  TIER_0: 2000,
  TIER_1: 3000,
  TIER_2: 5000,
  TIER_3: 8000,
  TIER_4: 10000,
};

export class PreventiveService {
  private inspector: InspectorService;
  private findings: PreventiveEvent[] = [];
  private readonly maxFindings: number;
  private findingCounter = 0;

  constructor(inspector: InspectorService, maxFindings = 1000) {
    this.inspector = inspector;
    this.maxFindings = maxFindings;
  }

  // --- Full preventive scan ---

  scan(): PreventiveEvent[] {
    const events: PreventiveEvent[] = [];
    const services = this.inspector.getAllServices();
    const now = Date.now();

    for (const service of services) {
      // --- Staleness check ---
      if (service.lastProbeAt) {
        const lastProbeAge = now - new Date(service.lastProbeAt).getTime();
        const staleness = TIER_PROBE_CADENCE_MS[service.tier] * STALENESS_MULTIPLIER[service.tier];

        if (lastProbeAge > staleness) {
          const ageSeconds = Math.round(lastProbeAge / 1000);
          events.push(this.createFinding(
            service.name,
            "STALE_SERVICE",
            service.tier === "TIER_0" || service.tier === "TIER_1" ? "HIGH" : "MEDIUM",
            `${service.name} last probed ${ageSeconds}s ago (threshold: ${staleness / 1000}s). Stale.`,
            "Force re-probe queued.",
          ));
        }
      } else {
        // Never probed
        events.push(this.createFinding(
          service.name,
          "STALE_SERVICE",
          "MEDIUM",
          `${service.name} has never been probed since registration.`,
          null,
        ));
      }

      // --- High latency check ---
      if (service.lastProbeLatencyMs > HIGH_LATENCY_THRESHOLD_MS[service.tier]) {
        events.push(this.createFinding(
          service.name,
          "HIGH_LATENCY",
          service.lastProbeLatencyMs > HIGH_LATENCY_THRESHOLD_MS[service.tier] * 2 ? "HIGH" : "MEDIUM",
          `${service.name} last probe latency ${service.lastProbeLatencyMs}ms (threshold: ${HIGH_LATENCY_THRESHOLD_MS[service.tier]}ms).`,
          null,
        ));
      }

      // --- Dependency chain check ---
      if (service.status === "GREEN") {
        const deps = this.inspector.getDependencies(service.name);
        const redDeps = deps.filter((d) => d.status === "RED" || d.status === "BLACK");
        if (redDeps.length > 0) {
          const depNames = redDeps.map((d) => d.name).join(", ");
          events.push(this.createFinding(
            service.name,
            "DEPENDENCY_CHAIN",
            "HIGH",
            `${service.name} is GREEN but depends on RED/BLACK: [${depNames}]. May fail soon.`,
            null,
          ));
        }
      }
    }

    return events;
  }

  // --- Deep inspection (hit /state not just /health) ---

  async deepInspect(tier?: ServiceTier): Promise<PreventiveEvent[]> {
    const events: PreventiveEvent[] = [];
    const services = tier
      ? this.inspector.getServicesByTier(tier)
      : this.inspector.getAllServices();

    for (const service of services) {
      if (!service.stateEndpoint) continue;

      try {
        const url = `http://${service.containerName}:${service.port}${service.stateEndpoint}`;
        const response = await fetch(url, {
          signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) continue;

        const state = await response.json() as Record<string, unknown>;

        // Check for memory pressure (if reported)
        if (typeof state.heapUsedMB === "number" && typeof state.heapTotalMB === "number") {
          const usage = (state.heapUsedMB as number) / (state.heapTotalMB as number);
          if (usage > 0.8) {
            events.push(this.createFinding(
              service.name,
              "MEMORY_PRESSURE",
              usage > 0.9 ? "HIGH" : "MEDIUM",
              `${service.name} heap usage at ${(usage * 100).toFixed(1)}% (${state.heapUsedMB}MB / ${state.heapTotalMB}MB).`,
              null,
            ));
          }
        }

        // Check for stale timestamps in state
        if (typeof state.lastProcessedAt === "string") {
          const age = Date.now() - new Date(state.lastProcessedAt as string).getTime();
          if (age > 300_000) { // 5 minutes stale
            events.push(this.createFinding(
              service.name,
              "STALE_CACHE",
              age > 600_000 ? "HIGH" : "MEDIUM",
              `${service.name} last processed data ${Math.round(age / 1000)}s ago. Cache may be stale.`,
              null,
            ));
          }
        }
      } catch {
        // State endpoint failed — not critical, skip
      }
    }

    return events;
  }

  // --- Get stale services that need immediate re-probe ---

  getStaleServices(): string[] {
    const stale: string[] = [];
    const services = this.inspector.getAllServices();
    const now = Date.now();

    for (const service of services) {
      if (!service.lastProbeAt) {
        stale.push(service.name);
        continue;
      }
      const lastProbeAge = now - new Date(service.lastProbeAt).getTime();
      const staleness = TIER_PROBE_CADENCE_MS[service.tier] * STALENESS_MULTIPLIER[service.tier];
      if (lastProbeAge > staleness) {
        stale.push(service.name);
      }
    }

    return stale;
  }

  // --- Create finding ---

  private createFinding(
    service: string,
    finding: PreventiveFinding,
    severity: "LOW" | "MEDIUM" | "HIGH",
    detail: string,
    actionTaken: string | null,
  ): PreventiveEvent {
    this.findingCounter++;
    const event: PreventiveEvent = {
      id: `TK-PREV-${this.findingCounter}-${Date.now()}`,
      service,
      finding,
      severity,
      detail,
      actionTaken,
      timestamp: new Date().toISOString(),
    };

    this.findings.push(event);
    if (this.findings.length > this.maxFindings) {
      this.findings.shift();
    }

    return event;
  }

  // --- Queries ---

  getFindings(limit = 50): PreventiveEvent[] {
    return this.findings.slice(-limit);
  }

  getHighFindings(): PreventiveEvent[] {
    return this.findings.filter((f) => f.severity === "HIGH").slice(-50);
  }

  getTotalFindings(): number {
    return this.findings.length;
  }
}
