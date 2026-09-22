import { describe, expect, it } from "vitest";
import {
  applyRealtimeEventToTranscript,
  markPendingTurnsUnavailable,
} from "@/src/lib/realtime/transcript";
import type { InterviewTurn } from "@/src/types/interview";

function added(id: string, role: "user" | "assistant", previousItemId?: string | null) {
  return {
    type: "conversation.item.added",
    item: { id, role, type: "message" },
    previous_item_id: previousItemId,
  };
}

function transcriptionCompleted(itemId: string, text: string) {
  return {
    type: "conversation.item.input_audio_transcription.completed",
    item_id: itemId,
    transcript: text,
  };
}

function outputTranscriptDone(itemId: string, text: string) {
  return {
    type: "response.output_audio_transcript.done",
    item_id: itemId,
    transcript: text,
  };
}

function transcriptionFailed(itemId: string) {
  return {
    type: "conversation.item.input_audio_transcription.failed",
    item_id: itemId,
    error: { message: "boom" },
  };
}

function responseDone(status: string, outputIds: string[]) {
  return {
    type: "response.done",
    response: {
      status,
      output: outputIds.map((id) => ({ id })),
    },
  };
}

describe("applyRealtimeEventToTranscript", () => {
  it("inserts a new pending turn on conversation.item.added", () => {
    const result = applyRealtimeEventToTranscript([], added("item_1", "user"));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "item_1",
      speaker: "candidate",
      transcript: "",
      status: "pending",
    });
  });

  it("maps assistant role to interviewer speaker", () => {
    const result = applyRealtimeEventToTranscript([], added("item_1", "assistant"));
    expect(result[0].speaker).toBe("interviewer");
  });

  it("orders a new item using previous_item_id rather than trusting arrival order", () => {
    let transcript: InterviewTurn[] = [];
    transcript = applyRealtimeEventToTranscript(transcript, added("a", "user"));
    transcript = applyRealtimeEventToTranscript(transcript, added("b", "assistant", "a"));
    // "c" is inserted between "a" and "b", even though it arrives last.
    transcript = applyRealtimeEventToTranscript(transcript, added("c", "user", "a"));

    expect(transcript.map((t) => t.id)).toEqual(["a", "c", "b"]);
  });

  it("places an item with no previous_item_id at the start", () => {
    let transcript: InterviewTurn[] = [];
    transcript = applyRealtimeEventToTranscript(transcript, added("a", "user"));
    transcript = applyRealtimeEventToTranscript(transcript, added("b", "assistant", null));

    expect(transcript.map((t) => t.id)).toEqual(["b", "a"]);
  });

  it("appends an item whose stated predecessor hasn't been seen yet, as a fallback", () => {
    const transcript = applyRealtimeEventToTranscript(
      [],
      added("b", "assistant", "a-not-seen"),
    );
    expect(transcript.map((t) => t.id)).toEqual(["b"]);
  });

  it("ignores a duplicate conversation.item.added for an id already present", () => {
    let transcript: InterviewTurn[] = [];
    transcript = applyRealtimeEventToTranscript(transcript, added("a", "user"));
    const afterFirst = transcript;
    transcript = applyRealtimeEventToTranscript(transcript, added("a", "user"));

    expect(transcript).toBe(afterFirst); // reference-stable no-op
    expect(transcript).toHaveLength(1);
  });

  it("patches text and marks complete on conversation.item.input_audio_transcription.completed", () => {
    let transcript = applyRealtimeEventToTranscript([], added("a", "user"));
    transcript = applyRealtimeEventToTranscript(
      transcript,
      transcriptionCompleted("a", "Tell me about yourself."),
    );

    expect(transcript[0]).toMatchObject({
      transcript: "Tell me about yourself.",
      status: "complete",
    });
  });

  it("patches text and marks complete on response.output_audio_transcript.done", () => {
    let transcript = applyRealtimeEventToTranscript([], added("a", "assistant"));
    transcript = applyRealtimeEventToTranscript(
      transcript,
      outputTranscriptDone("a", "Welcome to the interview."),
    );

    expect(transcript[0]).toMatchObject({
      transcript: "Welcome to the interview.",
      status: "complete",
    });
  });

  it("marks a turn failed on conversation.item.input_audio_transcription.failed", () => {
    let transcript = applyRealtimeEventToTranscript([], added("a", "user"));
    transcript = applyRealtimeEventToTranscript(transcript, transcriptionFailed("a"));

    expect(transcript[0].status).toBe("failed");
    expect(transcript[0].transcript).toBe(""); // untouched, no fabricated text
  });

  it("marks the affected output item interrupted when a response is cancelled", () => {
    let transcript = applyRealtimeEventToTranscript([], added("a", "assistant"));
    transcript = applyRealtimeEventToTranscript(
      transcript,
      outputTranscriptDone("a", "Partial answer before being cut o"),
    );
    transcript = applyRealtimeEventToTranscript(transcript, responseDone("cancelled", ["a"]));

    expect(transcript[0]).toMatchObject({
      status: "interrupted",
      transcript: "Partial answer before being cut o",
    });
  });

  it("marks the affected output item interrupted when a response is incomplete", () => {
    let transcript = applyRealtimeEventToTranscript([], added("a", "assistant"));
    transcript = applyRealtimeEventToTranscript(transcript, responseDone("incomplete", ["a"]));
    expect(transcript[0].status).toBe("interrupted");
  });

  it("marks the affected output item failed when a response fails", () => {
    let transcript = applyRealtimeEventToTranscript([], added("a", "assistant"));
    transcript = applyRealtimeEventToTranscript(transcript, responseDone("failed", ["a"]));
    expect(transcript[0].status).toBe("failed");
  });

  it("leaves the transcript untouched when a response completes normally", () => {
    let transcript = applyRealtimeEventToTranscript([], added("a", "assistant"));
    const afterAdd = transcript;
    transcript = applyRealtimeEventToTranscript(transcript, responseDone("completed", ["a"]));
    expect(transcript).toBe(afterAdd); // reference-stable no-op
    expect(transcript[0].status).toBe("pending");
  });

  it("ignores events referencing an unknown item id, preserving reference equality", () => {
    const transcript = applyRealtimeEventToTranscript([], added("a", "user"));
    const afterAdd = transcript;
    const result = applyRealtimeEventToTranscript(
      transcript,
      transcriptionCompleted("does-not-exist", "text"),
    );
    expect(result).toBe(afterAdd);
  });

  it("ignores unrelated/unknown event types", () => {
    const transcript = applyRealtimeEventToTranscript([], added("a", "user"));
    const result = applyRealtimeEventToTranscript(transcript, { type: "session.created" });
    expect(result).toBe(transcript);
  });

  it("ignores malformed events without throwing", () => {
    expect(() => applyRealtimeEventToTranscript([], null)).not.toThrow();
    expect(() => applyRealtimeEventToTranscript([], "not an object")).not.toThrow();
    expect(() => applyRealtimeEventToTranscript([], { type: "conversation.item.added" })).not.toThrow();
    expect(
      applyRealtimeEventToTranscript([], { type: "conversation.item.added", item: { role: "user" } }),
    ).toEqual([]); // no id -> ignored
  });

  it("ignores an item with an unrecognized role", () => {
    const result = applyRealtimeEventToTranscript([], added("a", "system" as "user"));
    expect(result).toEqual([]);
  });

  describe("playback interruption (conversation.item.truncated)", () => {
    it("marks an item interrupted even though its text generation already completed", () => {
      let transcript = applyRealtimeEventToTranscript([], added("a", "assistant"));
      transcript = applyRealtimeEventToTranscript(
        transcript,
        outputTranscriptDone("a", "This is the full generated response text."),
      );
      expect(transcript[0].status).toBe("complete");

      // Generation finished, but the candidate interrupted playback before
      // hearing all of it.
      transcript = applyRealtimeEventToTranscript(transcript, {
        type: "conversation.item.truncated",
        item_id: "a",
      });

      expect(transcript[0]).toMatchObject({
        status: "interrupted",
        // Full generated text is kept (never estimate a word-level cutoff
        // from a millisecond offset) — the "cut short" flag communicates
        // that not all of it was heard.
        transcript: "This is the full generated response text.",
      });
    });

    it("does not let a later transcript-completion event downgrade an interrupted turn back to complete", () => {
      let transcript = applyRealtimeEventToTranscript([], added("a", "assistant"));
      transcript = applyRealtimeEventToTranscript(transcript, {
        type: "conversation.item.truncated",
        item_id: "a",
      });
      expect(transcript[0].status).toBe("interrupted");

      // A stray/duplicate completion event arriving after truncation must
      // not resurrect "complete".
      transcript = applyRealtimeEventToTranscript(
        transcript,
        outputTranscriptDone("a", "some text"),
      );
      expect(transcript[0].status).toBe("interrupted");
    });

    it("ignores a truncated event referencing an unknown item id", () => {
      const transcript = applyRealtimeEventToTranscript([], added("a", "assistant"));
      const result = applyRealtimeEventToTranscript(transcript, {
        type: "conversation.item.truncated",
        item_id: "does-not-exist",
      });
      expect(result).toBe(transcript);
    });
  });

  describe("markPendingTurnsUnavailable", () => {
    it("marks only pending turns unavailable, leaving completed/failed/interrupted turns untouched", () => {
      let transcript: InterviewTurn[] = [];
      transcript = applyRealtimeEventToTranscript(transcript, added("pending_1", "user"));
      transcript = applyRealtimeEventToTranscript(transcript, added("done_1", "assistant"));
      transcript = applyRealtimeEventToTranscript(
        transcript,
        outputTranscriptDone("done_1", "Welcome to the interview."),
      );

      const result = markPendingTurnsUnavailable(transcript);

      expect(result.find((t) => t.id === "pending_1")).toMatchObject({
        status: "unavailable",
      });
      expect(result.find((t) => t.id === "done_1")).toMatchObject({
        status: "complete",
        transcript: "Welcome to the interview.",
      });
    });

    it("is a reference-stable no-op when there are no pending turns", () => {
      let transcript = applyRealtimeEventToTranscript([], added("a", "assistant"));
      transcript = applyRealtimeEventToTranscript(
        transcript,
        outputTranscriptDone("a", "text"),
      );
      const result = markPendingTurnsUnavailable(transcript);
      expect(result).toBe(transcript);
    });
  });
});
