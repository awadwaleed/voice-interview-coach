"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  InterviewConfig,
  InterviewFeedback,
  InterviewTurn,
} from "@/src/types/interview";

const FEEDBACK_ENDPOINT = "/api/feedback";

export type FeedbackRequestStatus = "idle" | "loading" | "success" | "error";

interface UseInterviewFeedbackResult {
  status: FeedbackRequestStatus;
  feedback: InterviewFeedback | null;
  error: string | null;
  analyze: (config: InterviewConfig, transcript: InterviewTurn[]) => void;
}

/**
 * A single request-response fetch, so this doesn't need the elaborate
 * multi-resource teardown of the realtime call — just cancellation on
 * unmount/re-invocation via the same request-token pattern used elsewhere,
 * so a stale response can never clobber a newer request's state.
 */
export function useInterviewFeedback(): UseInterviewFeedbackResult {
  const [status, setStatus] = useState<FeedbackRequestStatus>("idle");
  const [feedback, setFeedback] = useState<InterviewFeedback | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
      abortControllerRef.current?.abort();
    };
  }, []);

  const analyze = useCallback(
    (config: InterviewConfig, transcript: InterviewTurn[]) => {
      abortControllerRef.current?.abort();
      const myRequest = ++requestIdRef.current;
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setStatus("loading");
      setError(null);

      (async () => {
        try {
          const res = await fetch(FEEDBACK_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ config, transcript }),
            signal: controller.signal,
          });
          if (requestIdRef.current !== myRequest) return;

          const body = await res.json().catch(() => null);
          if (requestIdRef.current !== myRequest) return;

          if (!res.ok) {
            throw new Error(
              (body && typeof body.error === "string" && body.error) ||
                `Failed to analyze the interview (${res.status}).`,
            );
          }

          setFeedback(body.feedback as InterviewFeedback);
          setStatus("success");
        } catch (err) {
          if (requestIdRef.current !== myRequest) return;
          if (controller.signal.aborted) return; // expected cancellation
          setStatus("error");
          setError(
            err instanceof Error
              ? err.message
              : "Failed to analyze the interview.",
          );
        }
      })();
    },
    [],
  );

  return { status, feedback, error, analyze };
}
