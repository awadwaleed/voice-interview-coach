export type InterviewType = "behavioral" | "technical" | "mixed";

export type InterviewDifficulty = "entry" | "intermediate" | "advanced";

export type InterviewStatus =
  | "idle"
  | "connecting"
  | "active"
  | "ending"
  | "analyzing"
  | "complete"
  | "error";

export type InterviewSpeaker = "interviewer" | "candidate";

export interface InterviewConfig {
  role: string;
  type: InterviewType;
  difficulty: InterviewDifficulty;
}

export type InterviewTurnStatus = "pending" | "complete" | "failed" | "interrupted";

export interface InterviewTurn {
  id: string;
  speaker: InterviewSpeaker;
  transcript: string;
  timestamp: number;
  status: InterviewTurnStatus;
}

export interface InterviewSession {
  id: string;
  config: InterviewConfig;
  status: InterviewStatus;
  startedAt: number | null;
  endedAt: number | null;
  transcript: InterviewTurn[];
}

export interface AnswerFeedback {
  turnId: string;
  strengths: string[];
  improvements: string[];
}

export interface InterviewFeedback {
  overallScore: number;
  strengths: string[];
  improvements: string[];
  communicationFeedback: string;
  answerFeedback: AnswerFeedback[];
}
