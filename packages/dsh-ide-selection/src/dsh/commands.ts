// ABOUTME: Register the Session-local /select-ide command on the optional dsh command service.
// ABOUTME: Keep the picker in the Web client; this handler lists or applies a machine-chosen target.

import type { Context } from "@deepseek-ai/cordis";
import type { CommandResult } from "@deepseek-ai/dsh-commands";
import type { IdeConnections } from "./ide-connections.js";
import type { AvailableIde } from "../shared/ide.js";

const COMMAND_NAME = "select-ide";

/**
 * Register the IDE command when dsh's optional command service is present.
 *
 * The command deliberately declares no input hint: the Web client decorates the
 * bare invocation with its popup picker, exactly like `/model`. A bare host
 * invocation (a non-Web surface or a programmatic call) answers with the
 * reachable IDE list, and programmatic callers may still pass `auto`, `off`,
 * or one IDE id.
 */
export function registerSelectIdeCommand(
  ctx: Context,
  connections: IdeConnections,
  signal: AbortSignal,
): void {
  ctx.inject(["commands"], (scope) => {
    const lifetime = new AbortController();
    scope.effect(() => () => lifetime.abort());
    const dispose = scope.commands.register({
      name: COMMAND_NAME,
      // English catalog fallback. The Web menu replaces it with command.description.
      description: "Choose which local IDE supplies selection context for this session",
      handler: async ({ agent, rawInput, signal: invocationSignal }): Promise<CommandResult> => {
        const cwd = agent.session.header.cwd;
        if (!cwd)
          return error("This session has no workspace directory; IDE selection is unavailable.");
        const requestSignal = AbortSignal.any([signal, lifetime.signal, invocationSignal]);
        const args = rawInput.trim();
        if (args === "auto" || args === "off") {
          connections.setMode(agent.id, args);
          return {
            kind: "success",
            text:
              args === "auto"
                ? "Automatic IDE selection enabled."
                : "IDE integration disabled for this session.",
          };
        }
        if (args !== "") {
          try {
            const selected = await connections.select(agent.id, args, cwd, requestSignal);
            if (!selected || requestSignal.aborted)
              return error(
                "That IDE is no longer reachable or does not match this workspace. Your existing IDE choice was preserved; run /select-ide to choose again.",
              );
            return {
              kind: "success",
              text: `IDE selected: ${selected.name} (${selected.host}:${selected.port}).`,
            };
          } catch (cause) {
            return error(
              `Could not select that IDE: ${errorMessage(cause)}. Your existing IDE choice was preserved.`,
            );
          }
        }
        return listIde(connections, cwd, requestSignal);
      },
    });
    scope.effect(() => dispose);
  });
}

async function listIde(
  connections: IdeConnections,
  cwd: string,
  signal: AbortSignal,
): Promise<CommandResult> {
  try {
    const ides = await connections.list(cwd, signal);
    if (signal.aborted) return error("IDE listing was cancelled.");
    if (ides.length === 0)
      return { kind: "success", text: "No local IDE connections are available." };
    return {
      kind: "success",
      text: ides.map(describeIde).join("\n"),
    };
  } catch (cause) {
    return error(`Could not list available IDEs: ${errorMessage(cause)}`);
  }
}

function describeIde(ide: AvailableIde, index: number): string {
  const workspaces = ide.workspaceFolders.join(", ") || "unknown workspace";
  const availability = ide.workspaceMatched ? "" : " — unavailable: outside this workspace";
  return `${index + 1}. ${ide.name} — ${workspaces} — ${ide.host}:${ide.port}${availability}`;
}

function error(text: string): CommandResult {
  return { kind: "error", text };
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
