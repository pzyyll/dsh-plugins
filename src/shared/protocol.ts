// ABOUTME: Defines DSH IDE selection protocol v1 and lock-file contracts.
// ABOUTME: Adapted from pi-x-ide's shared protocol types for the VS Code-only bridge.

export const PROTOCOL_VERSION = 1;
export const AUTH_HEADER = "x-pi-x-ide-authorization";
export const LOCK_FILE_EXTENSION = ".lock";

export interface Position {
  line: number;
  character: number;
}

export interface SelectionRange {
  text: string;
  selection: {
    start: Position;
    end: Position;
  };
}

export interface EditorSelectionSnapshot {
  source: "vscode";
  filePath: string;
  workspaceFolder?: string;
  ranges: SelectionRange[];
  receivedAt?: number;
}

export interface IdeLockFile {
  version: 1;
  ide: "vscode";
  name: string;
  transport: "ws";
  host: "127.0.0.1";
  port: number;
  authToken: string;
  workspaceFolders: string[];
  pid?: number;
  runningInWindows?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InitializeParams {
  protocolVersion: number;
  client?: { name?: string; version?: string };
  cwd?: string;
}

export interface InitializeResult {
  protocolVersion: number;
  server: { name: string; version?: string; ide: "vscode" };
}
