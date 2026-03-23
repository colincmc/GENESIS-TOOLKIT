// ============================================================================
// GENESIS-TOOLKIT — Type System
// Stack Health, Dynamic Repair & Battlegroup Readiness
// "Don't expect, inspect." Perpetual loop mission. Fix first, report second.
// No medals, home. SAS doctrine.
// ============================================================================

// --- Service Criticality Tiers ---

export type ServiceTier = "TIER_0" | "TIER_1" | "TIER_2" | "TIER_3" | "TIER_4";

export type ServiceStatus = "GREEN" | "AMBER" | "RED" | "BLACK";

export const TIER_WEIGHTS: Record<ServiceTier, number> = {
  TIER_0: 5.0,
  TIER_1: 4.0,
  TIER_2: 3.0,
  TIER_3: 2.0,
  TIER_4: 1.0,
};

export const TIER_PROBE_CADENCE_MS: Record<ServiceTier, number> = {
  TIER_0: 10_000,
  TIER_1: 15_000,
  TIER_2: 30_000,
  TIER_3: 60_000,
  TIER_4: 120_000,
};

export const TIER_PROBE_TIMEOUT_MS: Record<ServiceTier, number> = {
  TIER_0: 5_000,
  TIER_1: 5_000,
  TIER_2: 10_000,
  TIER_3: 10_000,
  TIER_4: 10_000,
};

// --- Service Registry ---

export interface ServiceRecord {
  name: string;
  port: number;
  tier: ServiceTier;
  healthEndpoint: string;
  stateEndpoint: string | null;
  containerName: string;
  dependencies: string[];
  tags: string[];
  // Runtime state
  status: ServiceStatus;
  lastProbeAt: string | null;
  lastProbeLatencyMs: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastHealAction: string | null;
  lastHealAt: string | null;
  healAttempts: number;
  healSuccesses: number;
  registeredAt: string;
  updatedAt: string;
}

// --- Probe Results ---

export interface ProbeResult {
  service: string;
  port: number;
  status: ServiceStatus;
  previousStatus: ServiceStatus;
  statusChanged: boolean;
  latencyMs: number;
  httpStatus: number | null;
  responseBody: string | null;
  error: string | null;
  timestamp: string;
}

// --- Heal Events ---

export type HealAction =
  | "RE_PROBE"
  | "RESTART"
  | "DEPENDENCY_FIX"
  | "ESCALATE";

export type HealResult = "HEALED" | "PARTIAL" | "FAILED";

export interface HealEvent {
  id: string;
  service: string;
  tier: ServiceTier;
  trigger: "RED" | "BLACK";
  action: HealAction;
  result: HealResult;
  durationMs: number;
  detail: string;
  timestamp: string;
}

// --- Readiness ---

export type ReadinessCategory =
  | "BATTLE_READY"
  | "MISSION_CAPABLE"
  | "DEGRADED"
  | "LIMITED"
  | "NON_OPERATIONAL";

export interface TierReadiness {
  tier: ServiceTier;
  score: number;
  total: number;
  green: number;
  amber: number;
  red: number;
  black: number;
}

export interface ReadinessScore {
  composite: number;
  category: ReadinessCategory;
  tierBreakdown: TierReadiness[];
  totalServices: number;
  greenCount: number;
  amberCount: number;
  redCount: number;
  blackCount: number;
  computedAt: string;
}

export interface ReadinessHistoryEntry {
  composite: number;
  category: ReadinessCategory;
  timestamp: string;
}

// --- Synthetic Pipelines ---

export type SyntheticPipeline =
  | "PRICE_FEED"
  | "INTELLIGENCE_LOOP"
  | "SESSION_MANIFEST"
  | "TELEMETRY_INGEST"
  | "EXECUTION_READINESS";

export type SyntheticStatus = "PASS" | "FAIL" | "TIMEOUT" | "SKIPPED";

export interface SyntheticResult {
  pipeline: SyntheticPipeline;
  status: SyntheticStatus;
  latencyMs: number;
  detail: string;
  consecutiveFailures: number;
  lastPassAt: string | null;
  testedAt: string;
}

// --- Preventive Maintenance ---

export type PreventiveFinding =
  | "STALE_SERVICE"
  | "HIGH_LATENCY"
  | "MEMORY_PRESSURE"
  | "STALE_CACHE"
  | "DEPENDENCY_CHAIN"
  | "CONNECTION_EXHAUSTION";

export interface PreventiveEvent {
  id: string;
  service: string;
  finding: PreventiveFinding;
  severity: "LOW" | "MEDIUM" | "HIGH";
  detail: string;
  actionTaken: string | null;
  timestamp: string;
}

// --- Escalation ---

export type EscalationLevel = "WATCH" | "WARNING" | "CRITICAL";

export interface EscalationEvent {
  id: string;
  level: EscalationLevel;
  condition: string;
  services: string[];
  detail: string;
  sentToBattleStations: boolean;
  timestamp: string;
}

// --- Service State ---

export interface ToolkitState {
  readiness: ReadinessScore;
  totalServices: number;
  servicesByStatus: Record<ServiceStatus, number>;
  totalProbes: number;
  totalHeals: number;
  totalHealSuccesses: number;
  totalSyntheticRuns: number;
  syntheticPassRate: number;
  totalPreventiveFindings: number;
  totalEscalations: number;
  lastProbeAt: string | null;
  lastHealAt: string | null;
  lastSyntheticAt: string | null;
  lastPreventiveAt: string | null;
  lastForwardAt: string | null;
  uptime: number;
}

// --- Service Registration Payload ---

export interface ServiceRegistrationPayload {
  name: string;
  port: number;
  tier?: ServiceTier;
  healthEndpoint?: string;
  stateEndpoint?: string;
  containerName?: string;
  dependencies?: string[];
  tags?: string[];
}
