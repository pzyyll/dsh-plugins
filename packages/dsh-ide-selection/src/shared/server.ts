// ABOUTME: Hosts the authenticated loopback WebSocket endpoint for VS Code selections.
// ABOUTME: Adapted from pi-x-ide shared server; authenticates during HTTP upgrade, not verifyClient.

import { createServer, type IncomingMessage, type Server } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { isAbsolute, relative, sep } from "node:path";
import WebSocket, { WebSocketServer } from "ws";
import { parseDiagnosticContext } from "./diagnostics.js";
import {
  AUTH_HEADER,
  PROTOCOL_VERSION,
  type DiagnosticContext,
  type EditorSelectionSnapshot,
  type InitializeResult,
} from "./protocol.js";

const MAX_PAYLOAD_BYTES = 1024 * 1024;
const SERVER_NAME = "DSH IDE Selection";

function loopbackAddress(address: string | undefined): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function tokenMatches(candidate: string | undefined, expected: string): boolean {
  if (!candidate) return false;
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRequest(
  value: unknown,
): value is { jsonrpc: "2.0"; id: string | number; method: string; params?: unknown } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  if (!isRecord(value)) return false;
  const request = value;
  return (
    request.jsonrpc === "2.0" &&
    (typeof request.id === "string" ||
      (typeof request.id === "number" && Number.isFinite(request.id))) &&
    typeof request.method === "string"
  );
}

export interface IdeConnectionStatus {
  clientCount: number;
}

export class IdeServer {
  private http: Server | undefined;
  private websocket: WebSocketServer | undefined;
  private readonly clients = new Set<WebSocket>();
  private readonly connectionListeners = new Set<(status: IdeConnectionStatus) => void>();
  private started = false;

  constructor(
    private readonly authToken: string,
    private readonly getSelection: () => EditorSelectionSnapshot | undefined,
  ) {}

  async start(): Promise<number> {
    if (this.started) return this.port;
    this.http = createServer((_request, response) => {
      response.writeHead(404).end();
    });
    this.websocket = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });
    this.http.on("upgrade", (request, socket, head) => this.handleUpgrade(request, socket, head));
    this.websocket.on("connection", (socket) => {
      this.clients.add(socket);
      this.publishConnections();
      const forget = () => this.forgetClient(socket);
      socket.once("close", forget);
      socket.once("error", forget);
      socket.on("message", (raw) => {
        try {
          this.handleMessage(socket, raw.toString());
        } catch (error) {
          this.reportError("WebSocket message handler failed", error);
          socket.close(1011, "Message handler failed");
        }
      });
    });
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => reject(error);
      this.http!.once("error", onError);
      this.http!.listen(0, "127.0.0.1", () => {
        this.http!.off("error", onError);
        resolve();
      });
    });
    this.started = true;
    return this.port;
  }

  get port(): number {
    const address = this.http?.address();
    return address && typeof address !== "string" ? address.port : 0;
  }

  get clientCount(): number {
    return [...this.clients].filter((client) => client.readyState === WebSocket.OPEN).length;
  }

  /** Observe the number of authenticated, open bridge sockets. */
  subscribeConnections(listener: (status: IdeConnectionStatus) => void): () => void {
    this.connectionListeners.add(listener);
    listener(this.connectionStatus());
    return () => {
      this.connectionListeners.delete(listener);
    };
  }

  /** Forward an explicit action once; the Host routes it to the matching session. */
  sendDiagnostics(context: DiagnosticContext): boolean {
    if (
      !parseDiagnosticContext(context) ||
      !isAbsolute(context.filePath) ||
      (context.workspaceFolder !== undefined && !isAbsolute(context.workspaceFolder))
    )
      return false;
    for (const client of this.clients) {
      if (client.readyState !== WebSocket.OPEN) continue;
      this.send(client, {
        jsonrpc: "2.0",
        method: "diagnostic_fix_requested",
        params: context,
      });
      return true;
    }
    return false;
  }

  broadcast(snapshot: EditorSelectionSnapshot | undefined): void {
    const notification = snapshot
      ? {
          jsonrpc: "2.0",
          method: "selection_changed",
          params: { ...snapshot, receivedAt: Date.now() },
        }
      : {
          jsonrpc: "2.0",
          method: "selection_cleared",
          params: { source: "vscode", reason: "no-active-editor", receivedAt: Date.now() },
        };
    this.broadcastValue(notification);
  }

  attach(snapshot: EditorSelectionSnapshot): void {
    this.broadcastValue({
      jsonrpc: "2.0",
      method: "at_mentioned",
      params: { ...snapshot, rangeText: formatRangeMention(snapshot), receivedAt: Date.now() },
    });
  }

  async stop(): Promise<void> {
    const http = this.http;
    const websocket = this.websocket;
    this.http = undefined;
    this.websocket = undefined;
    this.started = false;
    for (const client of websocket?.clients ?? this.clients) client.terminate();
    this.clients.clear();
    this.publishConnections();
    await Promise.all([
      new Promise<void>((resolve) => websocket?.close(() => resolve()) ?? resolve()),
      new Promise<void>((resolve) => http?.close(() => resolve()) ?? resolve()),
    ]);
  }

  private handleUpgrade(
    request: IncomingMessage,
    socket: import("node:stream").Duplex,
    head: Buffer,
  ): void {
    const remote = request.socket.remoteAddress;
    const requestPath = (request.url ?? "").split("?", 1)[0];
    const tokenHeader = request.headers[AUTH_HEADER];
    const token = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;
    let status = "401 Unauthorized";
    if (!loopbackAddress(remote) || requestPath !== "/") status = "403 Forbidden";
    else if (request.headers.origin !== undefined) status = "403 Forbidden";
    else if (tokenMatches(token, this.authToken) && this.websocket) {
      this.websocket.handleUpgrade(request, socket, head, (client) => {
        this.websocket?.emit("connection", client, request);
      });
      return;
    }
    socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  }

  private handleMessage(socket: WebSocket, text: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }
    if (!isRequest(parsed) || parsed.method !== "initialize") return;
    const result: InitializeResult = {
      protocolVersion: PROTOCOL_VERSION,
      server: { name: SERVER_NAME, ide: "vscode" },
    };
    this.send(socket, { jsonrpc: "2.0", id: parsed.id, result });
    let snapshot: EditorSelectionSnapshot | undefined;
    try {
      snapshot = this.getSelection();
    } catch (error) {
      this.reportError("Selection provider failed", error);
      this.forgetClient(socket);
      socket.close(1011, "Selection provider failed");
      return;
    }
    this.broadcastTo(socket, this.selectionNotification(snapshot));
  }

  private selectionNotification(snapshot: EditorSelectionSnapshot | undefined): unknown {
    return snapshot
      ? {
          jsonrpc: "2.0",
          method: "selection_changed",
          params: { ...snapshot, receivedAt: Date.now() },
        }
      : {
          jsonrpc: "2.0",
          method: "selection_cleared",
          params: { source: "vscode", reason: "no-active-editor", receivedAt: Date.now() },
        };
  }

  private broadcastValue(value: unknown): void {
    for (const client of this.clients)
      if (client.readyState === WebSocket.OPEN) this.send(client, value);
  }

  private broadcastTo(client: WebSocket, value: unknown): void {
    if (client.readyState === WebSocket.OPEN) this.send(client, value);
  }

  private send(client: WebSocket, value: unknown): void {
    try {
      client.send(JSON.stringify(value), (error) => {
        if (!error) return;
        this.reportError("WebSocket send failed", error);
        this.forgetClient(client);
        client.close(1011, "Send failed");
      });
    } catch (error) {
      this.reportError("WebSocket send failed", error);
      this.forgetClient(client);
      client.close(1011, "Send failed");
    }
  }

  private forgetClient(client: WebSocket): void {
    this.clients.delete(client);
    this.publishConnections();
  }

  private connectionStatus(): IdeConnectionStatus {
    return {
      clientCount: this.clientCount,
    };
  }

  private publishConnections(): void {
    const status = this.connectionStatus();
    for (const listener of this.connectionListeners) {
      try {
        listener(status);
      } catch (error) {
        this.reportError("Connection status listener failed", error);
      }
    }
  }

  private reportError(label: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    process.emitWarning(`DSH IDE Selection ${label}: ${message}`);
  }
}

function formatRangeMention(snapshot: EditorSelectionSnapshot): string {
  let path = snapshot.filePath;
  const base = snapshot.workspaceFolder;
  if (base) {
    const rel = relative(base, path);
    if (rel === "") path = rel;
    else if (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)) path = rel;
  }
  path = path.replaceAll("\\", "/");
  const first = snapshot.ranges[0];
  if (!first) return `@${path}`;
  const start = first.selection.start.line + 1;
  const end = first.selection.end.line + 1;
  return `@${path}#L${start}${start === end ? "" : `-L${end}`}`;
}
