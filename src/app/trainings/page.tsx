"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Award, BookOpen, CheckCircle2, Clock3, Search } from "lucide-react";
import { initCurrentUser } from "@/lib/storage";
import { Training, UserProfile } from "@/types";
import TrainingDeadline from "@/components/TrainingDeadline";
import { supabase } from "@/lib/supabase";
import LontarLoadingSpinner from "@/components/LontarLoadingSpinner";

type Filter = "all" | "ongoing" | "completed";
type TrainingView = {
  training: Training;
  status: "not_started" | "ongoing" | "completed";
  score: number | null;
  certificate: boolean;
  materialsCompleted: number;
  totalMaterials: number;
};

export default function TrainingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [items, setItems] = useState<TrainingView[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [openingId, setOpeningId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const currentUser = await initCurrentUser();
        if (!currentUser) {
          router.push("/login");
          return;
        }
        if (currentUser.role === "admin") {
          router.push("/admin");
          return;
        }
        const { data, error: failure } = await supabase.rpc(
          "my_training_overview",
        );
        if (failure) throw failure;
        if (cancelled) return;
        setUser(currentUser);
        const overview = (data || []) as {
          training: Training;
          learning_status: string;
          best_post_score: number | null;
          completed_materials: number;
          total_materials: number;
          has_certificate: boolean;
        }[];
        setItems(
          overview.map((row) => ({
            training: row.training,
            status:
              row.learning_status === "Selesai"
                ? "completed"
                : row.learning_status === "Belum Mulai"
                  ? "not_started"
                  : "ongoing",
            score: row.best_post_score,
            certificate: row.has_certificate,
            materialsCompleted: row.completed_materials,
            totalMaterials: row.total_materials,
          })),
        );
      } catch (failure) {
        if (!cancelled)
          setError(
            failure instanceof Error
              ? failure.message
              : "Daftar pelatihan gagal dimuat. Coba muat ulang halaman.",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);
  const filtered = useMemo(
    () =>
      items.filter((item) => {
        const matches =
          filter === "all" ||
          (filter === "ongoing"
            ? item.status === "ongoing"
            : item.status === "completed");
        return (
          matches &&
          `${item.training.title} ${item.training.description || ""}`
            .toLowerCase()
            .includes(query.trim().toLowerCase())
        );
      }),
    [items, filter, query],
  );
  const openTraining = (training: Training) => {
    if (openingId) return;
    setOpeningId(training.id);
    router.push(`/resume?training=${encodeURIComponent(training.id)}`);
  };
  if (loading)
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <LontarLoadingSpinner size="lg" text="Memuat pelatihan Anda..." />
      </div>
    );
  if (!user)
    return (
      <div role="alert" className="p-6 text-center">
        {error || "Mengalihkan ke halaman masuk…"}
        <button
          className="ml-3 underline"
          onClick={() => window.location.reload()}
        >
          Muat ulang
        </button>
      </div>
    );
  const completedCount = items.filter((i) => i.status === "completed").length;
  const ongoingCount = items.filter((i) => i.status === "ongoing").length;
  return (
    <div className="mx-auto max-w-6xl space-y-5 py-2">
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      <section className="overflow-hidden rounded-3xl bg-[#07375c] p-6 text-white shadow-sm sm:p-8">
        <div className="max-w-2xl">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-sky-200">
            Daftar Pelatihan
          </span>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">
            Pelatihan Saya
          </h1>
          <p className="mt-2 text-sm text-sky-100/80">
            Lanjutkan pembelajaran dari progres terakhir dan selesaikan sebelum
            periode pelatihan berakhir.
          </p>
        </div>
        <div className="mt-6 grid max-w-xl grid-cols-3 gap-2">
          <div className="rounded-lg bg-white/10 p-3">
            <b className="block text-2xl">{items.length}</b>
            <span className="text-xs">Tersedia</span>
          </div>
          <div className="rounded-lg bg-white/10 p-3">
            <b className="block text-2xl">{ongoingCount}</b>
            <span className="text-xs">Berjalan</span>
          </div>
          <div className="rounded-lg bg-white/10 p-3">
            <b className="block text-2xl">{completedCount}</b>
            <span className="text-xs">Selesai</span>
          </div>
        </div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
          <div className="flex gap-2 overflow-x-auto">
            {(
              [
                ["all", "Semua"],
                ["ongoing", "Berjalan"],
                ["completed", "Selesai"],
              ] as [Filter, string][]
            ).map(([v, l]) => (
              <button
                key={v}
                onClick={() => setFilter(v)}
                className={`min-h-11 rounded-lg px-4 text-xs font-bold ${filter === v ? "bg-[#07375c] text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}
              >
                {l}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 rounded-xl border px-3 py-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              aria-label="Cari pelatihan"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent text-xs outline-none sm:w-56"
              placeholder="Cari pelatihan..."
            />
          </label>
        </div>
      </section>
      {filtered.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(
            ({
              training,
              status,
              score,
              certificate,
              materialsCompleted,
              totalMaterials,
            }) => {
              const completed = status === "completed",
                ongoing = status === "ongoing";
              return (
                <article
                  key={training.id}
                  className="flex min-h-[270px] flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex justify-between gap-3">
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-xl ${completed ? "bg-emerald-100 text-emerald-700" : "bg-[#07375c]/10 text-[#07375c]"}`}
                    >
                      {completed ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : (
                        <BookOpen className="h-5 w-5" />
                      )}
                    </div>
                    <span
                      className={`h-fit rounded-full px-2.5 py-1 text-xs font-bold ${completed ? "bg-emerald-100 text-emerald-700" : ongoing ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}
                    >
                      {completed
                        ? "Selesai"
                        : ongoing
                          ? "Sedang Berjalan"
                          : "Belum Dimulai"}
                    </span>
                  </div>
                  <h2 className="mt-4 line-clamp-2 text-base font-bold">
                    {training.title}
                  </h2>
                  <p className="mt-2 line-clamp-2 text-xs text-slate-500">
                    {training.description ||
                      "Pelatihan online LONTAR RSUD Prof. Dr. W.Z. Johannes Kupang."}
                  </p>
                  {!completed && (
                    <TrainingDeadline endDate={training.end_date} />
                  )}
                  <div className="mt-auto pt-5">
                    <div className="mb-3 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 dark:bg-slate-800">
                        <Clock3 className="h-3 w-3" />
                        Materi {materialsCompleted}/{totalMaterials}
                      </span>
                      {score !== null && (
                        <span className="rounded-lg bg-slate-50 px-2 py-1 dark:bg-slate-800">
                          Nilai terbaik: <b>{score}</b>
                        </span>
                      )}
                      {certificate && (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-amber-700">
                          <Award className="h-3 w-3" /> Sertifikat tersedia
                        </span>
                      )}
                    </div>
                    <button
                      disabled={openingId !== null}
                      onClick={() => void openTraining(training)}
                      className="w-full rounded-xl bg-[#07375c] px-4 py-3 text-xs font-bold text-white dark:bg-sky-400 dark:text-slate-950"
                    >
                      {openingId === training.id
                        ? "Membuka…"
                        : completed
                          ? "Lihat Pelatihan"
                          : ongoing
                            ? "Lanjutkan dari Progres Terakhir"
                            : "Mulai Pelatihan"}
                    </button>
                  </div>
                </article>
              );
            },
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <BookOpen className="mx-auto h-9 w-9 text-slate-300" />
          <p className="mt-3 text-sm font-bold">
            Tidak ada pelatihan pada filter ini
          </p>
        </div>
      )}
    </div>
  );
}
