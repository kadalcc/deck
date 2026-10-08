import { createContext, useContext } from "react";

import { useStore } from "../core/store.ts";
import type { RoomClient, Status } from "./client.ts";
import type { Role, RoomState } from "./protocol.ts";

export interface LiveValue {
  client: RoomClient;
  /** The audience page URL for the QR code. */
  joinUrl: string;
}

export const LiveContext = createContext<LiveValue | null>(null);

export function useLiveOptional(): LiveValue | null {
  return useContext(LiveContext);
}

export function useLive(): LiveValue {
  const v = useContext(LiveContext);
  if (!v) throw new Error("This needs <LiveProvider> inside <Deck>");
  return v;
}

export function useRoom<S = RoomState>(selector?: (s: RoomState) => S): S {
  const live = useLive();
  return useStore(live.client.state, selector);
}

export function useRoomStatus(): Status {
  const live = useLiveOptional();
  return useStore(live?.client.status ?? emptyStatus);
}

export function useRole(): Role {
  const live = useLiveOptional();
  return useStore(live?.client.role ?? viewerRole);
}

import { createStore } from "../core/store.ts";
const emptyStatus = createStore<Status>("idle");
const viewerRole = createStore<Role>("viewer");
