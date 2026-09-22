"use client";

import { useEffect, useRef, useState } from "react";
import {
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "@/src/components/buttonStyles";
import { useMicrophoneStream } from "@/src/hooks/useMicrophoneStream";
import { useRealtimeInterview } from "@/src/hooks/useRealtimeInterview";
import { markPendingTurnsUnavailable } from "@/src/lib/realtime/transcript";
import type { InterviewConfig, InterviewTurn } from "@/src/types/interview";

interface InterviewScreenProps {
  config: InterviewConfig;
  onEnd: (transcript: InterviewTurn[]) => void;
}

/**
 * If the candidate finishes speaking and immediately clicks End Interview,
 * that answer's conversation item already exists server-side (audio was
 * already committed) but its transcription may not have arrived yet. Ending
 * immediately would snapshot it as "pending" forever and silently drop it.
 * This is how long we keep the connection alive (mic/playback already
 * stopped) waiting for any already-in-flight transcription to complete.
 */
const FINALIZE_TIMEOUT_MS = 4000;

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

  const [isEnding, setIsEnding] = useState(false);
  const endDeadlineRef = useRef<number | null>(null);
  const finalizedRef = useRef(false);

  const handleEndClick = () => {
    if (isEnding) return;
    // Stop hearing the interviewer, and halt microphone capture, right
    // away. stopCapture() (unlike stop()) releases the hardware/OS mic
    // indicator immediately without changing mic.stream's identity or
    // resetting the hook's status — useRealtimeInterview's client lifecycle
    // is keyed on that identity, so calling the full stop() here would tear
    // down the realtime connection too, defeating the wait below before it
    // can receive anything. Full stop() (and disconnect()) happen together
    // in finalize() once the wait is over.
    mic.stopCapture();
    audioRef.current?.pause();
    setIsEnding(true);
  };

  useEffect(() => {
    if (!isEnding || finalizedRef.current) return;

    if (endDeadlineRef.current === null) {
      endDeadlineRef.current = Date.now() + FINALIZE_TIMEOUT_MS;
    }

    const finalize = () => {
      if (finalizedRef.current) return;
      finalizedRef.current = true;
      let transcript = markPendingTurnsUnavailable(realtime.transcript);
      if (realtime.pendingCandidateAudio) {
        // The candidate's audio was detected but the timeout elapsed
        // before the server ever created a conversation item for it —
        // there's no real id/text to preserve, but a synthetic
        // "unavailable" placeholder still surfaces it through the same
        // disclosure path as any other missing answer, rather than it
        // vanishing with no trace at all.
        transcript = [
          ...transcript,
          {
            id: `unrecorded-${Date.now()}`,
            speaker: "candidate",
            transcript: "",
            timestamp: Date.now(),
            status: "unavailable",
          },
        ];
      }
      realtime.disconnect();
      mic.stop();
      onEnd(transcript);
    };

    // realtime.transcript only has a placeholder for audio that has
    // already been committed into a conversation item. There's a gap
    // between the candidate finishing speaking and the server actually
    // creating that item (VAD waits out a silence threshold first) —
    // pendingCandidateAudio covers that earlier window, so ending
    // mid-utterance or just after doesn't silently drop it either.
    const stillWaiting =
      realtime.status !== "error" &&
      (realtime.pendingCandidateAudio ||
        realtime.transcript.some((turn) => turn.status === "pending"));
    if (!stillWaiting) {
      finalize();
      return;
    }

    const remaining = Math.max(0, endDeadlineRef.current - Date.now());
    const timeoutId = setTimeout(finalize, remaining);
    return () => clearTimeout(timeoutId);
    // realtime/onEnd/audioRef are effectively stable for this screen's
    // lifetime; re-running on every transcript/status change (not on their
    // identity) is exactly what's needed to detect early resolution.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isEnding,
    realtime.status,
    realtime.transcript,
    realtime.pendingCandidateAudio,
  ]);

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

        <button
          type="button"
          onClick={handleEndClick}
          disabled={isEnding}
          className={SECONDARY_BUTTON_CLASS}
        >
          {isEnding ? "Finishing up…" : "End Interview"}
        </button>
      </div>
    </div>
  );
}
