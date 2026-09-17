"use client";

import { useEffect, useMemo, useState } from "react";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Database, Presentation, Response, RoomEvent } from "@/lib/supabase/types";
import { roomChannelName } from "@/lib/realtime/room-channel";

type RoomRealtimeState = {
  activeCount: number;
  lastEvent: RoomEvent | null;
  responses: Response[];
  participants: { nickname: string; joinedAt: string }[];
};

export function useRoomRealtime(roomCode: string, nickname?: string, options?: { isPresenter?: boolean }) {
  const isPresenter = options?.isPresenter ?? false;
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<RoomRealtimeState>({
    activeCount: 0,
    lastEvent: null,
    responses: [],
    participants: []
  });
  const [presentation, setPresentation] = useState<Presentation | null>(null);

  useEffect(() => {
    if (!roomCode) return;

    let channel: RealtimeChannel = supabase
      .channel(roomChannelName(roomCode), {
        config: {
          presence: { key: nickname || crypto.randomUUID() }
        }
      });

    const handlePresence = () => {
      const presenceState = channel.presenceState();
      const rawParticipants = Object.values(presenceState).flatMap((p: any) => p);
      
      if (isPresenter) {
        const participantsList = rawParticipants
          .filter((p: any) => p.nickname && p.nickname !== "Presenter")
          .map((p: any) => ({ nickname: p.nickname, joinedAt: p.joinedAt }));
        
        const uniqueParticipants = Array.from(
          new Map(participantsList.map((p) => [p.nickname, p])).values()
        );

        setState((current) => ({
          ...current,
          activeCount: uniqueParticipants.length,
          participants: uniqueParticipants
        }));
      } else {
        const seen = new Set();
        rawParticipants.forEach((p: any) => {
          if (p.nickname && p.nickname !== "Presenter") {
            seen.add(p.nickname);
          }
        });
        setState((current) => ({
          ...current,
          activeCount: seen.size
        }));
      }
    };

    channel = channel
      .on("presence", { event: "sync" }, handlePresence)
      .on("presence", { event: "join" }, handlePresence)
      .on("presence", { event: "leave" }, handlePresence)
      .on("broadcast", { event: "slide-change" }, ({ payload }) => {
        setState((current) => ({ ...current, lastEvent: payload as RoomEvent }));
      })
      .on("broadcast", { event: "leaderboard-show" }, ({ payload }) => {
        setState((current) => ({ ...current, lastEvent: payload as RoomEvent }));
      })
      .on("broadcast", { event: "quiz-ended" }, ({ payload }) => {
        setState((current) => ({ ...current, lastEvent: payload as RoomEvent }));
      })
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "presentations",
          filter: `room_code=eq.${roomCode}`
        },
        (payload: RealtimePostgresChangesPayload<Database["public"]["Tables"]["presentations"]["Row"]>) => {
          setPresentation(payload.new as Presentation);
        }
      );

    if (isPresenter) {
      channel = channel.on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "responses",
          filter: `room_code=eq.${roomCode}`
        },
        (payload: RealtimePostgresChangesPayload<Database["public"]["Tables"]["responses"]["Row"]>) => {
          const newResponse = payload.new as Response;
          setState((current) => ({
            ...current,
            responses: [...current.responses.filter((r) => r.id !== newResponse.id), newResponse]
          }));
        }
      );
    }

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({
          nickname: nickname || "Presenter",
          joinedAt: new Date().toISOString()
        });
      }
    });

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [nickname, roomCode, supabase, isPresenter]);

  return { ...state, presentation };
}
