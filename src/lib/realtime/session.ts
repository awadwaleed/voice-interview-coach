import type { InterviewConfig, InterviewType, InterviewDifficulty } from "@/src/types/interview";

const TYPE_DESCRIPTIONS: Record<InterviewType, string> = {
  behavioral:
    "behavioral interview focused on past experiences and soft skills",
  technical:
    "technical interview focused on role-relevant technical skills and problem solving",
  mixed: "mixed interview combining behavioral and technical questions",
};

const DIFFICULTY_DESCRIPTIONS: Record<InterviewDifficulty, string> = {
  entry: "entry-level",
  intermediate: "intermediate-level",
  advanced: "advanced/senior-level",
};

export function buildInterviewerInstructions(config: InterviewConfig): string {
  return [
    `You are conducting a live, realistic ${DIFFICULTY_DESCRIPTIONS[config.difficulty]} ${TYPE_DESCRIPTIONS[config.type]} for a ${config.role} position.`,
    "Ask one question at a time and wait for the candidate's full answer before responding.",
    "Ask reasonable, natural follow-up questions based on what the candidate says.",
    "Maintain a professional, realistic interview tone.",
    "Do not coach, grade, or give feedback on answers during the interview — evaluation happens separately after the interview ends.",
  ].join(" ");
}
