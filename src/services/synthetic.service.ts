// ============================================================================
// GENESIS-TOOLKIT — Synthetic Pipeline Service
// Run dummy data through real paths. On battle day, infrastructure is pristine.
// 5 pipelines. Tagged _synthetic: true so downstream quarantines.
// ============================================================================

import {
  SyntheticPipeline,
  SyntheticResult,
  SyntheticStatus,
} from "../types";

// --- Pipeline definitions ---

interface PipelineDef {
  name: SyntheticPipeline;
  description: string;
  steps: PipelineStep[];
}

interface PipelineStep {
  name: string;
  url: string;
  method: "GET" | "POST";
  body?: Record<string, unknown>;
  expectStatus: number;
}

const INGESTION_GATE_URL = process.env.INGESTION_GATE_URL ?? "http://genesis-ingestion-gate:8700";
const WHITEBOARD_URL = process.env.WHITEBOARD_URL ?? "http://genesis-whiteboard:8710";
const FOLLOW_THE_SUN_URL = process.env.FOLLOW_THE_SUN_URL ?? "http://genesis-follow-the-sun:8815";
const GTC_URL = process.env.GTC_URL ?? "http://genesis-global-telemetry-cloud:8600";
const BEACHHEAD_URL = process.env.BEACHHEAD_EXECUTOR_URL ?? "http://genesis-beachhead-executor:8411";

const PIPELINE_DEFS: PipelineDef[] = [
  {
    name: "PRICE_FEED",
    description: "Synthetic price through IG pipeline",
    steps: [
      {
        name: "IG health",
        url: `${INGESTION_GATE_URL}/health`,
        method: "GET",
        expectStatus: 200,
      },
    ],
  },
  {
    name: "INTELLIGENCE_LOOP",
    description: "Synthetic intel through Whiteboard",
    steps: [
      {
        name: "Whiteboard ingest",
        url: `${WHITEBOARD_URL}/intel/ingest`,
        method: "POST",
        body: {
          source: "TOOLKIT",
          type: "SYNTHETIC_TEST",
          payload: {
            _synthetic: true,
            test: "INTELLIGENCE_LOOP",
            timestamp: new Date().toISOString(),
          },
          confidence: 0.0,
          tags: ["synthetic", "test"],
        },
        expectStatus: 200,
      },
    ],
  },
  {
    name: "SESSION_MANIFEST",
    description: "Session manifest generation",
    steps: [
      {
        name: "Follow the Sun manifest",
        url: `${FOLLOW_THE_SUN_URL}/session/manifest`,
        method: "GET",
        expectStatus: 200,
      },
    ],
  },
  {
    name: "TELEMETRY_INGEST",
    description: "Synthetic telemetry through GTC",
    steps: [
      {
        name: "GTC ingest",
        url: `${GTC_URL}/ingest`,
        method: "POST",
        body: {
          source: "TOOLKIT",
          event: "SYNTHETIC_TEST",
          data: {
            _synthetic: true,
            test: "TELEMETRY_INGEST",
            timestamp: new Date().toISOString(),
          },
        },
        expectStatus: 200,
      },
    ],
  },
  {
    name: "EXECUTION_READINESS",
    description: "Execution chain pre-flight check",
    steps: [
      {
        name: "Beachhead health",
        url: `${BEACHHEAD_URL}/health`,
        method: "GET",
        expectStatus: 200,
      },
    ],
  },
];

export class SyntheticService {
  private results: Map<SyntheticPipeline, SyntheticResult> = new Map();
  private history: SyntheticResult[] = [];
  private readonly maxHistory: number;
  private totalRuns = 0;
  private totalPasses = 0;

  constructor(maxHistory = 500) {
    this.maxHistory = maxHistory;

    // Initialize results
    const now = new Date().toISOString();
    for (const def of PIPELINE_DEFS) {
      this.results.set(def.name, {
        pipeline: def.name,
        status: "SKIPPED",
        latencyMs: 0,
        detail: "Not yet tested",
        consecutiveFailures: 0,
        lastPassAt: null,
        testedAt: now,
      });
    }
  }

  // --- Run all pipelines ---

  async runAll(): Promise<SyntheticResult[]> {
    const results: SyntheticResult[] = [];
    for (const def of PIPELINE_DEFS) {
      results.push(await this.runPipeline(def));
    }
    this.totalRuns++;
    return results;
  }

  // --- Run single pipeline ---

  async runPipeline(def: PipelineDef): Promise<SyntheticResult> {
    const start = Date.now();
    const now = new Date().toISOString();
    let status: SyntheticStatus = "PASS";
    let detail = "";
    const existing = this.results.get(def.name);
    let consecutiveFailures = existing?.consecutiveFailures ?? 0;
    let lastPassAt = existing?.lastPassAt ?? null;

    try {
      for (const step of def.steps) {
        const options: RequestInit = {
          method: step.method,
          signal: AbortSignal.timeout(10_000),
          headers: step.body ? { "Content-Type": "application/json" } : undefined,
          body: step.body ? JSON.stringify(step.body) : undefined,
        };

        const response = await fetch(step.url, options);

        if (response.status !== step.expectStatus) {
          status = "FAIL";
          detail = `Step "${step.name}" returned ${response.status} (expected ${step.expectStatus})`;
          break;
        }
      }

      if (status === "PASS") {
        detail = `All steps passed in ${Date.now() - start}ms`;
        consecutiveFailures = 0;
        lastPassAt = now;
        this.totalPasses++;
      } else {
        consecutiveFailures++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("timeout") || msg.includes("abort")) {
        status = "TIMEOUT";
        detail = `Pipeline timed out: ${msg}`;
      } else {
        status = "FAIL";
        detail = `Pipeline error: ${msg}`;
      }
      consecutiveFailures++;
    }

    const result: SyntheticResult = {
      pipeline: def.name,
      status,
      latencyMs: Date.now() - start,
      detail,
      consecutiveFailures,
      lastPassAt,
      testedAt: now,
    };

    this.results.set(def.name, result);
    this.history.push(result);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    return result;
  }

  // --- Queries ---

  getResults(): SyntheticResult[] {
    return Array.from(this.results.values());
  }

  getResult(pipeline: SyntheticPipeline): SyntheticResult | undefined {
    return this.results.get(pipeline);
  }

  getHistory(limit = 50): SyntheticResult[] {
    return this.history.slice(-limit);
  }

  getPipelineHistory(pipeline: SyntheticPipeline, limit = 20): SyntheticResult[] {
    return this.history.filter((r) => r.pipeline === pipeline).slice(-limit);
  }

  getTotalRuns(): number {
    return this.totalRuns;
  }

  getPassRate(): number {
    const total = this.history.length;
    if (total === 0) return 1.0;
    const passes = this.history.filter((r) => r.status === "PASS").length;
    return passes / total;
  }

  hasConsecutiveFailures(pipeline: SyntheticPipeline, threshold = 3): boolean {
    const result = this.results.get(pipeline);
    return result ? result.consecutiveFailures >= threshold : false;
  }

  getFailingPipelines(): SyntheticResult[] {
    return this.getResults().filter((r) => r.consecutiveFailures >= 3);
  }
}
