"use client";

import { useState } from "react";
import InterviewScreen from "@/src/components/InterviewScreen";
import InterviewSetupForm from "@/src/components/InterviewSetupForm";
import type { InterviewConfig } from "@/src/types/interview";

export default function InterviewApp() {
  const [config, setConfig] = useState<InterviewConfig | null>(null);

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16 font-sans dark:bg-black">
      {config ? (
        <InterviewScreen config={config} onEnd={() => setConfig(null)} />
      ) : (
        <InterviewSetupForm onStart={setConfig} />
      )}
    </div>
  );
}
