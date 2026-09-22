import { describe, expect, it } from "vitest";
import {
  finalizeTranscript,
  shouldWaitBeforeEnding,
} from "@/src/lib/realtime/finalization";
import type { InterviewTurn } from "@/src/types/interview";

function turn(overrides: Partial<InterviewTurn> = {}): InterviewTurn {
  return {
    id: "candidate_1",
    speaker: "candidate",
    transcript: "I rebuilt our checkout flow.",
    timestamp: 1000,
    status: "complete",
    ...overrides,
  };
}

const NOW = 10_000;
const DRAIN_DEADLINE_FUTURE = NOW + 500; // still within the drain window
const DRAIN_DEADLINE_PAST = NOW - 1; // drain window has already elapsed

describe("shouldWaitBeforeEnding", () => {
  it("never waits once status is error, no matter what else is true", () => {
    expect(
      shouldWaitBeforeEnding({
        status: "error",
        pendingCandidateAudio: true,
        transcript: [turn({ status: "pending", transcript: "" })],
        wasConnected: true,
        now: NOW,
        drainDeadline: DRAIN_DEADLINE_FUTURE,
      }),
    ).toBe(false);
  });

  it("waits when a transcript turn is still pending, regardless of the drain window", () => {
    expect(
      shouldWaitBeforeEnding({
        status: "active",
        pendingCandidateAudio: false,
        transcript: [turn({ status: "pending", transcript: "" })],
        wasConnected: true,
        now: NOW,
        drainDeadline: DRAIN_DEADLINE_PAST, // already past — still must wait
      }),
    ).toBe(true);
  });

  it("waits when pendingCandidateAudio is true, regardless of the drain window", () => {
    expect(
      shouldWaitBeforeEnding({
        status: "active",
        pendingCandidateAudio: true,
        transcript: [],
        wasConnected: true,
        now: NOW,
        drainDeadline: DRAIN_DEADLINE_PAST,
      }),
    ).toBe(true);
  });

  it("waits through the drain window even when nothing is currently known pending, if the connection was live", () => {
    // This is the case a real regression missed: the candidate can finish
    // speaking and End can be clicked before the very first server
    // notification (input_audio_buffer.speech_started) has even arrived —
    // there's no signal to check for that; the drain window is what covers it.
    expect(
      shouldWaitBeforeEnding({
        status: "active",
        pendingCandidateAudio: false,
        transcript: [],
        wasConnected: true,
        now: NOW,
        drainDeadline: DRAIN_DEADLINE_FUTURE,
      }),
    ).toBe(true);
  });

  it("stops waiting once the drain window has elapsed with nothing having appeared", () => {
    expect(
      shouldWaitBeforeEnding({
        status: "active",
        pendingCandidateAudio: false,
        transcript: [],
        wasConnected: true,
        now: NOW,
        drainDeadline: DRAIN_DEADLINE_PAST,
      }),
    ).toBe(false);
  });

  it("never drains if the connection was never live — nothing could possibly be in flight", () => {
    expect(
      shouldWaitBeforeEnding({
        status: "idle",
        pendingCandidateAudio: false,
        transcript: [],
        wasConnected: false,
        now: NOW,
        drainDeadline: DRAIN_DEADLINE_FUTURE, // even though "still in window"
      }),
    ).toBe(false);
  });
});

describe("finalizeTranscript", () => {
  it("marks a still-pending turn unavailable", () => {
    const result = finalizeTranscript([turn({ status: "pending", transcript: "" })], {
      pendingCandidateAudio: false,
    });
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("unavailable");
  });

  it("leaves completed turns untouched", () => {
    const result = finalizeTranscript([turn()], { pendingCandidateAudio: false });
    expect(result).toEqual([turn()]);
  });

  it("appends a synthetic unavailable placeholder when pendingCandidateAudio never resolved into a real item", () => {
    const result = finalizeTranscript([], { pendingCandidateAudio: true });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      speaker: "candidate",
      transcript: "",
      status: "unavailable",
    });
  });

  it("does not append a placeholder when pendingCandidateAudio is false", () => {
    const result = finalizeTranscript([turn()], { pendingCandidateAudio: false });
    expect(result).toHaveLength(1);
  });

  it("both marks pending turns unavailable AND appends a placeholder when both apply", () => {
    const result = finalizeTranscript([turn({ status: "pending", transcript: "" })], {
      pendingCandidateAudio: true,
    });
    expect(result).toHaveLength(2);
    expect(result.every((t) => t.status === "unavailable")).toBe(true);
  });
});
