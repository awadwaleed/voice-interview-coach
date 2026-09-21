"use client";

import { useMicrophoneStream } from "@/src/hooks/useMicrophoneStream";
import type { InterviewConfig } from "@/src/types/interview";

interface InterviewScreenProps {
  config: InterviewConfig;
  onEnd: () => void;
}

const TYPE_LABELS: Record<InterviewConfig["type"], string> = {
  behavioral: "Behavioral",
  technical: "Technical",
  mixed: "Mixed",
};

const DIFFICULTY_LABELS: Record<InterviewConfig["difficulty"], string> = {
  entry: "Entry Level",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export default function InterviewScreen({
  config,
  onEnd,
}: InterviewScreenProps) {
  const { status, error, start, stop } = useMicrophoneStream();

  const handleEnd = () => {
    stop();
    onEnd();
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-black/10 bg-white p-8 shadow-sm dark:border-white/15 dark:bg-black">
      <h1 className="text-xl font-semibold text-foreground">
        Interview in progress
      </h1>
      <p className="mt-1 text-sm text-foreground/60">
        {config.role} · {TYPE_LABELS[config.type]} ·{" "}
        {DIFFICULTY_LABELS[config.difficulty]}
      </p>

      <div className="mt-6 flex flex-col gap-4">
        <div role="status" className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                status === "active"
                  ? "bg-green-500"
                  : status === "requesting"
                    ? "bg-yellow-500"
                    : status === "denied" || status === "error"
                      ? "bg-red-500"
                      : "bg-black/20 dark:bg-white/20"
              }`}
            />
            {status === "idle" && "Microphone off"}
            {status === "requesting" && "Requesting microphone access…"}
            {status === "active" && "Microphone active"}
            {status === "denied" && "Microphone permission denied"}
            {status === "error" && "Microphone error"}
          </div>

          {status === "denied" && (
            <p className="text-sm text-foreground/60">
              Microphone access is required to run the interview. Allow
              microphone access for this site in your browser settings, then
              try again.
            </p>
          )}

          {status === "error" && error && (
            <p className="text-sm text-foreground/60">{error}</p>
          )}
        </div>

        {status === "idle" && (
          <button
            type="button"
            onClick={start}
            className="w-full rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors"
          >
            Enable Microphone
          </button>
        )}

        {(status === "denied" || status === "error") && (
          <button
            type="button"
            onClick={start}
            className="w-full rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors"
          >
            Retry
          </button>
        )}

        {status === "active" && (
          <button
            type="button"
            onClick={stop}
            className="w-full rounded-full border border-black/10 px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
          >
            Stop Microphone
          </button>
        )}

        <button
          type="button"
          onClick={handleEnd}
          className="w-full rounded-full border border-black/10 px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
        >
          End Interview
        </button>
      </div>
    </div>
  );
}
