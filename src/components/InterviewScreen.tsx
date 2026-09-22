"use client";

import { useRef } from "react";
import { useMicrophoneStream } from "@/src/hooks/useMicrophoneStream";
import { useRealtimeInterview } from "@/src/hooks/useRealtimeInterview";
import type { InterviewConfig, InterviewTurn } from "@/src/types/interview";

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

const PRIMARY_BUTTON_CLASS =
  "w-full rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const SECONDARY_BUTTON_CLASS =
  "w-full rounded-full border border-black/10 px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10";

const SPEAKER_LABELS: Record<InterviewTurn["speaker"], string> = {
  interviewer: "Interviewer",
  candidate: "You",
};

function TranscriptTurn({ turn }: { turn: InterviewTurn }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-semibold text-foreground/60">
        {SPEAKER_LABELS[turn.speaker]}
        {turn.status === "interrupted" && " · cut short"}
      </span>
      {turn.status === "pending" && (
        <span className="text-sm italic text-foreground/40">…</span>
      )}
      {turn.status === "failed" && (
        <span className="text-sm italic text-foreground/40">
          Transcription failed
        </span>
      )}
      {turn.status === "unavailable" && (
        <span className="text-sm italic text-foreground/40">
          Transcript unavailable — connection lost
        </span>
      )}
      {(turn.status === "complete" || turn.status === "interrupted") && (
        <span className="text-sm text-foreground">{turn.transcript}</span>
      )}
    </div>
  );
}

export default function InterviewScreen({
  config,
  onEnd,
}: InterviewScreenProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const mic = useMicrophoneStream();
  const realtime = useRealtimeInterview(config, mic.stream, audioRef);

  const isCallLive =
    realtime.status === "connecting" || realtime.status === "active";

  const handleEnd = () => {
    realtime.disconnect();
    mic.stop();
    onEnd();
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-black/10 bg-white p-8 shadow-sm dark:border-white/15 dark:bg-black">
      <audio ref={audioRef} autoPlay hidden />

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
                mic.status === "active"
                  ? "bg-green-500"
                  : mic.status === "requesting"
                    ? "bg-yellow-500"
                    : mic.status === "denied" || mic.status === "error"
                      ? "bg-red-500"
                      : "bg-black/20 dark:bg-white/20"
              }`}
            />
            {mic.status === "idle" && "Microphone off"}
            {mic.status === "requesting" && "Requesting microphone access…"}
            {mic.status === "active" && "Microphone active"}
            {mic.status === "denied" && "Microphone permission denied"}
            {mic.status === "error" && "Microphone error"}
          </div>

          {mic.status === "denied" && (
            <p className="text-sm text-foreground/60">
              Microphone access is required to run the interview. Allow
              microphone access for this site in your browser settings, then
              try again.
            </p>
          )}

          {mic.status === "error" && mic.error && (
            <p className="text-sm text-foreground/60">{mic.error}</p>
          )}

          {mic.status === "active" && (
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  realtime.status === "active"
                    ? "bg-green-500"
                    : realtime.status === "connecting"
                      ? "bg-yellow-500"
                      : realtime.status === "error"
                        ? "bg-red-500"
                        : "bg-black/20 dark:bg-white/20"
                }`}
              />
              {realtime.status === "idle" && "Not connected"}
              {realtime.status === "connecting" && "Connecting…"}
              {realtime.status === "active" && "Connected — say hello"}
              {realtime.status === "error" && "Connection failed"}
            </div>
          )}

          {realtime.status === "error" && realtime.error && (
            <p className="text-sm text-foreground/60">{realtime.error}</p>
          )}

          {realtime.audioBlocked && (
            <p className="text-sm text-foreground/60">
              Your browser blocked the interviewer&apos;s audio from playing
              automatically.
            </p>
          )}
        </div>

        {realtime.transcript.length > 0 && (
          <div className="flex max-h-64 flex-col gap-3 overflow-y-auto rounded-lg border border-black/10 p-3 dark:border-white/15">
            {realtime.transcript.map((turn) => (
              <TranscriptTurn key={turn.id} turn={turn} />
            ))}
          </div>
        )}

        {mic.status === "idle" && (
          <button type="button" onClick={mic.start} className={PRIMARY_BUTTON_CLASS}>
            Enable Microphone
          </button>
        )}

        {(mic.status === "denied" || mic.status === "error") && (
          <button type="button" onClick={mic.start} className={PRIMARY_BUTTON_CLASS}>
            Retry
          </button>
        )}

        {mic.status === "active" && realtime.status === "idle" && (
          <button
            type="button"
            onClick={realtime.connect}
            className={PRIMARY_BUTTON_CLASS}
          >
            Connect
          </button>
        )}

        {realtime.status === "error" && (
          <button
            type="button"
            onClick={realtime.connect}
            className={PRIMARY_BUTTON_CLASS}
          >
            Retry Connection
          </button>
        )}

        {realtime.audioBlocked && (
          <button
            type="button"
            onClick={realtime.resumeAudio}
            className={PRIMARY_BUTTON_CLASS}
          >
            Play Interviewer Audio
          </button>
        )}

        {mic.status === "active" && !isCallLive && (
          <button
            type="button"
            onClick={mic.stop}
            className={SECONDARY_BUTTON_CLASS}
          >
            Stop Microphone
          </button>
        )}

        <button type="button" onClick={handleEnd} className={SECONDARY_BUTTON_CLASS}>
          End Interview
        </button>
      </div>
    </div>
  );
}
