// ============================================================================
// GENESIS-TOOLKIT — Healer Service
// Dynamic Repair. Day One. Fix on the spot, then report battle-ready.
// "NOT PANICKING. FIX. REPORT WHAT. REPORT ACTION. REPORT SOLVED. MOVE ON.
//  NO MEDALS. HOME." — Commander's doctrine. SAS.
// ============================================================================

import Dockerode from "dockerode";
import { InspectorService } from "./inspector.service";
import {
  HealEvent,
  HealAction,
  HealResult,
  ServiceRecord,
  ProbeResult,
} from "../types";

type HealListener = (event: HealEvent) => void;

export class HealerService {
  private docker: Dockerode;
  private inspector: InspectorService;
  private healHistory: HealEvent[] = [];
  private readonly maxHistory: number;
  private healCounter = 0;
  private activeHeals: Set<string> = new Set();
  private listeners: HealListener[] = [];
  private totalHeals = 0;
  private totalSuccesses = 0;

  constructor(inspector: InspectorService, maxHistory = 500) {
    this.inspector = inspector;
    this.maxHistory = maxHistory;

    // Connect to Docker socket
    try {
      this.docker = new Dockerode({ socketPath: "/var/run/docker.sock" });
    } catch {
      // Fallback: Docker may not be available in dev
      this.docker = new Dockerode();
    }

    // Wire into Inspector: on RED/BLACK, heal immediately
    this.inspector.onStatusChange((result: ProbeResult) => {
      if (result.status === "RED" || result.status === "BLACK") {
        this.heal(result.service, result.status).catch(() => {
          // swallow — healer handles its own errors
        });
      }
    });
  }

  // --- Main heal flow ---
  // DETECT RED → Rapid re-probe (3x) → Still RED?
  //   YES → docker restart → Wait 10s → Re-probe
  //     → GREEN? → "Fixed. Battle-ready." → MOVE ON
  //     → Still RED? → Check dependencies → Fix upstream if needed
  //       → Re-probe → GREEN? → Log fix → MOVE ON
  //       → Still RED after 3 attempts? → Escalate (TIER_0/1 only)
  //   NO (was blip) → "Transient. Cleared." → MOVE ON

  async heal(serviceName: string, trigger: "RED" | "BLACK"): Promise<HealEvent> {
    // Prevent concurrent heals on the same service
    if (this.activeHeals.has(serviceName)) {
      return this.createEvent(serviceName, trigger, "RE_PROBE", "PARTIAL",
        0, "Heal already in progress.");
    }

    this.activeHeals.add(serviceName);
    const start = Date.now();
    const service = this.inspector.getService(serviceName);

    if (!service) {
      this.activeHeals.delete(serviceName);
      return this.createEvent(serviceName, trigger, "RE_PROBE", "FAILED",
        0, "Service not found in registry.");
    }

    try {
      // --- Level 1: Rapid re-probe (confirm it's real) ---
      const rapidResults = await this.inspector.rapidProbe(serviceName);
      const lastRapid = rapidResults[rapidResults.length - 1];

      if (lastRapid && lastRapid.status === "GREEN") {
        // Was a blip. Cleared.
        const event = this.createEvent(serviceName, trigger, "RE_PROBE", "HEALED",
          Date.now() - start, "Transient. Cleared on re-probe. Battle-ready.");
        this.inspector.updateServiceHeal(serviceName, "RE_PROBE", true);
        return event;
      }

      // --- Level 2: Docker restart ---
      const restartResult = await this.restartContainer(service);
      if (restartResult) {
        // Wait for service to come up
        await this.sleep(10_000);
        const postRestart = await this.inspector.rapidProbe(serviceName);
        const lastPost = postRestart[postRestart.length - 1];

        if (lastPost && lastPost.status === "GREEN") {
          const event = this.createEvent(serviceName, trigger, "RESTART", "HEALED",
            Date.now() - start,
            `Restarted ${service.containerName}. GREEN after ${((Date.now() - start) / 1000).toFixed(1)}s. Battle-ready.`);
          this.inspector.updateServiceHeal(serviceName, "RESTART", true);
          return event;
        }
      }

      // --- Level 3: Dependency check ---
      const deps = this.inspector.getDependencies(serviceName);
      const redDeps = deps.filter((d) => d.status === "RED" || d.status === "BLACK");

      if (redDeps.length > 0) {
        // Fix dependencies first
        for (const dep of redDeps) {
          if (!this.activeHeals.has(dep.name)) {
            await this.restartContainer(dep);
            await this.sleep(8_000);
            await this.inspector.rapidProbe(dep.name);
          }
        }

        // Now re-probe the original service
        await this.sleep(5_000);
        const postDepFix = await this.inspector.rapidProbe(serviceName);
        const lastDepFix = postDepFix[postDepFix.length - 1];

        if (lastDepFix && lastDepFix.status === "GREEN") {
          const fixedDeps = redDeps.map((d) => d.name).join(", ");
          const event = this.createEvent(serviceName, trigger, "DEPENDENCY_FIX", "HEALED",
            Date.now() - start,
            `Fixed dependencies [${fixedDeps}]. ${serviceName} now GREEN. Battle-ready.`);
          this.inspector.updateServiceHeal(serviceName, "DEPENDENCY_FIX", true);
          return event;
        }
      }

      // --- Level 4: Second restart attempt ---
      await this.restartContainer(service);
      await this.sleep(12_000);
      const finalProbe = await this.inspector.rapidProbe(serviceName);
      const lastFinal = finalProbe[finalProbe.length - 1];

      if (lastFinal && lastFinal.status === "GREEN") {
        const event = this.createEvent(serviceName, trigger, "RESTART", "HEALED",
          Date.now() - start,
          `Second restart of ${service.containerName}. GREEN after ${((Date.now() - start) / 1000).toFixed(1)}s. Battle-ready.`);
        this.inspector.updateServiceHeal(serviceName, "RESTART", true);
        return event;
      }

      // --- Level 5: Escalate (TIER_0/1 only) ---
      if (service.tier === "TIER_0" || service.tier === "TIER_1") {
        const event = this.createEvent(serviceName, trigger, "ESCALATE", "FAILED",
          Date.now() - start,
          `${serviceName} unrecoverable after 3 heal attempts. Escalating to Battle Stations.`);
        this.inspector.updateServiceHeal(serviceName, "ESCALATE", false);
        return event;
      }

      // Lower tiers: log failure, move on
      const event = this.createEvent(serviceName, trigger, "RESTART", "FAILED",
        Date.now() - start,
        `${serviceName} (${service.tier}) remains ${service.status} after heal attempts. Logged. Moving on.`);
      this.inspector.updateServiceHeal(serviceName, "RESTART", false);
      return event;

    } finally {
      this.activeHeals.delete(serviceName);
    }
  }

  // --- Docker restart ---

  private async restartContainer(service: ServiceRecord): Promise<boolean> {
    try {
      const container = this.docker.getContainer(service.containerName);
      await container.restart({ t: 10 });
      return true;
    } catch {
      // Docker may not be available or container name wrong
      return false;
    }
  }

  // --- Create heal event ---

  private createEvent(
    service: string,
    trigger: "RED" | "BLACK",
    action: HealAction,
    result: HealResult,
    durationMs: number,
    detail: string,
  ): HealEvent {
    this.healCounter++;
    this.totalHeals++;
    if (result === "HEALED") this.totalSuccesses++;

    const svc = this.inspector.getService(service);
    const event: HealEvent = {
      id: `TK-HEAL-${this.healCounter}-${Date.now()}`,
      service,
      tier: svc?.tier ?? "TIER_4",
      trigger,
      action,
      result,
      durationMs,
      detail,
      timestamp: new Date().toISOString(),
    };

    this.healHistory.push(event);
    if (this.healHistory.length > this.maxHistory) {
      this.healHistory.shift();
    }

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // swallow
      }
    }

    return event;
  }

  // --- Listeners ---

  onHeal(callback: HealListener): void {
    this.listeners.push(callback);
  }

  // --- Queries ---

  getHealHistory(limit = 50): HealEvent[] {
    return this.healHistory.slice(-limit);
  }

  getActiveHeals(): string[] {
    return Array.from(this.activeHeals);
  }

  isHealing(serviceName: string): boolean {
    return this.activeHeals.has(serviceName);
  }

  getTotalHeals(): number {
    return this.totalHeals;
  }

  getTotalSuccesses(): number {
    return this.totalSuccesses;
  }

  getHealRate(): number {
    return this.totalHeals > 0 ? this.totalSuccesses / this.totalHeals : 1.0;
  }

  // --- Utility ---

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
