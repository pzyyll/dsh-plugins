// ABOUTME: Admit the local owner Peer for route tests without a live Host transport.
// ABOUTME: WebServer asks admission listeners before a required route reaches its handler.
import { Context, type Plugin } from "@deepseek-ai/cordis";
import { Peer } from "@deepseek-ai/dsh-client-connection";
import type { WebAdmission } from "@deepseek-ai/dsh-host-webserver";

/**
 * Provide the connection service these routes wait for. The routes read no
 * member of it: admission and the owner Peer arrive through WebServer.
 */
export const connectionStub: Plugin = {
  name: "test-connection-stub",
  apply(scope: Context) {
    scope.provide("connection", {});
  },
};

/** Answer WebServer admission with the owner Peer while `allow` reads true, and 401 otherwise. */
export function admitOwner(ctx: Context, allow: () => boolean): Peer {
  const peer = new Peer(ctx, { principal: { kind: "owner" } });
  ctx.on("webserver/authorize", (): WebAdmission =>
    allow() ? { kind: "allow", peer } : { kind: "deny", status: 401 },
  );
  return peer;
}
