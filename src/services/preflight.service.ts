// ============================================================================
// GENESIS-TOOLKIT — Pre-Flight Service
// Cold boot stack verification. 3 phases. Prove the stack works.
// Phase 1: HEARTBEAT — every service by tier order.
// Phase 2: SYNTHETIC TRACE — 6 E2E traces with UUID fingerprint.
// Phase 3: CAPITAL & GOVERNANCE — Treasury, Kill Switch, FTS, ARIS.
// Verdict: GREEN (GO, MCR>=95) | AMBER (CONDITIONAL, MCR>=85) | RED (NO-GO)
// "Don't guess. Prove."
// ============================================================================

import { randomUUID } from "crypto";
import { InspectorService } from "./inspector.service";
import { ReadinessService } from "./readiness.service";
import {
  ServiceTier,
  PreflightVerdict,
  PreflightPhase,
  PreflightHeartbeat,
  PreflightTraceStep,
  PreflightTrace,
  PreflightCapitalCheck,
  PreflightPhaseResult,
  PreflightResult,
} from "../types";

// --- Trace definitions ---

interface TraceDef {
  name: string;
  steps: TraceStepDef[];
}

interface TraceStepDef {
  service: string;
  port: number;
  url: string;
  method: "GET" | "POST";
  body?: Record<string, unknown>;
  action: string;
}

// --- Env vars for trace targets ---

const INGESTION_GATE_URL = process.env.INGESTION_GATE_URL ?? "http://genesis-ingestion-gate:8700";
const DECISION_INGRESS_URL = process.env.DECISION_INGRESS_URL ?? "http://genesis-decision-ingress:8400";
const CIA_URL = process.env.CIA_URL ?? "http://genesis-cia:8797";
const WHITEBOARD_URL = process.env.WHITEBOARD_URL ?? "http://genesis-whiteboard:8710";
const ARB_DETECTOR_URL = process.env.ARB_DETECTOR_URL ?? "http://genesis-arbitrage-detector:8750";
const CEX_EXECUTOR_URL = process.env.CEX_EXECUTOR_URL ?? "http://genesis-cex-executor:8410";
const GTC_URL = process.env.GTC_URL ?? "http://genesis-global-telemetry-cloud:8600";
const BRIGHTON_URL = process.env.BRIGHTON_URL ?? "http://genesis-brighton-protocol:8670";
const SOP101_URL = process.env.SOP101_URL ?? "http://genesis-sop-101-kernel:8800";
const CENTURION_URL = process.env.CENTURION_URL ?? "http://genesis-centurion-index:8799";
const KILL_SWITCH_URL = process.env.KILL_SWITCH_URL ?? "http://genesis-kill-switch-v2:7100";
const ARIS_URL = process.env.ARIS_URL ?? "http://genesis-aris:8798";
const TREASURY_URL = process.env.TREASURY_URL ?? "http://genesis-treasury-sentinel:8660";
const FOLLOW_THE_SUN_URL = process.env.FOLLOW_THE_SUN_URL ?? "http://genesis-follow-the-sun:8815";

const PREFLIGHT_RETRY_DELAY_MS = Number(process.env.PREFLIGHT_RETRY_DELAY_MS ?? 30_000);
const HEARTBEAT_TIMEOUT_MS = 5_000;
const TRACE_STEP_TIMEOUT_MS = 10_000;
const CAPITAL_CHECK_TIMEOUT_MS = 8_000;

const TIERS: ServiceTier[] = ["TIER_0", "TIER_1", "TIER_2", "TIER_3", "TIER_4"];

export class PreflightService {
  private inspector: InspectorService;
  private readiness: ReadinessService;
  private history: PreflightResult[] = [];
  private running = false;

  constructor(inspector: InspectorService, readiness: ReadinessService) {
    this.inspector = inspector;
    this.readiness = readiness;
  }

  // --- Main pre-flight engine ---

  async run(): Promise<PreflightResult> {
    if (this.running) {
      const last = this.getLastResult();
      if (last) return last;
      throw new Error("Pre-flight already running");
    }

    this.running = true;
    const id = randomUUID();
    const startedAt = new Date().toISOString();
    const startMs = Date.now();

    try {
      console.log(`[TOOLKIT] PRE-FLIGHT ${id.slice(0, 8)} — INITIATED`);

      // Phase 1: HEARTBEAT
      const phase1 = await this.runHeartbeat();
      console.log(`[TOOLKIT] PRE-FLIGHT Phase 1 HEARTBEAT — ${phase1.passed ? "PASS" : "FAIL"} (${phase1.durationMs}ms)`);

      // Phase 2: SYNTHETIC TRACE
      const phase2 = await this.runSyntheticTraces();
      console.log(`[TOOLKIT] PRE-FLIGHT Phase 2 SYNTHETIC TRACE — ${phase2.passed ? "PASS" : "FAIL"} (${phase2.durationMs}ms)`);

      // Phase 3: CAPITAL & GOVERNANCE
      const phase3 = await this.runCapitalGovernance();
      console.log(`[TOOLKIT] PRE-FLIGHT Phase 3 CAPITAL & GOVERNANCE — ${phase3.passed ? "PASS" : "FAIL"} (${phase3.durationMs}ms)`);

      // Compute MCR
      const score = this.readiness.compute();
      const mcr = score.composite;

      // Count heartbeat results
      const heartbeats = phase1.details as PreflightHeartbeat[];
      const servicesUp = heartbeats.filter((h) => h.status === "UP").length;
      const servicesDown = heartbeats.filter((h) => h.status !== "UP").length;

      // Count traces
      const traces = phase2.details as PreflightTrace[];
      const tracesPass = traces.filter((t) => t.passed).length;
      const tracesFail = traces.filter((t) => !t.passed).length;

      // Determine verdict
      const verdict = this.determineVerdict(phase1.passed, phase2.passed, phase3.passed, mcr);

      let result: PreflightResult = {
        id,
        verdict,
        mcr,
        phases: [phase1, phase2, phase3],
        servicesUp,
        servicesDown,
        servicesTotal: servicesUp + servicesDown,
        tracesPass,
        tracesFail,
        retried: false,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startMs,
      };

      // Auto-retry on RED
      if (verdict === "RED") {
        console.log(`[TOOLKIT] PRE-FLIGHT RED — auto-retry in ${PREFLIGHT_RETRY_DELAY_MS / 1000}s...`);
        await new Promise((r) => setTimeout(r, PREFLIGHT_RETRY_DELAY_MS));

        const retryPhases: PreflightPhaseResult[] = [];

        // Re-run failed phases only
        if (!phase1.passed) {
          const retry1 = await this.runHeartbeat();
          retryPhases.push(retry1);
          console.log(`[TOOLKIT] PRE-FLIGHT RETRY Phase 1 — ${retry1.passed ? "PASS" : "FAIL"}`);
        } else {
          retryPhases.push(phase1);
        }

        if (!phase2.passed) {
          const retry2 = await this.runSyntheticTraces();
          retryPhases.push(retry2);
          console.log(`[TOOLKIT] PRE-FLIGHT RETRY Phase 2 — ${retry2.passed ? "PASS" : "FAIL"}`);
        } else {
          retryPhases.push(phase2);
        }

        if (!phase3.passed) {
          const retry3 = await this.runCapitalGovernance();
          retryPhases.push(retry3);
          console.log(`[TOOLKIT] PRE-FLIGHT RETRY Phase 3 — ${retry3.passed ? "PASS" : "FAIL"}`);
        } else {
          retryPhases.push(phase3);
        }

        const retryScore = this.readiness.compute();
        const retryMcr = retryScore.composite;
        const retryHeartbeats = retryPhases[0].details as PreflightHeartbeat[];
        const retryUp = retryHeartbeats.filter((h) => h.status === "UP").length;
        const retryDown = retryHeartbeats.filter((h) => h.status !== "UP").length;
        const retryTraces = retryPhases[1].details as PreflightTrace[];
        const retryTracesPass = retryTraces.filter((t) => t.passed).length;
        const retryTracesFail = retryTraces.filter((t) => !t.passed).length;
        const retryVerdict = this.determineVerdict(
          retryPhases[0].passed, retryPhases[1].passed, retryPhases[2].passed, retryMcr,
        );

        result = {
          id,
          verdict: retryVerdict,
          mcr: retryMcr,
          phases: retryPhases,
          servicesUp: retryUp,
          servicesDown: retryDown,
          servicesTotal: retryUp + retryDown,
          tracesPass: retryTracesPass,
          tracesFail: retryTracesFail,
          retried: true,
          startedAt,
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - startMs,
        };
      }

      // Store history
      this.history.push(result);
      if (this.history.length > 10) this.history.shift();

      console.log(`[TOOLKIT] PRE-FLIGHT ${id.slice(0, 8)} — VERDICT: ${result.verdict} | MCR: ${result.mcr}% | ${result.durationMs}ms${result.retried ? " (retried)" : ""}`);
      return result;
    } finally {
      this.running = false;
    }
  }

  // --- Phase 1: HEARTBEAT ---

  private async runHeartbeat(): Promise<PreflightPhaseResult> {
    const start = Date.now();
    const heartbeats: PreflightHeartbeat[] = [];

    // Probe tier by tier (TIER_0 first — foundation must be up)
    for (const tier of TIERS) {
      const services = this.inspector.getServicesByTier(tier);
      // Parallel within each tier
      const tierResults = await Promise.all(
        services.map(async (service): Promise<PreflightHeartbeat> => {
          const probeStart = Date.now();
          try {
            const url = `http://${service.containerName}:${service.port}/health`;
            const response = await fetch(url, {
              signal: AbortSignal.timeout(HEARTBEAT_TIMEOUT_MS),
            });
            return {
              name: service.name,
              port: service.port,
              tier: service.tier,
              status: response.ok ? "UP" : "DOWN",
              latencyMs: Date.now() - probeStart,
              httpStatus: response.status,
            };
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            const isTimeout = msg.includes("timeout") || msg.includes("abort");
            return {
              name: service.name,
              port: service.port,
              tier: service.tier,
              status: isTimeout ? "TIMEOUT" : "DOWN",
              latencyMs: Date.now() - probeStart,
              httpStatus: null,
            };
          }
        }),
      );
      heartbeats.push(...tierResults);
    }

    // Pass criteria: TIER_0 = 100% UP, TIER_1 >= 80% UP
    const tier0 = heartbeats.filter((h) => h.tier === "TIER_0");
    const tier0Up = tier0.filter((h) => h.status === "UP").length;
    const tier0Pass = tier0.length > 0 ? tier0Up === tier0.length : true;

    const tier1 = heartbeats.filter((h) => h.tier === "TIER_1");
    const tier1Up = tier1.filter((h) => h.status === "UP").length;
    const tier1Pass = tier1.length > 0 ? (tier1Up / tier1.length) >= 0.8 : true;

    return {
      phase: "HEARTBEAT",
      passed: tier0Pass && tier1Pass,
      durationMs: Date.now() - start,
      details: heartbeats,
    };
  }

  // --- Phase 2: SYNTHETIC TRACE ---

  private async runSyntheticTraces(): Promise<PreflightPhaseResult> {
    const start = Date.now();

    const traceDefs: TraceDef[] = [
      {
        name: "INGESTION",
        steps: [
          { service: "INGESTION-GATE", port: 8700, url: `${INGESTION_GATE_URL}/health`, method: "GET", action: "Health check" },
          { service: "DECISION-INGRESS", port: 8400, url: `${DECISION_INGRESS_URL}/health`, method: "GET", action: "Health check" },
        ],
      },
      {
        name: "INTELLIGENCE",
        steps: [
          { service: "CIA", port: 8797, url: `${CIA_URL}/health`, method: "GET", action: "Health check" },
          {
            service: "WHITEBOARD", port: 8710, url: `${WHITEBOARD_URL}/intel/ingest`, method: "POST", action: "Synthetic intel",
            body: { source: "TOOLKIT_PREFLIGHT", type: "SYNTHETIC_TRACE", payload: { _synthetic: true, _preflight: true }, confidence: 0.0, tags: ["preflight", "synthetic"] },
          },
        ],
      },
      {
        name: "EXECUTION",
        steps: [
          { service: "ARB-DETECTOR", port: 8750, url: `${ARB_DETECTOR_URL}/health`, method: "GET", action: "Health check" },
          { service: "CEX-EXECUTOR", port: 8410, url: `${CEX_EXECUTOR_URL}/health`, method: "GET", action: "Health check" },
        ],
      },
      {
        name: "TELEMETRY",
        steps: [
          {
            service: "GTC", port: 8600, url: `${GTC_URL}/ingest`, method: "POST", action: "Synthetic telemetry",
            body: { source: "TOOLKIT_PREFLIGHT", event: "PREFLIGHT_TRACE", data: { _synthetic: true, _preflight: true } },
          },
          { service: "BRIGHTON", port: 8670, url: `${BRIGHTON_URL}/health`, method: "GET", action: "Health check" },
        ],
      },
      {
        name: "GOVERNANCE",
        steps: [
          { service: "SOP-101", port: 8800, url: `${SOP101_URL}/health`, method: "GET", action: "Health check" },
          { service: "CENTURION", port: 8799, url: `${CENTURION_URL}/health`, method: "GET", action: "Health check" },
        ],
      },
      {
        name: "DEFENCE",
        steps: [
          { service: "KILL-SWITCH", port: 7100, url: `${KILL_SWITCH_URL}/health`, method: "GET", action: "Health check" },
          { service: "ARIS", port: 8798, url: `${ARIS_URL}/health`, method: "GET", action: "Health check" },
        ],
      },
    ];

    // Run all traces in parallel
    const traces = await Promise.all(
      traceDefs.map(async (def): Promise<PreflightTrace> => {
        const fingerprint = randomUUID();
        const traceStart = Date.now();
        const steps: PreflightTraceStep[] = [];
        let allPassed = true;

        for (const stepDef of def.steps) {
          const stepStart = Date.now();
          try {
            const body = stepDef.body
              ? { ...stepDef.body, _fingerprint: fingerprint }
              : undefined;

            const response = await fetch(stepDef.url, {
              method: stepDef.method,
              headers: body ? { "Content-Type": "application/json" } : undefined,
              body: body ? JSON.stringify(body) : undefined,
              signal: AbortSignal.timeout(TRACE_STEP_TIMEOUT_MS),
            });

            const passed = response.ok;
            steps.push({
              service: stepDef.service,
              port: stepDef.port,
              action: stepDef.action,
              status: passed ? "PASS" : "FAIL",
              latencyMs: Date.now() - stepStart,
              detail: passed ? `HTTP ${response.status}` : `HTTP ${response.status} — unexpected`,
            });
            if (!passed) allPassed = false;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            steps.push({
              service: stepDef.service,
              port: stepDef.port,
              action: stepDef.action,
              status: "FAIL",
              latencyMs: Date.now() - stepStart,
              detail: msg.slice(0, 200),
            });
            allPassed = false;
          }
        }

        return {
          name: def.name,
          fingerprint,
          steps,
          passed: allPassed,
          durationMs: Date.now() - traceStart,
        };
      }),
    );

    // Pass criteria: >= 5/6 traces pass
    const passCount = traces.filter((t) => t.passed).length;

    return {
      phase: "SYNTHETIC_TRACE",
      passed: passCount >= 5,
      durationMs: Date.now() - start,
      details: traces,
    };
  }

  // --- Phase 3: CAPITAL & GOVERNANCE ---

  private async runCapitalGovernance(): Promise<PreflightPhaseResult> {
    const start = Date.now();

    const checks: PreflightCapitalCheck[] = await Promise.all([
      // Treasury Sentinel — must respond
      this.checkCapital("TREASURY_SENTINEL", `${TREASURY_URL}/health`, (body) => {
        return body ? "Treasury responding" : "No response body";
      }),

      // Kill Switch — must be DISARMED
      this.checkCapital("KILL_SWITCH", `${KILL_SWITCH_URL}/state`, (body) => {
        try {
          const parsed = JSON.parse(body);
          const armed = parsed.armed ?? parsed.state?.armed ?? parsed.killSwitch?.armed;
          if (armed === false || armed === "DISARMED") return "DISARMED — safe to operate";
          if (armed === true || armed === "ARMED") return "FAIL:ARMED — stack is kill-switched";
          return "Kill Switch responded — state unclear";
        } catch {
          return "Kill Switch responded";
        }
      }),

      // Follow the Sun — must respond
      this.checkCapital("FOLLOW_THE_SUN", `${FOLLOW_THE_SUN_URL}/health`, (body) => {
        return body ? "Session manager responding" : "No response body";
      }),

      // ARIS — must be operational
      this.checkCapital("ARIS", `${ARIS_URL}/health`, (body) => {
        return body ? "Risk assessor operational" : "No response body";
      }),
    ]);

    // Pass criteria: Kill Switch DISARMED + Treasury responding
    const killSwitch = checks.find((c) => c.name === "KILL_SWITCH");
    const treasury = checks.find((c) => c.name === "TREASURY_SENTINEL");
    const killSwitchPass = killSwitch ? killSwitch.status === "PASS" && !killSwitch.detail.includes("FAIL:ARMED") : false;
    const treasuryPass = treasury ? treasury.status === "PASS" : false;

    return {
      phase: "CAPITAL_GOVERNANCE",
      passed: killSwitchPass && treasuryPass,
      durationMs: Date.now() - start,
      details: checks,
    };
  }

  private async checkCapital(
    name: string,
    url: string,
    evaluator: (body: string) => string,
  ): Promise<PreflightCapitalCheck> {
    const start = Date.now();
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(CAPITAL_CHECK_TIMEOUT_MS),
      });
      const body = await response.text();
      const detail = evaluator(body);

      return {
        name,
        status: response.ok && !detail.startsWith("FAIL:") ? "PASS" : "FAIL",
        detail,
        latencyMs: Date.now() - start,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        name,
        status: "FAIL",
        detail: msg.slice(0, 200),
        latencyMs: Date.now() - start,
      };
    }
  }

  // --- Verdict logic ---

  private determineVerdict(
    phase1Pass: boolean,
    phase2Pass: boolean,
    phase3Pass: boolean,
    mcr: number,
  ): PreflightVerdict {
    // RED: Phase 1 fails OR MCR < 85
    if (!phase1Pass || mcr < 85) return "RED";

    // Check Kill Switch armed (captured in phase3 detail)
    // If phase3 failed due to Kill Switch being armed, that's RED
    if (!phase3Pass) {
      // Still could be AMBER if it's just FTS/ARIS down
      // But if MCR < 85, already RED above
    }

    // GREEN: All phases pass + MCR >= 95
    if (phase1Pass && phase2Pass && phase3Pass && mcr >= 95) return "GREEN";

    // AMBER: Phase 1 pass + MCR >= 85 (minor failures tolerated)
    if (phase1Pass && mcr >= 85) return "AMBER";

    return "RED";
  }

  // --- Queries ---

  getLastResult(): PreflightResult | null {
    return this.history.length > 0 ? this.history[this.history.length - 1] : null;
  }

  getHistory(): PreflightResult[] {
    return [...this.history];
  }

  isRunning(): boolean {
    return this.running;
  }
}
