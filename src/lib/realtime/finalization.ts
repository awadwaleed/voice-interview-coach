import { markPendingTurnsUnavailable } from "@/src/lib/realtime/transcript";
import type { InterviewStatus, InterviewTurn } from "@/src/types/interview";

/**
 * Whether ending the interview should keep waiting rather than finalize
 * right now. Pure/timer-agnostic so the decision itself — the thing that's
 * repeatedly been the source of transcript-loss bugs — has permanent,
 * fast, deterministic test coverage instead of relying solely on
 * timing-sensitive live-browser checks.
 *
 * There are two distinct reasons to wait:
 * 1. Something is *known* pending (a transcript turn still "pending", or
 *    pendingCandidateAudio) — always wait, regardless of the drain window.
 * 2. Nothing is currently known pending, but the connection was live when
 *    the user ended and we're still within the short drain window — there's
 *    no client-visible signal for "the server told us about this moments
 *    ago and we haven't processed it yet" (network latency on the very
 *    first notification, e.g. input_audio_buffer.speech_started, is itself
 *    unobservable), so a live connection always gets this brief grace
 *    period before we trust "nothing pending" as proof nothing is
 *    outstanding.
 */
export function shouldWaitBeforeEnding({
  status,
  pendingCandidateAudio,
  transcript,
  wasConnected,
  now,
  drainDeadline,
}: {
  status: InterviewStatus;
  pendingCandidateAudio: boolean;
  transcript: InterviewTurn[];
  wasConnected: boolean;
  now: number;
  drainDeadline: number;
}): boolean {
  if (status === "error") return false;

  const knownPending =
    pendingCandidateAudio || transcript.some((turn) => turn.status === "pending");
  if (knownPending) return true;

  return wasConnected && now < drainDeadline;
}

/**
 * Produces the transcript actually handed off when ending the interview.
 * Any turn still "pending" at this point can never receive its completion
 * event once we disconnect, so it's marked unavailable. If the candidate's
 * audio was detected (pendingCandidateAudio) but never resulted in a real
 * conversation item before we gave up waiting, there's no real id/text to
 * preserve — but a synthetic "unavailable" placeholder still surfaces it
 * through the same disclosure path as any other missing answer, rather
 * than it vanishing with no trace at all.
 */
export function finalizeTranscript(
  transcript: InterviewTurn[],
  { pendingCandidateAudio }: { pendingCandidateAudio: boolean },
): InterviewTurn[] {
  const resolved = markPendingTurnsUnavailable(transcript);
  if (!pendingCandidateAudio) return resolved;

  return [
    ...resolved,
    {
      id: `unrecorded-${Date.now()}`,
      speaker: "candidate",
      transcript: "",
      timestamp: Date.now(),
      status: "unavailable",
    },
  ];
}
