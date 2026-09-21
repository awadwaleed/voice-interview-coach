"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  createRealtimeInterviewClient,
  type RealtimeInterviewClient,
  type RealtimeInterviewState,
} from "@/src/lib/realtime/createRealtimeInterviewClient";
import type { InterviewConfig } from "@/src/types/interview";

const IDLE_STATE: RealtimeInterviewState = {
  status: "idle",
  error: null,
  audioBlocked: false,
};

/** A no-op stand-in used when there's no microphone stream to connect with. */
function createIdleRealtimeClient(): RealtimeInterviewClient {
  return {
    getState: () => IDLE_STATE,
    subscribe: (listener) => {
      listener();
      return () => {};
    },
    connect: () => {},
    disconnect: () => {},
    resumeAudio: () => {},
  };
}

interface UseRealtimeInterviewResult extends RealtimeInterviewState {
  connect: () => void;
  disconnect: () => void;
  resumeAudio: () => void;
}

/**
 * Thin React binding over createRealtimeInterviewClient. The client (and the
 * real WebRTC resources it may go on to own) is created inside an effect —
 * never during render — so Strict Mode's mount/cleanup/mount replay always
 * tears down a fully-formed client before the next one is created, and a
 * microphone stream swap (stop + re-enable) always disposes the old client
 * before a fresh one is built for the new stream.
 *
 * State is only ever set from inside a client.subscribe() callback (which
 * fires immediately on subscribe, and again on every future change) — never
 * synchronously in the effect body itself.
 */
export function useRealtimeInterview(
  config: InterviewConfig,
  micStream: MediaStream | null,
  audioElementRef: RefObject<HTMLAudioElement | null>,
): UseRealtimeInterviewResult {
  const [state, setState] = useState<RealtimeInterviewState>(IDLE_STATE);
  const clientRef = useRef<RealtimeInterviewClient | null>(null);

  useEffect(() => {
    const client = micStream
      ? createRealtimeInterviewClient({
          config,
          micStream,
          getAudioElement: () => audioElementRef.current,
        })
      : createIdleRealtimeClient();
    clientRef.current = client;

    const unsubscribe = client.subscribe(() => setState(client.getState()));

    return () => {
      // Unsubscribe before disconnecting so the teardown below can never
      // trigger a state update after this effect instance is gone.
      unsubscribe();
      client.disconnect();
      if (clientRef.current === client) {
        clientRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, micStream]);

  const connect = useCallback(() => {
    clientRef.current?.connect();
  }, []);

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
  }, []);

  const resumeAudio = useCallback(() => {
    clientRef.current?.resumeAudio();
  }, []);

  return { ...state, connect, disconnect, resumeAudio };
}
