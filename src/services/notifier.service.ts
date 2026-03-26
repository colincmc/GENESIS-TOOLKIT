// ============================================================================
// GENESIS-TOOLKIT — Notifier Service
// Pre-Flight and alert notifications. 3 channels:
// 1. Signal (signal-cli, E2E encrypted — Commander's choice)
// 2. Email (nodemailer SMTP)
// 3. GOD Dashboard (stub for future development)
// All fire concurrently. Never block. Graceful fallback per channel.
// ============================================================================

import { execFile } from "child_process";
import { createTransport, Transporter } from "nodemailer";
import {
  PreflightResult,
  PreflightVerdict,
  PreflightPhaseResult,
  PreflightHeartbeat,
  PreflightTrace,
  PreflightCapitalCheck,
  NotificationChannel,
  NotificationResult,
  GodPreflightPayload,
  GodAlertPayload,
} from "../types";

// --- Env vars ---

const SIGNAL_SENDER = process.env.SIGNAL_SENDER ?? "";
const SIGNAL_RECIPIENT = process.env.SIGNAL_RECIPIENT ?? "";
const SMTP_HOST = process.env.SMTP_HOST ?? "";
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 587);
const SMTP_USER = process.env.SMTP_USER ?? "";
const SMTP_PASS = process.env.SMTP_PASS ?? "";
const EMAIL_FROM = process.env.EMAIL_FROM ?? "toolkit@genesis-capital.io";
const EMAIL_TO = process.env.EMAIL_TO ?? "";
const GOD_URL = process.env.GOD_URL ?? "";

const SIGNAL_TIMEOUT_MS = 15_000;

export class NotifierService {
  private emailTransport: Transporter | null = null;

  constructor() {
    // Initialize SMTP transport if configured
    if (SMTP_HOST && SMTP_USER) {
      try {
        this.emailTransport = createTransport({
          host: SMTP_HOST,
          port: SMTP_PORT,
          secure: SMTP_PORT === 465,
          auth: { user: SMTP_USER, pass: SMTP_PASS },
        });
        console.log(`[TOOLKIT] Notifier: Email channel configured (${SMTP_HOST}:${SMTP_PORT})`);
      } catch (e) {
        console.log(`[TOOLKIT] Notifier: Email channel failed to initialize — ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  // --- Notify pre-flight result (all channels concurrently) ---

  async notifyPreflightResult(result: PreflightResult): Promise<NotificationResult[]> {
    const textMessage = this.formatPreflightText(result);
    const htmlMessage = this.formatPreflightHtml(result);
    const subject = `GENESIS Pre-Flight: ${result.verdict} | MCR ${result.mcr}%`;

    const promises = await Promise.allSettled([
      this.sendSignal(textMessage),
      this.sendEmail(subject, textMessage, htmlMessage),
      this.sendGod<GodPreflightPayload>({
        type: "PREFLIGHT_RESULT",
        result,
        notifications: [],
        timestamp: new Date().toISOString(),
      }),
    ]);

    return promises.map((p, i) => {
      const channels: NotificationChannel[] = ["SIGNAL", "EMAIL", "GOD"];
      if (p.status === "fulfilled") return p.value;
      return {
        channel: channels[i],
        sent: false,
        error: p.reason instanceof Error ? p.reason.message : String(p.reason),
        timestamp: new Date().toISOString(),
      };
    });
  }

  // --- Notify ad-hoc alert ---

  async notifyAlert(severity: string, title: string, message: string): Promise<NotificationResult[]> {
    const text = `GENESIS ALERT [${severity}]\n${title}\n${message}`;
    const html = `<h2 style="color:${severity === "CRITICAL" ? "red" : severity === "WARNING" ? "orange" : "blue"}">[${severity}] ${title}</h2><p>${message}</p>`;

    const promises = await Promise.allSettled([
      this.sendSignal(text),
      this.sendEmail(`GENESIS Alert: [${severity}] ${title}`, text, html),
      this.sendGod<GodAlertPayload>({
        type: "ALERT",
        severity,
        title,
        message,
        timestamp: new Date().toISOString(),
      }),
    ]);

    return promises.map((p, i) => {
      const channels: NotificationChannel[] = ["SIGNAL", "EMAIL", "GOD"];
      if (p.status === "fulfilled") return p.value;
      return {
        channel: channels[i],
        sent: false,
        error: p.reason instanceof Error ? p.reason.message : String(p.reason),
        timestamp: new Date().toISOString(),
      };
    });
  }

  // --- Signal (signal-cli) ---

  private sendSignal(message: string): Promise<NotificationResult> {
    return new Promise((resolve) => {
      if (!SIGNAL_SENDER || !SIGNAL_RECIPIENT) {
        resolve({
          channel: "SIGNAL",
          sent: false,
          error: "Signal not configured (SIGNAL_SENDER/SIGNAL_RECIPIENT empty)",
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const timeout = setTimeout(() => {
        resolve({
          channel: "SIGNAL",
          sent: false,
          error: "Signal send timed out",
          timestamp: new Date().toISOString(),
        });
      }, SIGNAL_TIMEOUT_MS);

      execFile(
        "signal-cli",
        ["-u", SIGNAL_SENDER, "send", "-m", message, SIGNAL_RECIPIENT],
        { timeout: SIGNAL_TIMEOUT_MS },
        (error) => {
          clearTimeout(timeout);
          if (error) {
            console.log(`[TOOLKIT] Notifier: Signal send failed — ${error.message}`);
            resolve({
              channel: "SIGNAL",
              sent: false,
              error: error.message,
              timestamp: new Date().toISOString(),
            });
          } else {
            console.log(`[TOOLKIT] Notifier: Signal message sent to ${SIGNAL_RECIPIENT}`);
            resolve({
              channel: "SIGNAL",
              sent: true,
              error: null,
              timestamp: new Date().toISOString(),
            });
          }
        },
      );
    });
  }

  // --- Email (nodemailer) ---

  private async sendEmail(subject: string, text: string, html: string): Promise<NotificationResult> {
    if (!this.emailTransport || !EMAIL_TO) {
      return {
        channel: "EMAIL",
        sent: false,
        error: "Email not configured (SMTP or EMAIL_TO empty)",
        timestamp: new Date().toISOString(),
      };
    }

    try {
      await this.emailTransport.sendMail({
        from: EMAIL_FROM,
        to: EMAIL_TO,
        subject,
        text,
        html,
      });
      console.log(`[TOOLKIT] Notifier: Email sent to ${EMAIL_TO}`);
      return {
        channel: "EMAIL",
        sent: true,
        error: null,
        timestamp: new Date().toISOString(),
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`[TOOLKIT] Notifier: Email failed — ${msg}`);
      return {
        channel: "EMAIL",
        sent: false,
        error: msg,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // --- GOD Dashboard (stub for future development) ---

  private async sendGod<T>(payload: T): Promise<NotificationResult> {
    if (!GOD_URL) {
      console.log("[TOOLKIT] Notifier: GOD Dashboard not configured — stub ready for future integration");
      return {
        channel: "GOD",
        sent: false,
        error: "GOD_STUB_NOT_CONFIGURED",
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const response = await fetch(`${GOD_URL}/api/preflight`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      const sent = response.ok;
      if (sent) {
        console.log(`[TOOLKIT] Notifier: GOD Dashboard notified at ${GOD_URL}`);
      }
      return {
        channel: "GOD",
        sent,
        error: sent ? null : `HTTP ${response.status}`,
        timestamp: new Date().toISOString(),
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`[TOOLKIT] Notifier: GOD Dashboard failed — ${msg}`);
      return {
        channel: "GOD",
        sent: false,
        error: msg,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // --- Format pre-flight as plain text (Signal) ---

  formatPreflightText(result: PreflightResult): string {
    const icon = result.verdict === "GREEN" ? "GO" : result.verdict === "AMBER" ? "CONDITIONAL GO" : "NO-GO";
    const lines: string[] = [
      `GENESIS PRE-FLIGHT REPORT`,
      `========================`,
      `Verdict: ${result.verdict} (${icon})`,
      `MCR: ${result.mcr}%`,
      `Services: ${result.servicesUp}/${result.servicesTotal} UP`,
      `Traces: ${result.tracesPass}/${result.tracesPass + result.tracesFail} PASS`,
      `Duration: ${result.durationMs}ms${result.retried ? " (retried)" : ""}`,
      ``,
    ];

    for (const phase of result.phases) {
      lines.push(`Phase ${phase.phase}: ${phase.passed ? "PASS" : "FAIL"} (${phase.durationMs}ms)`);

      if (phase.phase === "HEARTBEAT" && !phase.passed) {
        const heartbeats = phase.details as PreflightHeartbeat[];
        const down = heartbeats.filter((h) => h.status !== "UP");
        for (const h of down.slice(0, 10)) {
          lines.push(`  DOWN: ${h.name} (${h.tier})`);
        }
        if (down.length > 10) lines.push(`  ... and ${down.length - 10} more`);
      }

      if (phase.phase === "SYNTHETIC_TRACE") {
        const traces = phase.details as PreflightTrace[];
        for (const t of traces) {
          if (!t.passed) lines.push(`  FAIL: ${t.name} trace`);
        }
      }

      if (phase.phase === "CAPITAL_GOVERNANCE") {
        const checks = phase.details as PreflightCapitalCheck[];
        for (const c of checks) {
          if (c.status !== "PASS") lines.push(`  FAIL: ${c.name} — ${c.detail}`);
        }
      }
    }

    lines.push(``, `Time: ${result.completedAt}`);
    return lines.join("\n");
  }

  // --- Format pre-flight as HTML (Email) ---

  formatPreflightHtml(result: PreflightResult): string {
    const color = result.verdict === "GREEN" ? "#22c55e" : result.verdict === "AMBER" ? "#f59e0b" : "#ef4444";
    const icon = result.verdict === "GREEN" ? "GO" : result.verdict === "AMBER" ? "CONDITIONAL GO" : "NO-GO";

    let html = `
      <div style="font-family:monospace;max-width:600px;margin:0 auto;">
        <h1 style="color:${color};text-align:center;">GENESIS PRE-FLIGHT: ${result.verdict}</h1>
        <p style="text-align:center;font-size:18px;color:${color};">${icon}</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;">
          <tr><td style="padding:8px;border:1px solid #ccc;font-weight:bold;">MCR</td><td style="padding:8px;border:1px solid #ccc;">${result.mcr}%</td></tr>
          <tr><td style="padding:8px;border:1px solid #ccc;font-weight:bold;">Services</td><td style="padding:8px;border:1px solid #ccc;">${result.servicesUp}/${result.servicesTotal} UP</td></tr>
          <tr><td style="padding:8px;border:1px solid #ccc;font-weight:bold;">Traces</td><td style="padding:8px;border:1px solid #ccc;">${result.tracesPass}/${result.tracesPass + result.tracesFail} PASS</td></tr>
          <tr><td style="padding:8px;border:1px solid #ccc;font-weight:bold;">Duration</td><td style="padding:8px;border:1px solid #ccc;">${result.durationMs}ms${result.retried ? " (retried)" : ""}</td></tr>
        </table>`;

    for (const phase of result.phases) {
      const phaseColor = phase.passed ? "#22c55e" : "#ef4444";
      html += `<h3 style="color:${phaseColor};">${phase.phase}: ${phase.passed ? "PASS" : "FAIL"} (${phase.durationMs}ms)</h3>`;

      if (phase.phase === "HEARTBEAT") {
        const heartbeats = phase.details as PreflightHeartbeat[];
        const down = heartbeats.filter((h) => h.status !== "UP");
        if (down.length > 0) {
          html += `<table style="width:100%;border-collapse:collapse;"><tr><th style="padding:4px;border:1px solid #ccc;text-align:left;">Service</th><th style="padding:4px;border:1px solid #ccc;">Tier</th><th style="padding:4px;border:1px solid #ccc;">Status</th></tr>`;
          for (const h of down.slice(0, 20)) {
            html += `<tr><td style="padding:4px;border:1px solid #ccc;">${h.name}</td><td style="padding:4px;border:1px solid #ccc;">${h.tier}</td><td style="padding:4px;border:1px solid #ccc;color:red;">${h.status}</td></tr>`;
          }
          html += `</table>`;
        } else {
          html += `<p style="color:green;">All ${heartbeats.length} services responding.</p>`;
        }
      }

      if (phase.phase === "SYNTHETIC_TRACE") {
        const traces = phase.details as PreflightTrace[];
        html += `<table style="width:100%;border-collapse:collapse;"><tr><th style="padding:4px;border:1px solid #ccc;text-align:left;">Trace</th><th style="padding:4px;border:1px solid #ccc;">Status</th><th style="padding:4px;border:1px solid #ccc;">Duration</th></tr>`;
        for (const t of traces) {
          const tColor = t.passed ? "green" : "red";
          html += `<tr><td style="padding:4px;border:1px solid #ccc;">${t.name}</td><td style="padding:4px;border:1px solid #ccc;color:${tColor};">${t.passed ? "PASS" : "FAIL"}</td><td style="padding:4px;border:1px solid #ccc;">${t.durationMs}ms</td></tr>`;
        }
        html += `</table>`;
      }

      if (phase.phase === "CAPITAL_GOVERNANCE") {
        const checks = phase.details as PreflightCapitalCheck[];
        html += `<table style="width:100%;border-collapse:collapse;"><tr><th style="padding:4px;border:1px solid #ccc;text-align:left;">Check</th><th style="padding:4px;border:1px solid #ccc;">Status</th><th style="padding:4px;border:1px solid #ccc;">Detail</th></tr>`;
        for (const c of checks) {
          const cColor = c.status === "PASS" ? "green" : "red";
          html += `<tr><td style="padding:4px;border:1px solid #ccc;">${c.name}</td><td style="padding:4px;border:1px solid #ccc;color:${cColor};">${c.status}</td><td style="padding:4px;border:1px solid #ccc;">${c.detail}</td></tr>`;
        }
        html += `</table>`;
      }
    }

    html += `<p style="text-align:center;color:#888;margin-top:20px;">${result.completedAt} | GENESIS-TOOLKIT Pre-Flight Engine</p></div>`;
    return html;
  }

  // --- Channel status ---

  getChannelStatus(): Record<NotificationChannel, boolean> {
    return {
      SIGNAL: Boolean(SIGNAL_SENDER && SIGNAL_RECIPIENT),
      EMAIL: Boolean(this.emailTransport && EMAIL_TO),
      GOD: Boolean(GOD_URL),
    };
  }
}
