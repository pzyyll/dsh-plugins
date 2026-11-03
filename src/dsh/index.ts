// ABOUTME: Add fresh VS Code context to accepted human turns through dsh's durable message path.
// ABOUTME: Use the published dsh 0.2.1-rc.5 hook and cancel pending IDE reads on plugin unload.
import type { Context } from "@deepseek-ai/cordis";
import type { PreStepDecision } from "@deepseek-ai/dsh-agent";
import { createUserMessage, type ContextFormed } from "@deepseek-ai/dsh-llm";
import z from "@deepseek-ai/schemastery";
import { isAbsolute } from "node:path";
import { readSelection } from "../shared/client.js";
import { formatEditorContext } from "../shared/format.js";
import { defaultLockDir } from "../shared/lock.js";

declare module "@deepseek-ai/dsh-llm" {
  interface MessageSourceMap {
    "ide-selection-context": { kind: "ide-selection-context" } & ContextFormed;
  }
}

const FIRST_STEP = 1;
const DEFAULT_TIMEOUT_MS = 1_000;
const DEFAULT_MAX_AGE_MS = 180_000;
const DEFAULT_MAX_CHARS = 24_000;
const MAX_TIMER_DELAY_MS = 2_147_483_647;

export const name = "ide-selection-context";
export const inject = ["agents"];

export interface Config {
  lockDir?: string;
  timeoutMs?: number;
  maxAgeMs?: number;
  maxChars?: number;
}

export const Config: z<Config> = z.object({
  lockDir: z.string(),
  timeoutMs: z.number(),
  maxAgeMs: z.number(),
  maxChars: z.number(),
});

function positiveInteger(label: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name}: ${label} must be a positive safe integer`);
  }
}

/** Register optional IDE context for root human turns; the loop records admitted messages. */
export function apply(ctx: Context, config: Config = {}): void {
  const lockDir = config.lockDir ?? defaultLockDir();
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAgeMs = config.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const maxChars = config.maxChars ?? DEFAULT_MAX_CHARS;
  if (!isAbsolute(lockDir) || lockDir.includes("\0")) {
    throw new TypeError(`${name}: lockDir must be an absolute path`);
  }
  positiveInteger("timeoutMs", timeoutMs);
  if (timeoutMs > MAX_TIMER_DELAY_MS) {
    throw new RangeError(`${name}: timeoutMs exceeds the supported timer delay`);
  }
  if (!Number.isSafeInteger(maxAgeMs) || maxAgeMs < 0) {
    throw new RangeError(`${name}: maxAgeMs must be a non-negative safe integer`);
  }
  positiveInteger("maxChars", maxChars);

  const lifetime = new AbortController();
  ctx.effect(() => () => lifetime.abort());
  ctx.on(
    "agent/pre-step",
    async ({ agent, step, signal }, next): Promise<PreStepDecision> => {
      const decision = await next();
      if (
        decision.kind === "reject" ||
        signal.aborted ||
        lifetime.signal.aborted ||
        step !== FIRST_STEP ||
        agent.session.header.origin === "subagent" ||
        !decision.messages.some((message) => message.source.kind === "user")
      )
        return decision;
      const cwd = agent.session.header.cwd;
      if (!cwd) return decision;
      const readSignal = AbortSignal.any([signal, lifetime.signal]);
      try {
        const snapshot = await readSelection({
          cwd,
          lockDir,
          timeoutMs,
          maxAgeMs,
          signal: readSignal,
        });
        if (!snapshot || readSignal.aborted) return decision;
        const text = formatEditorContext(snapshot, { maxChars });
        return {
          ...decision,
          messages: [
            ...decision.messages,
            createUserMessage({
              content: [{ type: "text", text }],
              source: { kind: name, form: "snapshot", sections: [{ name, text }] },
            }),
          ],
        };
      } catch (error) {
        if (!readSignal.aborted) {
          const message = error instanceof Error ? error.message : String(error);
          ctx.logger.warn(`${name}: cannot read IDE context: ${message}`);
        }
        return decision;
      }
    },
    { prepend: true },
  );
}
