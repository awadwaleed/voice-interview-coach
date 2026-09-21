"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type MicrophoneStatus =
  | "idle"
  | "requesting"
  | "active"
  | "denied"
  | "error";

interface UseMicrophoneStreamResult {
  status: MicrophoneStatus;
  error: string | null;
  stream: MediaStream | null;
  start: () => Promise<void>;
  stop: () => void;
}

function stopAllTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function useMicrophoneStream(): UseMicrophoneStreamResult {
  const [status, setStatus] = useState<MicrophoneStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Bumped on every stop()/unmount so an in-flight getUserMedia() request
  // can recognize it's been superseded and discard its result instead of
  // resurrecting a stream nothing will ever stop again.
  const requestIdRef = useRef(0);
  const pendingRef = useRef(false);

  const stop = useCallback(() => {
    requestIdRef.current += 1;
    pendingRef.current = false;
    stopAllTracks(streamRef.current);
    streamRef.current = null;
    setStream(null);
    setStatus("idle");
  }, []);

  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
      pendingRef.current = false;
      stopAllTracks(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  const start = useCallback(async () => {
    // Refs (not `status` state) guard against overlapping calls: state
    // updates aren't visible until the next render, so two start() calls
    // issued before a re-render would otherwise both pass this check.
    if (pendingRef.current || streamRef.current) return;
    pendingRef.current = true;

    const requestId = ++requestIdRef.current;
    setStatus("requesting");
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      if (requestId !== requestIdRef.current) {
        // Superseded by stop()/unmount while the request was in flight.
        stopAllTracks(stream);
        return;
      }

      streamRef.current = stream;
      pendingRef.current = false;
      setStream(stream);
      setStatus("active");
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      pendingRef.current = false;

      const name = err instanceof DOMException ? err.name : undefined;
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setStatus("denied");
      } else {
        setStatus("error");
        setError(
          err instanceof Error
            ? err.message
            : "Could not access the microphone.",
        );
      }
    }
  }, []);

  return { status, error, stream, start, stop };
}
