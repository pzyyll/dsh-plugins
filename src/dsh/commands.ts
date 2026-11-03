// ABOUTME: Register the Session-local /select-ide command on the optional dsh command service.
// ABOUTME: Use the native user-question composer and abort its picker with the command scope.

import type { Context } from "@deepseek-ai/cordis";
import type { CommandResult } from "@deepseek-ai/dsh-commands";
import type { IdeConnections } from "./ide-connections.js";
import type { AvailableIde } from "../shared/ide.js";

const QUESTION_ID = "select-ide";
const COMMAND_NAME = "select-ide";

/** Register the native picker command when dsh's optional command service is present. */
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
      description: "Choose which local IDE supplies selection context for this session",
      input: { hint: "[list|auto|off]" },
      handler: async ({ agent, rawInput, signal: invocationSignal }): Promise<CommandResult> => {
        const args = rawInput.trim();
        if (args === "list")
          return listIde(
            connections,
            agent.session.header.cwd,
            combinedSignal(signal, lifetime.signal, invocationSignal),
          );
        if (args === "auto" || args === "off") {
          if (combinedSignal(signal, lifetime.signal, invocationSignal).aborted)
            return error("IDE selection command was cancelled.");
          connections.setMode(agent.id, args);
          return {
            kind: "success",
            text:
              args === "auto"
                ? "Automatic IDE selection enabled."
                : "IDE integration disabled for this session.",
          };
        }
        if (args !== "") return error("Usage: /select-ide [list|auto|off].");
        const userQuestions = scope.get("userQuestions");
        if (!userQuestions)
          return error(
            "The IDE picker is unavailable because no user-question provider is installed.",
          );
        const cwd = agent.session.header.cwd;
        if (!cwd)
          return error("This session has no workspace directory; IDE selection is unavailable.");
        const pickerSignal = combinedSignal(signal, lifetime.signal, invocationSignal);
        if (pickerSignal.aborted) return error("IDE selection was cancelled.");

        let ides: AvailableIde[];
        try {
          ides = await connections.list(cwd, pickerSignal);
        } catch (cause) {
          return error(`Could not list available IDEs: ${errorMessage(cause)}`);
        }
        if (pickerSignal.aborted) return error("IDE selection was cancelled.");
        if (ides.length === 0)
          return error(
            "No local IDE connections are available. Open a supported IDE, then try /select-ide again.",
          );

        const options = makeOptions(ides);
        let answer;
        try {
          answer = await askWithSignal(pickerSignal, () =>
            userQuestions.ask({
              agent,
              signal: pickerSignal,
              questions: [
                {
                  id: QUESTION_ID,
                  question: "Choose an IDE for this session",
                  header: "IDE selection",
                  multiSelect: false,
                  options: [
                    ...options.map(({ label, ide }) => ({
                      label,
                      description: `Workspace: ${ide.workspaceFolders.join(", ") || "unknown"}; ${ide.host}:${ide.port}`,
                    })),
                    { label: "Automatic workspace selection" },
                    { label: "Disable IDE integration" },
                  ],
                },
              ],
            }),
          );
        } catch (cause) {
          if (pickerSignal.aborted) return error("IDE selection was cancelled.");
          return error(
            `Could not open the IDE picker: ${errorMessage(cause)}. Ensure a user-question provider is available.`,
          );
        }
        if (pickerSignal.aborted) return error("IDE selection was cancelled.");
        const response = answer.answers.find((item) => item.id === QUESTION_ID);
        if (!response)
          return error(
            "The IDE picker returned an invalid answer; your existing choice was preserved.",
          );
        if (response.custom !== undefined)
          return error("Custom IDE choices are not accepted; choose one of the listed options.");
        if (response.selected.length === 0)
          return { kind: "success", text: "IDE selection was not changed." };
        if (response.selected.length !== 1)
          return error("Choose exactly one IDE option; your existing choice was preserved.");
        const label = response.selected[0];
        if (label === "Automatic workspace selection") {
          connections.setMode(agent.id, "auto");
          return { kind: "success", text: "Automatic IDE selection enabled." };
        }
        if (label === "Disable IDE integration") {
          connections.setMode(agent.id, "off");
          return { kind: "success", text: "IDE integration disabled for this session." };
        }
        const selection = options.find((option) => option.label === label);
        if (!selection)
          return error(
            "The IDE picker returned an unknown option; your existing choice was preserved.",
          );

        try {
          const selected = await connections.select(agent.id, selection.ide.id, cwd, pickerSignal);
          if (!selected || pickerSignal.aborted)
            return error(
              "That IDE is no longer available. Your existing IDE choice was preserved; run /select-ide to choose again.",
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
      },
    });
    scope.effect(() => dispose);
  });
}

function makeOptions(ides: AvailableIde[]): Array<{ label: string; ide: AvailableIde }> {
  return ides.map((ide, index) => {
    const workspaces = ide.workspaceFolders.length
      ? ide.workspaceFolders.join(", ")
      : "unknown workspace";
    return {
      label: `${index + 1}. ${ide.name} — ${workspaces} — ${ide.host}:${ide.port}`,
      ide,
    };
  });
}

async function listIde(
  connections: IdeConnections,
  cwd: string | undefined,
  signal: AbortSignal,
): Promise<CommandResult> {
  if (!cwd) return error("This session has no workspace directory; IDE listing is unavailable.");
  try {
    const ides = await connections.list(cwd, signal);
    if (signal.aborted) return error("IDE listing was cancelled.");
    if (ides.length === 0)
      return { kind: "success", text: "No local IDE connections are available." };
    return {
      kind: "success",
      text: ides
        .map((ide, index) => {
          const workspaces = ide.workspaceFolders.join(", ") || "unknown workspace";
          return `${index + 1}. ${ide.name} — ${workspaces} — ${ide.host}:${ide.port}`;
        })
        .join("\n"),
    };
  } catch (cause) {
    return error(`Could not list available IDEs: ${errorMessage(cause)}`);
  }
}

function combinedSignal(...signals: AbortSignal[]): AbortSignal {
  return AbortSignal.any(signals);
}

async function askWithSignal<T>(signal: AbortSignal, ask: () => Promise<T>): Promise<T> {
  if (signal.aborted) throw new Error("IDE picker cancelled");
  let onAbort: (() => void) | undefined;
  const cancelled = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new Error("IDE picker cancelled"));
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  try {
    return await Promise.race([Promise.resolve().then(ask), cancelled]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

function error(text: string): CommandResult {
  return { kind: "error", text };
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
