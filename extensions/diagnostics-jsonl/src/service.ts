import type { DiagnosticEventPayload, OpenClawPluginService } from "openclaw/plugin-sdk";
import { onDiagnosticEvent } from "openclaw/plugin-sdk";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_FILENAME = "diagnostics-events.jsonl";

type EventLogConfig = {
  enabled?: boolean;
  filePath?: string;
};

type EventLogWriter = {
  filePath: string;
  write: (line: string) => void;
};

const writers = new Map<string, EventLogWriter>();

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "y", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "n", "off"].includes(normalized)) {
      return false;
    }
  }
  return undefined;
}

function resolveUserPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.startsWith("~")) {
    const expanded = trimmed.replace(/^~(?=$|[\\/])/, os.homedir());
    return path.resolve(expanded);
  }
  return path.resolve(trimmed);
}

function resolveEventLogConfig(params: {
  cfg?: EventLogConfig;
  stateDir: string;
  env?: NodeJS.ProcessEnv;
}): { enabled: boolean; filePath: string } {
  const env = params.env ?? process.env;
  const envEnabled = parseBoolean(env.OPENCLAW_DIAGNOSTICS_EVENTLOG);
  const enabled = envEnabled ?? params.cfg?.enabled ?? false;
  const fileOverride = params.cfg?.filePath?.trim() || env.OPENCLAW_DIAGNOSTICS_EVENTLOG_FILE?.trim();
  const filePath = fileOverride
    ? resolveUserPath(fileOverride)
    : path.join(params.stateDir, "logs", DEFAULT_FILENAME);
  return { enabled, filePath };
}

function getWriter(filePath: string): EventLogWriter {
  const existing = writers.get(filePath);
  if (existing) {
    return existing;
  }

  const dir = path.dirname(filePath);
  const ready = fs.mkdir(dir, { recursive: true }).catch(() => undefined);
  let queue = Promise.resolve();

  const writer: EventLogWriter = {
    filePath,
    write: (line: string) => {
      queue = queue
        .then(() => ready)
        .then(() => fs.appendFile(filePath, line, "utf8"))
        .catch(() => undefined);
    },
  };

  writers.set(filePath, writer);
  return writer;
}

function safeJsonStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value, (_key, val) => {
      if (typeof val === "bigint") {
        return val.toString();
      }
      if (typeof val === "function") {
        return "[Function]";
      }
      if (val instanceof Error) {
        return { name: val.name, message: val.message, stack: val.stack };
      }
      if (val instanceof Uint8Array) {
        return { type: "Uint8Array", data: Buffer.from(val).toString("base64") };
      }
      return val;
    });
  } catch {
    return null;
  }
}

export function createDiagnosticsJsonlService(): OpenClawPluginService {
  let stop: (() => void) | null = null;

  return {
    id: "diagnostics-jsonl",
    async start(ctx) {
      const cfg = resolveEventLogConfig({
        cfg: ctx.config.diagnostics?.eventLog,
        stateDir: ctx.stateDir,
      });
      if (!ctx.config.diagnostics?.enabled || !cfg.enabled) {
        return;
      }

      const writer = getWriter(cfg.filePath);
      ctx.logger.info(`diagnostics-jsonl: writing events to ${writer.filePath}`);

      stop = onDiagnosticEvent((evt: DiagnosticEventPayload) => {
        const line = safeJsonStringify(evt);
        if (!line) {
          return;
        }
        writer.write(`${line}\n`);
      });
    },
    async stop() {
      if (stop) {
        stop();
        stop = null;
      }
    },
  };
}
