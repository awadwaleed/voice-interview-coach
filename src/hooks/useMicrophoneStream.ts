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
  start: () => Promise<void>;
  stop: () => void;
}

export function useMicrophoneStream(): UseMicrophoneStreamResult {
  const [status, setStatus] = useState<MicrophoneStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStatus("idle");
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  const start = useCallback(async () => {
    if (streamRef.current || status === "requesting") return;

    setStatus("requesting");
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      streamRef.current = stream;
      setStatus("active");
    } catch (err) {
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
  }, [status]);

  return { status, error, start, stop };
}
