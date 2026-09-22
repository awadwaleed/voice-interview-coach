"use client";

import { useState } from "react";
import InterviewFeedbackScreen from "@/src/components/InterviewFeedbackScreen";
import InterviewScreen from "@/src/components/InterviewScreen";
import InterviewSetupForm from "@/src/components/InterviewSetupForm";
import type { InterviewConfig, InterviewTurn } from "@/src/types/interview";

type Stage =
  | { name: "setup" }
  | { name: "interview"; config: InterviewConfig }
  | { name: "feedback"; config: InterviewConfig; transcript: InterviewTurn[] };

export default function InterviewApp() {
  const [stage, setStage] = useState<Stage>({ name: "setup" });

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16 font-sans dark:bg-black">
      {stage.name === "setup" && (
        <InterviewSetupForm
          onStart={(config) => setStage({ name: "interview", config })}
        />
      )}

      {stage.name === "interview" && (
        <InterviewScreen
          config={stage.config}
          onEnd={(transcript) =>
            setStage({ name: "feedback", config: stage.config, transcript })
          }
        />
      )}

      {stage.name === "feedback" && (
        <InterviewFeedbackScreen
          config={stage.config}
          transcript={stage.transcript}
          onRestart={() => setStage({ name: "setup" })}
        />
      )}
    </div>
  );
}
