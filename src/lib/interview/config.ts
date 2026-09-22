import type {
  InterviewConfig,
  InterviewDifficulty,
  InterviewType,
} from "@/src/types/interview";

const INTERVIEW_TYPES: InterviewType[] = ["behavioral", "technical", "mixed"];
const DIFFICULTIES: InterviewDifficulty[] = [
  "entry",
  "intermediate",
  "advanced",
];

const ROLE_MAX_LENGTH = 100;

export class InvalidInterviewConfigError extends Error {}

export function validateInterviewConfig(body: unknown): InterviewConfig {
  if (typeof body !== "object" || body === null) {
    throw new InvalidInterviewConfigError("config must be an object.");
  }

  const { role, type, difficulty } = body as Record<string, unknown>;

  if (typeof role !== "string" || role.trim().length === 0) {
    throw new InvalidInterviewConfigError("role must be a non-empty string.");
  }
  const trimmedRole = role.trim();
  if (trimmedRole.length > ROLE_MAX_LENGTH) {
    throw new InvalidInterviewConfigError(
      `role must be ${ROLE_MAX_LENGTH} characters or fewer.`,
    );
  }

  if (
    typeof type !== "string" ||
    !INTERVIEW_TYPES.includes(type as InterviewType)
  ) {
    throw new InvalidInterviewConfigError(
      `type must be one of: ${INTERVIEW_TYPES.join(", ")}.`,
    );
  }

  if (
    typeof difficulty !== "string" ||
    !DIFFICULTIES.includes(difficulty as InterviewDifficulty)
  ) {
    throw new InvalidInterviewConfigError(
      `difficulty must be one of: ${DIFFICULTIES.join(", ")}.`,
    );
  }

  return {
    role: trimmedRole,
    type: type as InterviewType,
    difficulty: difficulty as InterviewDifficulty,
  };
}
