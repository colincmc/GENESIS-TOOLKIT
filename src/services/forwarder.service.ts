// ============================================================================
// GENESIS-TOOLKIT — Forwarder Service
// Downstream writes: Whiteboard, GTC, Ledger Lite, Battle Stations.
// Every heal event, readiness change, finding → intelligence loop.
// ============================================================================

import {
  HealEvent,
  ReadinessScore,
  PreventiveEvent,
  EscalationEvent,
  EscalationLevel,
  SyntheticResult,
} from "../types";

const WHITEBOARD_URL = process.env.WHITEBOARD_URL ?? "http://genesis-whiteboard:8710";
const GTC_URL = process.env.GTC_URL ?? "http://genesis-global-telemetry-cloud:8600";
const LEDGER_LITE_URL = process.env.LEDGER_LITE_URL ?? "http://genesis-ledger-lite:8500";
const BATTLE_STATIONS_URL = process.env.BATTLE_STATIONS_URL ?? "http://genesis-battle-stations:8810";

async function postJson(url: string, body: unknown): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export class ForwarderService {
  private lastForwardAt: string | null = null;
  private escalationHistory: EscalationEvent[] = [];
  private escalationCounter = 0;
  private totalEscalations = 0;

  // --- Forward heal event to Whiteboard + GTC + Ledger Lite ---

  async forwardHealEvent(event: HealEvent): Promise<void> {
    const now = new Date().toISOString();
    this.lastForwardAt = now;

    // Whiteboard: intelligence
    postJson(`${WHITEBOARD_URL}/intel/ingest`, {
      source: "TOOLKIT",
      type: "HEAL_EVENT",
      payload: event,
      confidence: event.result === "HEALED" ? 0.9 : 0.5,
      tags: ["toolkit", "heal", event.result.toLowerCase()],
    });

    // GTC: telemetry
    postJson(`${GTC_URL}/ingest`, {
      source: "TOOLKIT",
      event: "HEAL_EVENT",
      data: event,
    });

    // Ledger Lite: operational compliance (heals are operational events)
    postJson(`${LEDGER_LITE_URL}/payload`, {
      rail: "TOOLKIT",
      type: "HEAL_EVENT",
      data: {
        service: event.service,
        action: event.action,
        result: event.result,
        detail: event.detail,
        durationMs: event.durationMs,
      },
      timestamp: now,
    });
  }

  // --- Forward readiness snapshot to Whiteboard + GTC ---

  async forwardReadiness(readiness: ReadinessScore): Promise<void> {
    this.lastForwardAt = new Date().toISOString();

    postJson(`${WHITEBOARD_URL}/intel/ingest`, {
      source: "TOOLKIT",
      type: "READINESS_SNAPSHOT",
      payload: {
        composite: readiness.composite,
        category: readiness.category,
        totalServices: readiness.totalServices,
        green: readiness.greenCount,
        amber: readiness.amberCount,
        red: readiness.redCount,
        black: readiness.blackCount,
      },
      confidence: 1.0,
      tags: ["toolkit", "readiness", readiness.category.toLowerCase()],
    });

    postJson(`${GTC_URL}/ingest`, {
      source: "TOOLKIT",
      event: "READINESS_SNAPSHOT",
      data: {
        composite: readiness.composite,
        category: readiness.category,
        green: readiness.greenCount,
        red: readiness.redCount,
        black: readiness.blackCount,
      },
    });
  }

  // --- Forward preventive findings to Whiteboard ---

  async forwardPreventiveFindings(findings: PreventiveEvent[]): Promise<void> {
    if (findings.length === 0) return;
    this.lastForwardAt = new Date().toISOString();

    const highFindings = findings.filter((f) => f.severity === "HIGH");
    if (highFindings.length === 0) return;

    postJson(`${WHITEBOARD_URL}/intel/ingest`, {
      source: "TOOLKIT",
      type: "PREVENTIVE_FINDINGS",
      payload: {
        totalFindings: findings.length,
        highSeverity: highFindings.length,
        findings: highFindings.slice(0, 10),
      },
      confidence: 0.8,
      tags: ["toolkit", "preventive", "maintenance"],
    });
  }

  // --- Forward synthetic results to GTC ---

  async forwardSyntheticResults(results: SyntheticResult[]): Promise<void> {
    this.lastForwardAt = new Date().toISOString();

    postJson(`${GTC_URL}/ingest`, {
      source: "TOOLKIT",
      event: "SYNTHETIC_RESULTS",
      data: {
        pipelines: results.map((r) => ({
          pipeline: r.pipeline,
          status: r.status,
          latencyMs: r.latencyMs,
          consecutiveFailures: r.consecutiveFailures,
        })),
      },
    });
  }

  // --- Escalate to Battle Stations ---

  async escalate(
    level: EscalationLevel,
    condition: string,
    services: string[],
    detail: string,
  ): Promise<EscalationEvent> {
    this.escalationCounter++;
    this.totalEscalations++;

    const event: EscalationEvent = {
      id: `TK-ESC-${this.escalationCounter}-${Date.now()}`,
      level,
      condition,
      services,
      detail,
      sentToBattleStations: false,
      timestamp: new Date().toISOString(),
    };

    // Battle Stations: only CRITICAL and WARNING
    if (level === "CRITICAL" || level === "WARNING") {
      const sent = await postJson(`${BATTLE_STATIONS_URL}/trigger`, {
        type: "TOOLKIT_ESCALATION",
        severity: level,
        services,
        detail,
        timestamp: event.timestamp,
      });
      event.sentToBattleStations = sent;
    }

    // Always to Whiteboard
    postJson(`${WHITEBOARD_URL}/intel/ingest`, {
      source: "TOOLKIT",
      type: "ESCALATION",
      payload: event,
      confidence: 1.0,
      tags: ["toolkit", "escalation", level.toLowerCase()],
    });

    // Always to GTC
    postJson(`${GTC_URL}/ingest`, {
      source: "TOOLKIT",
      event: "ESCALATION",
      data: event,
    });

    this.escalationHistory.push(event);
    if (this.escalationHistory.length > 200) {
      this.escalationHistory.shift();
    }

    return event;
  }

  // --- Queries ---

  getLastForwardAt(): string | null {
    return this.lastForwardAt;
  }

  getEscalationHistory(limit = 50): EscalationEvent[] {
    return this.escalationHistory.slice(-limit);
  }

  getTotalEscalations(): number {
    return this.totalEscalations;
  }
}
