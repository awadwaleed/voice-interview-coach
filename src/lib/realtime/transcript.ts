import type {
  InterviewSpeaker,
  InterviewTurn,
  InterviewTurnStatus,
} from "@/src/types/interview";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function roleToSpeaker(role: unknown): InterviewSpeaker | null {
  if (role === "user") return "candidate";
  if (role === "assistant") return "interviewer";
  return null;
}

/**
 * Inserts a new turn using previous_item_id (as the Realtime API documents
 * it should be used for ordering) rather than trusting arrival order — two
 * items can complete their transcription out of order relative to when
 * they were created.
 */
function insertOrdered(
  transcript: InterviewTurn[],
  newTurn: InterviewTurn,
  previousItemId: unknown,
): InterviewTurn[] {
  if (transcript.some((turn) => turn.id === newTurn.id)) return transcript; // duplicate .added event

  if (typeof previousItemId !== "string") {
    // No predecessor named -> this item has no known place after another,
    // so it belongs at the start of the conversation.
    return [newTurn, ...transcript];
  }

  const index = transcript.findIndex((turn) => turn.id === previousItemId);
  if (index === -1) {
    // Predecessor not seen yet (shouldn't normally happen since the server
    // announces items in order) — appending is the safest fallback.
    return [...transcript, newTurn];
  }

  return [
    ...transcript.slice(0, index + 1),
    newTurn,
    ...transcript.slice(index + 1),
  ];
}

function withTurn(
  transcript: InterviewTurn[],
  itemId: string,
  patch: Partial<InterviewTurn>,
): InterviewTurn[] {
  let changed = false;
  const next = transcript.map((turn) => {
    if (turn.id !== itemId) return turn;
    changed = true;
    return { ...turn, ...patch };
  });
  // Preserve reference equality when nothing matched, so callers can cheaply
  // skip a state update for an event referencing an unknown/stale item id.
  return changed ? next : transcript;
}

/**
 * Pure reducer translating raw OpenAI Realtime data-channel events into an
 * ordered InterviewTurn[]. Kept framework/transport-agnostic so the
 * ordering/dedup/failure/interruption logic is independently testable.
 */
export function applyRealtimeEventToTranscript(
  transcript: InterviewTurn[],
  event: unknown,
): InterviewTurn[] {
  if (!isRecord(event)) return transcript;

  switch (event.type) {
    case "conversation.item.added": {
      const item = event.item;
      if (!isRecord(item)) return transcript;

      const id = item.id;
      const speaker = roleToSpeaker(item.role);
      if (typeof id !== "string" || !speaker) return transcript;

      const newTurn: InterviewTurn = {
        id,
        speaker,
        transcript: "",
        timestamp: Date.now(),
        status: "pending",
      };
      return insertOrdered(transcript, newTurn, event.previous_item_id);
    }

    case "conversation.item.input_audio_transcription.completed":
    case "response.output_audio_transcript.done": {
      const itemId = event.item_id;
      const text = event.transcript;
      if (typeof itemId !== "string" || typeof text !== "string") {
        return transcript;
      }
      return withTurn(transcript, itemId, { transcript: text, status: "complete" });
    }

    case "conversation.item.input_audio_transcription.failed": {
      const itemId = event.item_id;
      if (typeof itemId !== "string") return transcript;
      return withTurn(transcript, itemId, { status: "failed" });
    }

    case "response.done": {
      const response = event.response;
      if (!isRecord(response)) return transcript;

      const status = response.status;
      if (status !== "cancelled" && status !== "incomplete" && status !== "failed") {
        return transcript;
      }
      const newStatus: InterviewTurnStatus =
        status === "failed" ? "failed" : "interrupted";

      const output = response.output;
      if (!Array.isArray(output)) return transcript;
      const affectedIds = output
        .filter(isRecord)
        .map((item) => item.id)
        .filter((id): id is string => typeof id === "string");

      return affectedIds.reduce(
        (acc, id) => withTurn(acc, id, { status: newStatus }),
        transcript,
      );
    }

    default:
      return transcript;
  }
}
