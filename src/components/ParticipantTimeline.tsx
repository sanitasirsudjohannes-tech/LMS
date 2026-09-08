"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function ParticipantTimeline({
  trainingId,
  userId,
  name,
  onClose,
}: {
  trainingId: string;
  userId: string;
  name: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [events, setEvents] = useState<
    { event_at: string; event_type: string; label: string }[]
  >([]);
  const [message, setMessage] = useState("Memuat riwayat…");
  useEffect(() => {
    dialog.current?.showModal();
    let active = true;
    void supabase
      .rpc("admin_participant_timeline", {
        p_training_id: trainingId,
        p_user_id: userId,
      })
      .then(({ data, error }) => {
        if (!active) return;
        setEvents(data || []);
        setMessage(error?.message || "Belum ada aktivitas yang tercatat.");
      });
    return () => {
      active = false;
    };
  }, [trainingId, userId]);
  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      className="m-auto max-h-[85vh] w-[min(95vw,650px)] overflow-y-auto rounded-2xl bg-white p-5 text-slate-900 backdrop:bg-black/50 dark:bg-slate-900 dark:text-white"
    >
      <div className="flex justify-between gap-4">
        <h2 className="font-bold">Riwayat aktivitas — {name}</h2>
        <button
          autoFocus
          onClick={() => dialog.current?.close()}
          className="rounded-lg border px-3 py-2"
        >
          Tutup
        </button>
      </div>
      {events.length ? (
        <ol className="mt-5 space-y-4 border-l-2 border-sky-300 pl-4">
          {events.map((event, i) => (
            <li key={`${event.event_type}:${event.event_at}:${i}`}>
              <time className="text-xs text-slate-500">
                {new Date(event.event_at).toLocaleString("id-ID", {
                  timeZone: "Asia/Makassar",
                })}{" "}
                WITA
              </time>
              <p className="text-sm">{event.label}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="py-6">{message}</p>
      )}
      <p className="mt-5 text-xs text-slate-500">
        Riwayat yang sudah dibersihkan dari pelatihan arsip tidak ditampilkan.
      </p>
    </dialog>
  );
}
