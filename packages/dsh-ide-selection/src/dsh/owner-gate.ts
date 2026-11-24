// ABOUTME: Gate an admitted WebServer route on the local owner Peer.
// ABOUTME: Connection admits any live Peer; an IDE selection belongs to the owner alone.

/** The Peer facts a WebServer route handler receives once admission allowed the request. */
export interface RoutePeer {
  readonly principal: { readonly kind: string };
}

/** Whether an admitted Peer may read this plugin's IDE state. */
export function isOwnerPeer(peer: RoutePeer | undefined): boolean {
  return peer?.principal.kind === "owner";
}
