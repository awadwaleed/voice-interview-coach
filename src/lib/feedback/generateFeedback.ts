import OpenAI from "openai";
import type {
  AnswerFeedback,
  InterviewConfig,
  InterviewDifficulty,
  InterviewFeedback,
  InterviewTurn,
  InterviewType,
} from "@/src/types/interview";

const FEEDBACK_MODEL = "gpt-5";

const TYPE_DESCRIPTIONS: Record<InterviewType, string> = {
  behavioral: "behavioral interview focused on past experiences and soft skills",
  technical: "technical interview focused on role-relevant technical skills and problem solving",
  mixed: "mixed interview combining behavioral and technical questions",
};

const DIFFICULTY_DESCRIPTIONS: Record<InterviewDifficulty, string> = {
  entry: "entry-level",
  intermediate: "intermediate-level",
  advanced: "advanced/senior-level",
};

const SPEAKER_LABELS = {
  interviewer: "Interviewer",
  candidate: "Candidate",
} as const;

/** Only turns with real spoken/generated content are evaluable — pending/failed/unavailable turns have no text. */
function isEvaluableTurn(turn: InterviewTurn): boolean {
  return (
    (turn.status === "complete" || turn.status === "interrupted") &&
    turn.transcript.trim().length > 0
  );
}

/**
 * The candidate turn ids the model is shown (via formatTranscript's [id: ...]
 * tags) and therefore the only ids it can legitimately reference in
 * answerFeedback[].turnId. Model output is validated against this exact set
 * — see parseFeedbackResponse.
 */
export function getEligibleAnswerTurnIds(
  transcript: InterviewTurn[],
): Set<string> {
  return new Set(
    transcript
      .filter((turn) => turn.speaker === "candidate" && isEvaluableTurn(turn))
      .map((turn) => turn.id),
  );
}

function formatTranscript(transcript: InterviewTurn[]): string {
  return transcript
    .filter(isEvaluableTurn)
    .map((turn) => {
      const cutShort = turn.status === "interrupted" ? " [cut short]" : "";
      // Only candidate lines are tagged — these are the only ids
      // answerFeedback[].turnId is allowed to reference.
      const idTag = turn.speaker === "candidate" ? ` [id: ${turn.id}]` : "";
      return `${SPEAKER_LABELS[turn.speaker]}${idTag}${cutShort}: ${turn.transcript.trim()}`;
    })
    .join("\n");
}

export function buildFeedbackPrompt(
  config: InterviewConfig,
  transcript: InterviewTurn[],
): string {
  return [
    `The following is a transcript of a completed, ${DIFFICULTY_DESCRIPTIONS[config.difficulty]} ${TYPE_DESCRIPTIONS[config.type]} for a ${config.role} position.`,
    "Evaluate only the candidate's answers, based strictly on what appears in the transcript below. Be specific and constructive: back up every point with something the candidate actually said. Be honest about weaknesses while remaining encouraging.",
    'For each candidate answer that responds to a behavioral-style question, include starStructureNotes assessing its Situation/Task/Action/Result structure; omit starStructureNotes for answers to purely technical questions.',
    "A turn marked [cut short] means the interviewer's audio was interrupted — the candidate may not have heard all of it.",
    "Each candidate line below is tagged with its exact id, like [id: candidate_1]. For every answerFeedback entry, set turnId to exactly one of these tagged ids — never invent, alter, or reuse an id for more than one entry, and never reference an interviewer line.",
    "",
    "--- TRANSCRIPT START ---",
    formatTranscript(transcript),
    "--- TRANSCRIPT END ---",
  ].join("\n");
}

const ANSWER_FEEDBACK_SCHEMA = {
  type: "object",
  properties: {
    turnId: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    improvements: { type: "array", items: { type: "string" } },
    starStructureNotes: { type: ["string", "null"] },
  },
  required: ["turnId", "strengths", "improvements", "starStructureNotes"],
  additionalProperties: false,
};

const FEEDBACK_JSON_SCHEMA = {
  type: "object",
  properties: {
    overallScore: { type: "integer", minimum: 1, maximum: 10 },
    overallSummary: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    improvements: { type: "array", items: { type: "string" } },
    communicationFeedback: { type: "string" },
    answerFeedback: { type: "array", items: ANSWER_FEEDBACK_SCHEMA },
    suggestionsForNextPractice: { type: "array", items: { type: "string" } },
  },
  required: [
    "overallScore",
    "overallSummary",
    "strengths",
    "improvements",
    "communicationFeedback",
    "answerFeedback",
    "suggestionsForNextPractice",
  ],
  additionalProperties: false,
} as const;

export class InvalidFeedbackResponseError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/**
 * Model output is never trusted blindly, even with a strict schema — the
 * same rigor applied to client-supplied input applies here. eligibleTurnIds
 * is the exact set of candidate turn ids the model was shown (see
 * getEligibleAnswerTurnIds) — answerFeedback[].turnId must be one of these,
 * with no duplicates, or the whole response is rejected.
 */
export function parseFeedbackResponse(
  raw: unknown,
  eligibleTurnIds: ReadonlySet<string>,
): InterviewFeedback {
  if (!isRecord(raw)) {
    throw new InvalidFeedbackResponseError("Feedback response must be an object.");
  }

  const {
    overallScore,
    overallSummary,
    strengths,
    improvements,
    communicationFeedback,
    answerFeedback,
    suggestionsForNextPractice,
  } = raw;

  if (
    typeof overallScore !== "number" ||
    !Number.isInteger(overallScore) ||
    overallScore < 1 ||
    overallScore > 10
  ) {
    throw new InvalidFeedbackResponseError(
      "overallScore must be an integer from 1 to 10.",
    );
  }
  if (typeof overallSummary !== "string") {
    throw new InvalidFeedbackResponseError("overallSummary must be a string.");
  }
  if (!isStringArray(strengths)) {
    throw new InvalidFeedbackResponseError("strengths must be an array of strings.");
  }
  if (!isStringArray(improvements)) {
    throw new InvalidFeedbackResponseError("improvements must be an array of strings.");
  }
  if (typeof communicationFeedback !== "string") {
    throw new InvalidFeedbackResponseError("communicationFeedback must be a string.");
  }
  if (!Array.isArray(answerFeedback)) {
    throw new InvalidFeedbackResponseError("answerFeedback must be an array.");
  }
  if (!isStringArray(suggestionsForNextPractice)) {
    throw new InvalidFeedbackResponseError(
      "suggestionsForNextPractice must be an array of strings.",
    );
  }

  const seenTurnIds = new Set<string>();
  const parsedAnswerFeedback: AnswerFeedback[] = answerFeedback.map((item, index) => {
    if (!isRecord(item)) {
      throw new InvalidFeedbackResponseError(`answerFeedback[${index}] must be an object.`);
    }
    const { turnId, strengths: answerStrengths, improvements: answerImprovements, starStructureNotes } = item;
    if (typeof turnId !== "string") {
      throw new InvalidFeedbackResponseError(`answerFeedback[${index}].turnId must be a string.`);
    }
    if (!eligibleTurnIds.has(turnId)) {
      throw new InvalidFeedbackResponseError(
        `answerFeedback[${index}].turnId does not reference an eligible candidate answer.`,
      );
    }
    if (seenTurnIds.has(turnId)) {
      throw new InvalidFeedbackResponseError(
        `answerFeedback[${index}].turnId duplicates an earlier entry.`,
      );
    }
    seenTurnIds.add(turnId);
    if (!isStringArray(answerStrengths)) {
      throw new InvalidFeedbackResponseError(
        `answerFeedback[${index}].strengths must be an array of strings.`,
      );
    }
    if (!isStringArray(answerImprovements)) {
      throw new InvalidFeedbackResponseError(
        `answerFeedback[${index}].improvements must be an array of strings.`,
      );
    }
    if (starStructureNotes !== undefined && starStructureNotes !== null && typeof starStructureNotes !== "string") {
      throw new InvalidFeedbackResponseError(
        `answerFeedback[${index}].starStructureNotes must be a string or null.`,
      );
    }

    return {
      turnId,
      strengths: answerStrengths,
      improvements: answerImprovements,
      ...(typeof starStructureNotes === "string" ? { starStructureNotes } : {}),
    };
  });

  return {
    overallScore,
    overallSummary,
    strengths,
    improvements,
    communicationFeedback,
    answerFeedback: parsedAnswerFeedback,
    suggestionsForNextPractice,
  };
}

export async function generateInterviewFeedback({
  apiKey,
  config,
  transcript,
}: {
  apiKey: string;
  config: InterviewConfig;
  transcript: InterviewTurn[];
}): Promise<InterviewFeedback> {
  const client = new OpenAI({ apiKey });

  const response = await client.responses.create({
    model: FEEDBACK_MODEL,
    instructions:
      "You are an expert interview coach evaluating a completed mock interview transcript. Provide structured, specific, and constructive feedback. overallScore must be an integer from 1 (poor) to 10 (excellent).",
    input: buildFeedbackPrompt(config, transcript),
    text: {
      format: {
        type: "json_schema",
        name: "interview_feedback",
        schema: FEEDBACK_JSON_SCHEMA,
        strict: true,
      },
    },
  });

  let parsedOutput: unknown;
  try {
    parsedOutput = JSON.parse(response.output_text);
  } catch {
    throw new InvalidFeedbackResponseError("Feedback response was not valid JSON.");
  }

  return parseFeedbackResponse(parsedOutput, getEligibleAnswerTurnIds(transcript));
}
