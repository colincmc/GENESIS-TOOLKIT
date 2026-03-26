// ============================================================================
// GENESIS-TOOLKIT — Inspector Service
// Perpetual probe engine. Every service, every port, tiered cadence.
// Never stops. Money never sleeps. Neither does the Inspector.
// ============================================================================

import {
  ServiceRecord,
  ServiceTier,
  ServiceStatus,
  ProbeResult,
  TIER_PROBE_CADENCE_MS,
  TIER_PROBE_TIMEOUT_MS,
  ServiceRegistrationPayload,
} from "../types";

// --- Seed Catalog: Every service in the stack ---

interface SeedEntry {
  name: string;
  port: number;
  tier: ServiceTier;
  containerName: string;
  stateEndpoint: string | null;
  dependencies: string[];
  tags: string[];
}

const SEED_CATALOG: SeedEntry[] = [
  // --- TIER_0: Foundation ---
  { name: "GENESIS-KILL-SWITCH-V2", port: 7100, tier: "TIER_0", containerName: "genesis-kill-switch-v2", stateEndpoint: "/state", dependencies: [], tags: ["foundation", "safety"] },
  { name: "GENESIS-LEDGER-LITE", port: 8500, tier: "TIER_0", containerName: "genesis-ledger-lite", stateEndpoint: "/state", dependencies: [], tags: ["foundation", "compliance"] },
  { name: "GENESIS-SOP-101-KERNEL", port: 8800, tier: "TIER_0", containerName: "genesis-sop-101-kernel", stateEndpoint: "/state", dependencies: [], tags: ["foundation", "compliance"] },
  { name: "COMMAND-WALLET", port: 8095, tier: "TIER_0", containerName: "command-wallet", stateEndpoint: null, dependencies: [], tags: ["foundation", "capital"] },

  // --- TIER_1: Execution ---
  { name: "GENESIS-CEX-EXECUTOR", port: 8410, tier: "TIER_1", containerName: "genesis-cex-executor", stateEndpoint: "/state", dependencies: ["GENESIS-KILL-SWITCH-V2", "GENESIS-LEDGER-LITE"], tags: ["execution", "channel-a"] },
  { name: "GENESIS-BEACHHEAD-EXECUTOR", port: 8411, tier: "TIER_1", containerName: "genesis-beachhead-executor", stateEndpoint: "/state", dependencies: ["GENESIS-KILL-SWITCH-V2", "GENESIS-LEDGER-LITE", "GENESIS-TREASURY-SENTINEL"], tags: ["execution", "channel-b"] },
  { name: "GENESIS-DECISION-INGRESS", port: 8400, tier: "TIER_1", containerName: "genesis-decision-ingress", stateEndpoint: "/state", dependencies: ["GENESIS-KILL-SWITCH-V2"], tags: ["execution", "routing"] },
  { name: "GENESIS-EXECUTION-ENGINE", port: 8401, tier: "TIER_1", containerName: "genesis-execution-engine", stateEndpoint: "/state", dependencies: ["GENESIS-KILL-SWITCH-V2"], tags: ["execution"] },
  { name: "GENESIS-EXECUTION-GATEWAY", port: 8402, tier: "TIER_1", containerName: "genesis-execution-gateway", stateEndpoint: null, dependencies: ["GENESIS-KILL-SWITCH-V2"], tags: ["execution", "human-gate"] },
  { name: "GENESIS-FLASHLOAN-EXECUTION-ENGINE", port: 8403, tier: "TIER_1", containerName: "genesis-flashloan-execution-engine", stateEndpoint: null, dependencies: ["GENESIS-KILL-SWITCH-V2"], tags: ["execution", "flashloan"] },
  { name: "GENESIS-FLASHLOAN-GATEWAY", port: 8319, tier: "TIER_1", containerName: "genesis-flashloan-gateway", stateEndpoint: null, dependencies: ["GENESIS-KILL-SWITCH-V2"], tags: ["execution", "flashloan"] },
  { name: "GENESIS-ORDER-ORCHESTRATOR", port: 8320, tier: "TIER_1", containerName: "genesis-order-orchestrator", stateEndpoint: null, dependencies: ["GENESIS-KILL-SWITCH-V2"], tags: ["execution", "orchestration"] },
  { name: "GENESIS-TREASURY-SENTINEL", port: 8660, tier: "TIER_1", containerName: "genesis-treasury-sentinel", stateEndpoint: "/state", dependencies: ["GENESIS-LEDGER-LITE"], tags: ["execution", "capital", "zero-trust"] },
  { name: "GENESIS-GAS-BUFFER", port: 8690, tier: "TIER_1", containerName: "genesis-gas-buffer", stateEndpoint: null, dependencies: [], tags: ["execution", "gas"] },
  { name: "GENESIS-MOTHERSHIP", port: 8695, tier: "TIER_1", containerName: "genesis-mothership", stateEndpoint: null, dependencies: [], tags: ["execution", "orchestration"] },
  { name: "GENESIS-STEALTH-CAROUSEL", port: 8696, tier: "TIER_1", containerName: "genesis-stealth-carousel", stateEndpoint: null, dependencies: [], tags: ["execution", "stealth"] },

  // --- TIER_2: Intelligence ---
  { name: "GENESIS-WHITEBOARD", port: 8710, tier: "TIER_2", containerName: "genesis-whiteboard", stateEndpoint: "/state", dependencies: [], tags: ["intelligence", "memory"] },
  { name: "GENESIS-ROLLING-WINDOW", port: 8720, tier: "TIER_2", containerName: "genesis-rolling-window", stateEndpoint: null, dependencies: [], tags: ["intelligence", "aggregation"] },
  { name: "GENESIS-ACADEMY", port: 8730, tier: "TIER_2", containerName: "genesis-academy", stateEndpoint: "/state", dependencies: ["GENESIS-WHITEBOARD"], tags: ["intelligence", "operators"] },
  { name: "GENESIS-BRIGHTON-PROTOCOL", port: 8670, tier: "TIER_2", containerName: "genesis-brighton-protocol", stateEndpoint: "/state", dependencies: ["GENESIS-WHITEBOARD"], tags: ["intelligence", "patterns"] },
  { name: "GENESIS-IRON-HALO", port: 8680, tier: "TIER_2", containerName: "genesis-iron-halo", stateEndpoint: "/state", dependencies: ["GENESIS-WHITEBOARD", "GENESIS-LEDGER-LITE"], tags: ["intelligence", "debrief"] },
  { name: "GENESIS-BEACHHEAD-GTC", port: 8650, tier: "TIER_2", containerName: "genesis-beachhead-gtc", stateEndpoint: "/state", dependencies: [], tags: ["intelligence", "telemetry"] },
  { name: "GENESIS-GLOBAL-TELEMETRY-CLOUD", port: 8600, tier: "TIER_2", containerName: "genesis-global-telemetry-cloud", stateEndpoint: "/state", dependencies: [], tags: ["intelligence", "telemetry"] },
  { name: "GENESIS-CIA", port: 8797, tier: "TIER_2", containerName: "genesis-cia", stateEndpoint: "/state", dependencies: ["GENESIS-WHITEBOARD"], tags: ["intelligence", "sovereign"] },
  { name: "GENESIS-SANITISATION-LAYER", port: 8780, tier: "TIER_2", containerName: "genesis-sanitisation-layer", stateEndpoint: null, dependencies: [], tags: ["intelligence", "anti-fingerprint"] },
  { name: "GENESIS-EXCHANGE-INTELLIGENCE-MATRIX", port: 8770, tier: "TIER_2", containerName: "genesis-exchange-intelligence-matrix", stateEndpoint: null, dependencies: [], tags: ["intelligence", "exchange-patterns"] },

  // --- TIER_3: Governance & Support ---
  { name: "GENESIS-ARBITRAGE-DETECTOR", port: 8750, tier: "TIER_3", containerName: "genesis-arbitrage-detector", stateEndpoint: "/state", dependencies: ["GENESIS-KILL-SWITCH-V2"], tags: ["governance", "detection"] },
  { name: "GENESIS-ADAPTIVE-CALIBRATOR", port: 8760, tier: "TIER_3", containerName: "genesis-adaptive-calibrator", stateEndpoint: "/state", dependencies: [], tags: ["governance", "calibration"] },
  { name: "GENESIS-GTC-PARQUET-EXPORT", port: 8781, tier: "TIER_3", containerName: "genesis-gtc-parquet-export", stateEndpoint: null, dependencies: ["GENESIS-GLOBAL-TELEMETRY-CLOUD"], tags: ["governance", "export"] },
  { name: "GENESIS-PRICE-STREAM-EXPORT", port: 8794, tier: "TIER_3", containerName: "genesis-price-stream-export", stateEndpoint: null, dependencies: [], tags: ["governance", "export"] },
  { name: "GENESIS-WARP-SIMULATION-SPEC", port: 8795, tier: "TIER_3", containerName: "genesis-warp-simulation-spec", stateEndpoint: null, dependencies: [], tags: ["governance", "simulation"] },
  { name: "GENESIS-TELEMETRY-COMPRESSION", port: 8796, tier: "TIER_3", containerName: "genesis-telemetry-compression", stateEndpoint: null, dependencies: [], tags: ["governance", "compression"] },
  { name: "GENESIS-BRIGHTON-GPU-INTERFACE", port: 8786, tier: "TIER_3", containerName: "genesis-brighton-gpu-interface", stateEndpoint: null, dependencies: ["GENESIS-BRIGHTON-PROTOCOL"], tags: ["governance", "gpu"] },
  { name: "GENESIS-SPINE-HEARTBEAT", port: 8785, tier: "TIER_3", containerName: "genesis-spine-heartbeat", stateEndpoint: null, dependencies: [], tags: ["governance", "heartbeat"] },
  { name: "GENESIS-GPU-DOCKER-TEMPLATE", port: 8787, tier: "TIER_3", containerName: "genesis-gpu-docker-template", stateEndpoint: null, dependencies: [], tags: ["governance", "gpu"] },
  { name: "GENESIS-WHITEBOARD-VECTOR-SCHEMA", port: 8789, tier: "TIER_3", containerName: "genesis-whiteboard-vector-schema", stateEndpoint: null, dependencies: ["GENESIS-WHITEBOARD"], tags: ["governance", "vector"] },
  { name: "GENESIS-ADVERSARY-DNA-SCHEMA", port: 8788, tier: "TIER_3", containerName: "genesis-adversary-dna-schema", stateEndpoint: null, dependencies: [], tags: ["governance", "adversary"] },
  { name: "GENESIS-CUOPT-ROUTE-SPEC", port: 8793, tier: "TIER_3", containerName: "genesis-cuopt-route-spec", stateEndpoint: null, dependencies: [], tags: ["governance", "routing"] },
  { name: "GENESIS-CENTURION-INDEX", port: 8799, tier: "TIER_3", containerName: "genesis-centurion-index", stateEndpoint: null, dependencies: [], tags: ["governance", "index"] },
  { name: "GENESIS-ARIS", port: 8798, tier: "TIER_3", containerName: "genesis-aris", stateEndpoint: "/state", dependencies: [], tags: ["governance", "risk"] },
  { name: "GENESIS-BATTLE-STATIONS", port: 8810, tier: "TIER_3", containerName: "genesis-battle-stations", stateEndpoint: "/state", dependencies: [], tags: ["governance", "coordination"] },
  { name: "GENESIS-GHOST-FLEET", port: 8811, tier: "TIER_3", containerName: "genesis-ghost-fleet", stateEndpoint: null, dependencies: [], tags: ["governance", "decoy"] },
  { name: "GENESIS-FOLLOW-THE-SUN", port: 8815, tier: "TIER_3", containerName: "genesis-follow-the-sun", stateEndpoint: "/state", dependencies: ["GENESIS-BRIGHTON-PROTOCOL", "GENESIS-CIA", "GENESIS-TREASURY-SENTINEL"], tags: ["governance", "session"] },
  { name: "GENESIS-RED-AGGRESSOR-FORCE", port: 8812, tier: "TIER_3", containerName: "genesis-red-aggressor-force", stateEndpoint: null, dependencies: [], tags: ["governance", "red-team"] },
  { name: "GENESIS-BLACKOUT-PROTOCOL", port: 8860, tier: "TIER_3", containerName: "genesis-blackout-protocol", stateEndpoint: "/state", dependencies: ["GENESIS-CIA", "GENESIS-DARPA", "GENESIS-ARIS"], tags: ["governance", "defence", "recovery"] },
  { name: "GENESIS-MIRROR-FEED", port: 8850, tier: "TIER_2", containerName: "genesis-mirror-feed", stateEndpoint: "/state", dependencies: ["GENESIS-INGESTION-GATE", "GENESIS-CEX-EXECUTOR", "GENESIS-BEACHHEAD-EXECUTOR", "GENESIS-CIA"], tags: ["intelligence", "self-referential", "weapon"] },
  { name: "GENESIS-SELF-ONTOLOGY", port: 8851, tier: "TIER_2", containerName: "genesis-self-ontology", stateEndpoint: "/state", dependencies: ["GENESIS-MIRROR-FEED", "GENESIS-CIA", "GENESIS-WHITEBOARD"], tags: ["intelligence", "self-referential", "weapon"] },
  { name: "GENESIS-SIG-NULLIFIER", port: 8852, tier: "TIER_2", containerName: "genesis-sig-nullifier", stateEndpoint: "/state", dependencies: ["GENESIS-MIRROR-FEED", "GENESIS-SENTRY", "GENESIS-KLINGON-CLOAKING"], tags: ["stealth", "weapon", "srcs"] },
  { name: "GENESIS-GHOSTBAT-WINGMAN", port: 8853, tier: "TIER_2", containerName: "genesis-ghostbat-wingman", stateEndpoint: "/state", dependencies: ["GENESIS-ARB-DETECTOR", "GENESIS-CEX-EXECUTOR", "GENESIS-BEACHHEAD-EXECUTOR"], tags: ["stealth", "weapon", "formation"] },
  { name: "GENESIS-PHANTOM-PULSE", port: 8854, tier: "TIER_2", containerName: "genesis-phantom-pulse", stateEndpoint: "/state", dependencies: ["GENESIS-SENTRY", "GENESIS-GHOST-SIMULATOR", "GENESIS-KLINGON-CLOAKING"], tags: ["stealth", "weapon", "ew"] },
  { name: "GENESIS-REGIME-DETECTOR", port: 8855, tier: "TIER_2", containerName: "genesis-regime-detector", stateEndpoint: "/state", dependencies: ["GENESIS-ARB-DETECTOR"], tags: ["intel", "recon", "weapon", "hmm"] },

  // --- TIER_4: Ingestors ---
  // Core 6
  { name: "GENESIS-INGESTOR-BINANCE", port: 8525, tier: "TIER_4", containerName: "genesis-exchange-pair-ingestor-binance", stateEndpoint: null, dependencies: ["GENESIS-INGESTION-GATE"], tags: ["ingestor", "cex", "core"] },
  { name: "GENESIS-INGESTOR-KRAKEN", port: 8526, tier: "TIER_4", containerName: "genesis-exchange-pair-ingestor-kraken", stateEndpoint: null, dependencies: ["GENESIS-INGESTION-GATE"], tags: ["ingestor", "cex", "core"] },
  { name: "GENESIS-INGESTOR-GATEIO", port: 8527, tier: "TIER_4", containerName: "genesis-exchange-pair-ingestor-gateio", stateEndpoint: null, dependencies: ["GENESIS-INGESTION-GATE"], tags: ["ingestor", "cex", "core"] },
  { name: "GENESIS-INGESTOR-BYBIT", port: 8528, tier: "TIER_4", containerName: "genesis-exchange-pair-ingestor-bybit", stateEndpoint: null, dependencies: ["GENESIS-INGESTION-GATE"], tags: ["ingestor", "cex", "core"] },
  { name: "GENESIS-INGESTOR-OKX", port: 8529, tier: "TIER_4", containerName: "genesis-exchange-pair-ingestor-okx", stateEndpoint: null, dependencies: ["GENESIS-INGESTION-GATE"], tags: ["ingestor", "cex", "core"] },
  { name: "GENESIS-INGESTOR-BITSTAMP", port: 8530, tier: "TIER_4", containerName: "genesis-exchange-pair-ingestor-bitstamp", stateEndpoint: null, dependencies: ["GENESIS-INGESTION-GATE"], tags: ["ingestor", "cex", "core"] },
  // Expansion 14
  { name: "GENESIS-INGRESS-COINBASE", port: 8531, tier: "TIER_4", containerName: "genesis-ingress-coinbase", stateEndpoint: null, dependencies: ["GENESIS-INGESTION-GATE"], tags: ["ingestor", "cex", "expansion"] },
  { name: "GENESIS-INGRESS-MEXC", port: 8532, tier: "TIER_4", containerName: "genesis-ingress-mexc", stateEndpoint: null, dependencies: ["GENESIS-INGESTION-GATE"], tags: ["ingestor", "cex", "expansion"] },
  { name: "GENESIS-INGRESS-KUCOIN", port: 8533, tier: "TIER_4", containerName: "genesis-ingress-kucoin", stateEndpoint: null, dependencies: ["GENESIS-INGESTION-GATE"], tags: ["ingestor", "cex", "expansion"] },
  { name: "GENESIS-INGRESS-BITFINEX", port: 8534, tier: "TIER_4", containerName: "genesis-ingress-bitfinex", stateEndpoint: null, dependencies: ["GENESIS-INGESTION-GATE"], tags: ["ingestor", "cex", "expansion"] },
  { name: "GENESIS-INGRESS-HTX", port: 8535, tier: "TIER_4", containerName: "genesis-ingress-htx", stateEndpoint: null, dependencies: ["GENESIS-INGESTION-GATE"], tags: ["ingestor", "cex", "expansion"] },
  { name: "GENESIS-INGRESS-BITGET", port: 8536, tier: "TIER_4", containerName: "genesis-ingress-bitget", stateEndpoint: null, dependencies: ["GENESIS-INGESTION-GATE"], tags: ["ingestor", "cex", "expansion"] },
  { name: "GENESIS-INGRESS-PHEMEX", port: 8537, tier: "TIER_4", containerName: "genesis-ingress-phemex", stateEndpoint: null, dependencies: ["GENESIS-INGESTION-GATE"], tags: ["ingestor", "cex", "expansion"] },
  { name: "GENESIS-INGRESS-WHITEBIT", port: 8538, tier: "TIER_4", containerName: "genesis-ingress-whitebit", stateEndpoint: null, dependencies: ["GENESIS-INGESTION-GATE"], tags: ["ingestor", "cex", "expansion"] },
  { name: "GENESIS-INGRESS-BITMART", port: 8539, tier: "TIER_4", containerName: "genesis-ingress-bitmart", stateEndpoint: null, dependencies: ["GENESIS-INGESTION-GATE"], tags: ["ingestor", "cex", "expansion"] },
  { name: "GENESIS-INGRESS-POLONIEX", port: 8540, tier: "TIER_4", containerName: "genesis-ingress-poloniex", stateEndpoint: null, dependencies: ["GENESIS-INGESTION-GATE"], tags: ["ingestor", "cex", "expansion"] },
  { name: "GENESIS-INGRESS-XT", port: 8541, tier: "TIER_4", containerName: "genesis-ingress-xt", stateEndpoint: null, dependencies: ["GENESIS-INGESTION-GATE"], tags: ["ingestor", "cex", "expansion"] },
  { name: "GENESIS-INGRESS-BITRUE", port: 8542, tier: "TIER_4", containerName: "genesis-ingress-bitrue", stateEndpoint: null, dependencies: ["GENESIS-INGESTION-GATE"], tags: ["ingestor", "cex", "expansion"] },
  { name: "GENESIS-INGRESS-LBANK", port: 8543, tier: "TIER_4", containerName: "genesis-ingress-lbank", stateEndpoint: null, dependencies: ["GENESIS-INGESTION-GATE"], tags: ["ingestor", "cex", "expansion"] },
  { name: "GENESIS-INGRESS-BINGX", port: 8544, tier: "TIER_4", containerName: "genesis-ingress-bingx", stateEndpoint: null, dependencies: ["GENESIS-INGESTION-GATE"], tags: ["ingestor", "cex", "expansion"] },
  { name: "GENESIS-INGRESS-REINFORCEMENTS", port: 8545, tier: "TIER_4", containerName: "genesis-ingress-reinforcements", stateEndpoint: null, dependencies: ["GENESIS-INGESTION-GATE"], tags: ["ingestor", "cex", "reinforcements"] },
  // DEX + Infra
  { name: "GENESIS-DEX-INGESTOR-UNIVERSAL", port: 8560, tier: "TIER_4", containerName: "genesis-dex-ingestor-universal", stateEndpoint: "/state", dependencies: [], tags: ["ingestor", "dex", "universal"] },
  { name: "GENESIS-INGESTION-GATE", port: 8700, tier: "TIER_4", containerName: "genesis-ingestion-gate", stateEndpoint: "/state", dependencies: [], tags: ["ingestor", "gate"] },
];

type StatusChangeListener = (result: ProbeResult) => void;

export class InspectorService {
  private services: Map<string, ServiceRecord> = new Map();
  private probeHistory: ProbeResult[] = [];
  private readonly maxHistory: number;
  private listeners: StatusChangeListener[] = [];
  private totalProbes = 0;

  constructor(maxHistory = 2000) {
    this.maxHistory = maxHistory;
    this.seedCatalog();
  }

  private seedCatalog(): void {
    const now = new Date().toISOString();
    for (const entry of SEED_CATALOG) {
      const record: ServiceRecord = {
        name: entry.name,
        port: entry.port,
        tier: entry.tier,
        healthEndpoint: "/health",
        stateEndpoint: entry.stateEndpoint,
        containerName: entry.containerName,
        dependencies: entry.dependencies,
        tags: entry.tags,
        status: "GREEN",
        lastProbeAt: null,
        lastProbeLatencyMs: 0,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        lastHealAction: null,
        lastHealAt: null,
        healAttempts: 0,
        healSuccesses: 0,
        registeredAt: now,
        updatedAt: now,
      };
      this.services.set(entry.name, record);
    }
  }

  // --- Probe a single service ---

  async probe(service: ServiceRecord): Promise<ProbeResult> {
    const start = Date.now();
    const previousStatus = service.status;
    const timeout = TIER_PROBE_TIMEOUT_MS[service.tier];
    let httpStatus: number | null = null;
    let responseBody: string | null = null;
    let error: string | null = null;
    let newStatus: ServiceStatus;

    try {
      const url = `http://${service.containerName}:${service.port}${service.healthEndpoint}`;
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeout),
      });
      httpStatus = response.status;
      responseBody = await response.text();
      const latency = Date.now() - start;

      if (response.ok) {
        // Check for slow response (AMBER threshold)
        const slowThreshold = service.tier === "TIER_0" || service.tier === "TIER_1" ? 2000 : 5000;
        if (latency > slowThreshold) {
          newStatus = "AMBER";
          service.consecutiveFailures = 0;
          service.consecutiveSuccesses++;
        } else {
          newStatus = "GREEN";
          service.consecutiveFailures = 0;
          service.consecutiveSuccesses++;
        }
      } else {
        service.consecutiveFailures++;
        service.consecutiveSuccesses = 0;
        newStatus = service.consecutiveFailures >= 5 ? "BLACK"
          : service.consecutiveFailures >= 2 ? "RED"
          : "AMBER";
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      service.consecutiveFailures++;
      service.consecutiveSuccesses = 0;
      newStatus = service.consecutiveFailures >= 5 ? "BLACK"
        : service.consecutiveFailures >= 2 ? "RED"
        : "AMBER";
    }

    const latencyMs = Date.now() - start;
    const statusChanged = newStatus !== previousStatus;

    // Update service record
    service.status = newStatus;
    service.lastProbeAt = new Date().toISOString();
    service.lastProbeLatencyMs = latencyMs;
    service.updatedAt = service.lastProbeAt;

    const result: ProbeResult = {
      service: service.name,
      port: service.port,
      status: newStatus,
      previousStatus,
      statusChanged,
      latencyMs,
      httpStatus,
      responseBody: responseBody ? responseBody.slice(0, 500) : null,
      error,
      timestamp: service.lastProbeAt,
    };

    this.totalProbes++;
    this.probeHistory.push(result);
    if (this.probeHistory.length > this.maxHistory) {
      this.probeHistory.shift();
    }

    // Notify listeners on status change to RED or BLACK
    if (statusChanged && (newStatus === "RED" || newStatus === "BLACK")) {
      for (const listener of this.listeners) {
        try {
          listener(result);
        } catch {
          // swallow listener errors
        }
      }
    }

    return result;
  }

  // --- Probe all services for a given tier ---

  async probeTier(tier: ServiceTier): Promise<ProbeResult[]> {
    const services = this.getServicesByTier(tier);
    const results: ProbeResult[] = [];
    for (const service of services) {
      results.push(await this.probe(service));
    }
    return results;
  }

  // --- Rapid re-probe (3 pings) for healing confirmation ---

  async rapidProbe(serviceName: string): Promise<ProbeResult[]> {
    const service = this.services.get(serviceName);
    if (!service) return [];
    const results: ProbeResult[] = [];
    for (let i = 0; i < 3; i++) {
      results.push(await this.probe(service));
      if (i < 2) await new Promise((r) => setTimeout(r, 1000));
    }
    return results;
  }

  // --- Registration ---

  register(payload: ServiceRegistrationPayload): ServiceRecord {
    const now = new Date().toISOString();
    const record: ServiceRecord = {
      name: payload.name,
      port: payload.port,
      tier: payload.tier ?? "TIER_4",
      healthEndpoint: payload.healthEndpoint ?? "/health",
      stateEndpoint: payload.stateEndpoint ?? null,
      containerName: payload.containerName ?? payload.name.toLowerCase().replace(/_/g, "-"),
      dependencies: payload.dependencies ?? [],
      tags: payload.tags ?? [],
      status: "GREEN",
      lastProbeAt: null,
      lastProbeLatencyMs: 0,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      lastHealAction: null,
      lastHealAt: null,
      healAttempts: 0,
      healSuccesses: 0,
      registeredAt: now,
      updatedAt: now,
    };
    this.services.set(payload.name, record);
    return record;
  }

  bulkRegister(payloads: ServiceRegistrationPayload[]): ServiceRecord[] {
    return payloads.map((p) => this.register(p));
  }

  // --- Listeners ---

  onStatusChange(callback: StatusChangeListener): void {
    this.listeners.push(callback);
  }

  // --- Queries ---

  getService(name: string): ServiceRecord | undefined {
    return this.services.get(name);
  }

  getAllServices(): ServiceRecord[] {
    return Array.from(this.services.values());
  }

  getServicesByTier(tier: ServiceTier): ServiceRecord[] {
    return this.getAllServices().filter((s) => s.tier === tier);
  }

  getServicesByStatus(status: ServiceStatus): ServiceRecord[] {
    return this.getAllServices().filter((s) => s.status === status);
  }

  getProbeHistory(limit = 50): ProbeResult[] {
    return this.probeHistory.slice(-limit);
  }

  getServiceProbeHistory(name: string, limit = 20): ProbeResult[] {
    return this.probeHistory.filter((p) => p.service === name).slice(-limit);
  }

  getTotalProbes(): number {
    return this.totalProbes;
  }

  getServiceCount(): number {
    return this.services.size;
  }

  getStatusCounts(): Record<ServiceStatus, number> {
    const counts: Record<ServiceStatus, number> = { GREEN: 0, AMBER: 0, RED: 0, BLACK: 0 };
    for (const s of this.services.values()) {
      counts[s.status]++;
    }
    return counts;
  }

  // --- For healer: update service after heal ---

  updateServiceHeal(name: string, action: string, success: boolean): void {
    const service = this.services.get(name);
    if (!service) return;
    service.lastHealAction = action;
    service.lastHealAt = new Date().toISOString();
    service.healAttempts++;
    if (success) service.healSuccesses++;
    service.updatedAt = service.lastHealAt;
  }

  // --- Service dependencies ---

  getDependencies(name: string): ServiceRecord[] {
    const service = this.services.get(name);
    if (!service) return [];
    return service.dependencies
      .map((dep) => this.services.get(dep))
      .filter((s): s is ServiceRecord => s !== undefined);
  }
}
