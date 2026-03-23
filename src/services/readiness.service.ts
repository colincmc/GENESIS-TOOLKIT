// ============================================================================
// GENESIS-TOOLKIT — Readiness Service
// Battlegroup Mission Capable Rate. The #1 metric. Commander's priority.
// BATTLE_READY = 95-100. MISSION_CAPABLE = 85-94. DEGRADED = 70-84.
// LIMITED = 50-69. NON_OPERATIONAL = <50.
// ============================================================================

import { InspectorService } from "./inspector.service";
import {
  ReadinessScore,
  ReadinessCategory,
  ReadinessHistoryEntry,
  TierReadiness,
  ServiceTier,
  ServiceStatus,
  TIER_WEIGHTS,
} from "../types";

const TIERS: ServiceTier[] = ["TIER_0", "TIER_1", "TIER_2", "TIER_3", "TIER_4"];

const STATUS_HEALTH: Record<ServiceStatus, number> = {
  GREEN: 1.0,
  AMBER: 0.7,
  RED: 0.2,
  BLACK: 0.0,
};

function categorize(score: number): ReadinessCategory {
  if (score >= 95) return "BATTLE_READY";
  if (score >= 85) return "MISSION_CAPABLE";
  if (score >= 70) return "DEGRADED";
  if (score >= 50) return "LIMITED";
  return "NON_OPERATIONAL";
}

export class ReadinessService {
  private inspector: InspectorService;
  private current: ReadinessScore;
  private history: ReadinessHistoryEntry[] = [];
  private readonly maxHistory: number;

  constructor(inspector: InspectorService, maxHistory = 2880) {
    // 2880 = 24h at 30s intervals
    this.inspector = inspector;
    this.maxHistory = maxHistory;
    this.current = this.compute();
  }

  // --- Compute readiness score ---

  compute(): ReadinessScore {
    const services = this.inspector.getAllServices();
    let totalWeight = 0;
    let weightedHealth = 0;
    const statusCounts: Record<ServiceStatus, number> = { GREEN: 0, AMBER: 0, RED: 0, BLACK: 0 };

    const tierBreakdown: TierReadiness[] = TIERS.map((tier) => {
      const tierServices = services.filter((s) => s.tier === tier);
      const weight = TIER_WEIGHTS[tier];
      let tierGreen = 0;
      let tierAmber = 0;
      let tierRed = 0;
      let tierBlack = 0;
      let tierWeightedHealth = 0;
      let tierTotalWeight = 0;

      for (const s of tierServices) {
        const health = STATUS_HEALTH[s.status];
        tierWeightedHealth += weight * health;
        tierTotalWeight += weight;
        totalWeight += weight;
        weightedHealth += weight * health;
        statusCounts[s.status]++;

        if (s.status === "GREEN") tierGreen++;
        else if (s.status === "AMBER") tierAmber++;
        else if (s.status === "RED") tierRed++;
        else tierBlack++;
      }

      const tierScore = tierTotalWeight > 0
        ? (tierWeightedHealth / tierTotalWeight) * 100
        : 100;

      return {
        tier,
        score: Math.round(tierScore * 10) / 10,
        total: tierServices.length,
        green: tierGreen,
        amber: tierAmber,
        red: tierRed,
        black: tierBlack,
      };
    });

    const composite = totalWeight > 0
      ? Math.round((weightedHealth / totalWeight) * 1000) / 10
      : 100;

    const score: ReadinessScore = {
      composite,
      category: categorize(composite),
      tierBreakdown,
      totalServices: services.length,
      greenCount: statusCounts.GREEN,
      amberCount: statusCounts.AMBER,
      redCount: statusCounts.RED,
      blackCount: statusCounts.BLACK,
      computedAt: new Date().toISOString(),
    };

    this.current = score;

    // Record history
    this.history.push({
      composite: score.composite,
      category: score.category,
      timestamp: score.computedAt,
    });
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    return score;
  }

  // --- Queries ---

  getCurrent(): ReadinessScore {
    return this.current;
  }

  getHistory(limit = 100): ReadinessHistoryEntry[] {
    return this.history.slice(-limit);
  }

  isReady(): boolean {
    return this.current.composite >= 85;
  }

  isBattleReady(): boolean {
    return this.current.composite >= 95;
  }

  getTierReadiness(tier: ServiceTier): TierReadiness | undefined {
    return this.current.tierBreakdown.find((t) => t.tier === tier);
  }
}
