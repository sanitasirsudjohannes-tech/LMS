"use client";
import { useEffect, useState } from "react";
import { remainingTrainingTime } from "@/lib/learningMonitoring";

export default function TrainingDeadline({
  endDate,
}: {
  endDate?: string | null;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = remainingTrainingTime(endDate, now);
  if (!remaining) return null;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
      {remaining}
      <span className="mt-1 block font-normal">
        Batas:{" "}
        {new Date(endDate!).toLocaleString("id-ID", {
          timeZone: "Asia/Makassar",
        })}{" "}
        WITA.
      </span>
    </div>
  );
}
