"use client";

import { useEffect } from "react";
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/src/components/buttonStyles";
import { useInterviewFeedback } from "@/src/hooks/useInterviewFeedback";
import { hasEvaluableContent } from "@/src/lib/feedback/validateTranscript";
import type { InterviewConfig, InterviewTurn } from "@/src/types/interview";

interface InterviewFeedbackScreenProps {
  config: InterviewConfig;
  transcript: InterviewTurn[];
  onRestart: () => void;
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

export default function InterviewFeedbackScreen({
  config,
  transcript,
  onRestart,
}: InterviewFeedbackScreenProps) {
  const { status, feedback, error, analyze } = useInterviewFeedback();
  const evaluable = hasEvaluableContent(transcript);

  useEffect(() => {
    if (!evaluable) return;
    analyze(config, transcript);
    // config/transcript are set once by the caller and never change for the
    // lifetime of this screen; analyze() has a stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, transcript]);

  const transcriptById = new Map(transcript.map((turn) => [turn.id, turn]));

  return (
    <div className="w-full max-w-2xl rounded-2xl border border-black/10 bg-white p-8 shadow-sm dark:border-white/15 dark:bg-black">
      <h1 className="text-xl font-semibold text-foreground">Interview feedback</h1>
      <p className="mt-1 text-sm text-foreground/60">
        {config.role} · {config.type} · {config.difficulty}
      </p>

      <div className="mt-6 flex flex-col gap-6">
        {!evaluable && (
          <p className="text-sm text-foreground/60">
            Not enough was said during the interview to generate feedback.
          </p>
        )}

        {evaluable && status === "loading" && (
          <div role="status" className="flex items-center gap-2 text-sm font-medium text-foreground">
            <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-yellow-500" />
            Analyzing your interview…
          </div>
        )}

        {evaluable && status === "error" && (
          <div role="status" className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />
              Analysis failed
            </div>
            {error && <p className="text-sm text-foreground/60">{error}</p>}
          </div>
        )}

        {status === "success" && feedback && (
          <>
            <section>
              <h2 className="text-sm font-semibold text-foreground">
                Overall score: {feedback.overallScore}/10
              </h2>
              <p className="mt-1 text-sm text-foreground">{feedback.overallSummary}</p>
            </section>

            <section>
              <h2 className="text-sm font-semibold text-foreground">Strengths</h2>
              <div className="mt-1">
                <List items={feedback.strengths} />
              </div>
            </section>

            <section>
              <h2 className="text-sm font-semibold text-foreground">Areas for improvement</h2>
              <div className="mt-1">
                <List items={feedback.improvements} />
              </div>
            </section>

            <section>
              <h2 className="text-sm font-semibold text-foreground">Communication</h2>
              <p className="mt-1 text-sm text-foreground">{feedback.communicationFeedback}</p>
            </section>

            {feedback.answerFeedback.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-foreground">Question-by-question feedback</h2>
                <div className="mt-2 flex flex-col gap-4">
                  {feedback.answerFeedback.map((answer) => {
                    const turn = transcriptById.get(answer.turnId);
                    return (
                      <div
                        key={answer.turnId}
                        className="rounded-lg border border-black/10 p-3 dark:border-white/15"
                      >
                        {turn && (
                          <p className="text-sm italic text-foreground/60">
                            &ldquo;{turn.transcript}&rdquo;
                          </p>
                        )}
                        {answer.strengths.length > 0 && (
                          <div className="mt-2">
                            <List items={answer.strengths} />
                          </div>
                        )}
                        {answer.improvements.length > 0 && (
                          <div className="mt-2">
                            <List items={answer.improvements} />
                          </div>
                        )}
                        {answer.starStructureNotes && (
                          <p className="mt-2 text-sm text-foreground/60">
                            STAR structure: {answer.starStructureNotes}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <section>
              <h2 className="text-sm font-semibold text-foreground">Suggestions for next time</h2>
              <div className="mt-1">
                <List items={feedback.suggestionsForNextPractice} />
              </div>
            </section>
          </>
        )}

        {evaluable && status === "error" && (
          <button
            type="button"
            onClick={() => analyze(config, transcript)}
            className={PRIMARY_BUTTON_CLASS}
          >
            Retry Analysis
          </button>
        )}

        <button type="button" onClick={onRestart} className={SECONDARY_BUTTON_CLASS}>
          Start New Interview
        </button>
      </div>
    </div>
  );
}
