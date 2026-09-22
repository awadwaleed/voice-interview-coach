import type {
  InterviewSpeaker,
  InterviewTurn,
  InterviewTurnStatus,
} from "@/src/types/interview";

const SPEAKERS: InterviewSpeaker[] = ["interviewer", "candidate"];
const TURN_STATUSES: InterviewTurnStatus[] = [
  "pending",
  "complete",
  "failed",
  "interrupted",
  "unavailable",
];

const MAX_TURNS = 200;
const MAX_TURN_LENGTH = 4000;

export class InvalidTranscriptError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validateTurn(value: unknown, index: number): InterviewTurn {
  if (!isRecord(value)) {
    throw new InvalidTranscriptError(`transcript[${index}] must be an object.`);
  }

  const { id, speaker, transcript, timestamp, status } = value;

  if (typeof id !== "string" || id.trim().length === 0) {
    throw new InvalidTranscriptError(`transcript[${index}].id must be a non-empty string.`);
  }

  if (typeof speaker !== "string" || !SPEAKERS.includes(speaker as InterviewSpeaker)) {
    throw new InvalidTranscriptError(
      `transcript[${index}].speaker must be one of: ${SPEAKERS.join(", ")}.`,
    );
  }

  if (typeof transcript !== "string") {
    throw new InvalidTranscriptError(`transcript[${index}].transcript must be a string.`);
  }
  if (transcript.length > MAX_TURN_LENGTH) {
    throw new InvalidTranscriptError(
      `transcript[${index}].transcript must be ${MAX_TURN_LENGTH} characters or fewer.`,
    );
  }

  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    throw new InvalidTranscriptError(`transcript[${index}].timestamp must be a number.`);
  }

  if (typeof status !== "string" || !TURN_STATUSES.includes(status as InterviewTurnStatus)) {
    throw new InvalidTranscriptError(
      `transcript[${index}].status must be one of: ${TURN_STATUSES.join(", ")}.`,
    );
  }

  return {
    id,
    speaker: speaker as InterviewSpeaker,
    transcript,
    timestamp,
    status: status as InterviewTurnStatus,
  };
}

export function validateTranscript(body: unknown): InterviewTurn[] {
  if (!Array.isArray(body)) {
    throw new InvalidTranscriptError("transcript must be an array.");
  }
  if (body.length === 0) {
    throw new InvalidTranscriptError("transcript must not be empty.");
  }
  if (body.length > MAX_TURNS) {
    throw new InvalidTranscriptError(`transcript must have ${MAX_TURNS} turns or fewer.`);
  }

  return body.map(validateTurn);
}

/** Turns with real spoken/generated content worth evaluating. */
export function hasEvaluableContent(transcript: InterviewTurn[]): boolean {
  return transcript.some(
    (turn) =>
      turn.speaker === "candidate" &&
      (turn.status === "complete" || turn.status === "interrupted") &&
      turn.transcript.trim().length > 0,
  );
}
