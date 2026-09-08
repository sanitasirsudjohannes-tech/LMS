"use client";

import React, { useEffect, useMemo, useState } from "react";
import { StorageAPI, initLocalStorage } from "@/lib/storage";
import { Training } from "@/types";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  Sliders,
  Download,
  TrendingUp,
  Users,
  GraduationCap,
  BookOpenCheck,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { csvCell, formatScoreChange } from "@/lib/learningMonitoring";
import LontarLoadingSpinner from "@/components/LontarLoadingSpinner";

type ProgressRow = {
  user_id: string;
  full_name: string;
  email: string;
  pre_score: number | null;
  completed_materials: number;
  total_materials: number;
  best_post_score: number | null;
  post_attempts: number;
  learning_status: string;
  last_activity_at: string | null;
  total_count: number;
};
type Summary = {
  started: number;
  completed: number;
  posttest_completed: number;
  passed: number;
  paired_count: number;
  pretest_average: number | null;
  posttest_average: number | null;
  improvement: number | null;
};
type QuestionAnalysis = {
  question_id: string;
  question: string;
  answered_count: number;
  correct_count: number;
  correct_percent: number | null;
};
const PAGE_SIZE = 20;

function Status({ value }: { value: string }) {
  if (value === "Selesai")
    return (
      <span className="inline-flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Selesai
      </span>
    );
  if (value === "Belum Lulus")
    return (
      <span className="inline-flex items-center gap-1 font-bold text-red-700 dark:text-red-400">
        <XCircle className="h-3.5 w-3.5" />
        Belum Lulus
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
      <Clock className="h-3.5 w-3.5" />
      {value}
    </span>
  );
}
function fmtDate(v: string | null) {
  return v
    ? new Date(v).toLocaleString("id-ID", {
        timeZone: "Asia/Makassar",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";
}

export default function ResultsAdminPage() {
  const [trainings, setTrainings] = useState<Training[]>([]),
    [selected, setSelected] = useState(""),
    [search, setSearch] = useState(""),
    [debounced, setDebounced] = useState("");
  const [rows, setRows] = useState<ProgressRow[]>([]),
    [summary, setSummary] = useState<Summary | null>(null),
    [questions, setQuestions] = useState<QuestionAnalysis[]>([]);
  const [analyticsError, setAnalyticsError] = useState("");
  const [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [exporting, setExporting] = useState(false);
  useEffect(() => {
    void (async () => {
      try {
        await initLocalStorage();
        const list = StorageAPI.getTrainings();
        const current = StorageAPI.getTraining() || list[0];
        setTrainings(list);
        setSelected(current?.id || "");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Data gagal dimuat.");
      }
    })();
  }, []);
  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(t);
  }, [search]);
  // Summary and question analysis depend only on the training, not table filters.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    void (async () => {
      setSummary(null);
      setQuestions([]);
      setAnalyticsError("");
      const [s, q] = await Promise.all([
        supabase.rpc("admin_training_learning_summary", {
          p_training_id: selected,
        }),
        supabase.rpc("admin_question_analysis", { p_training_id: selected }),
      ]);
      if (cancelled) return;
      if (s.error || q.error)
        setAnalyticsError(
          (s.error || q.error)?.message || "Analisis gagal dimuat.",
        );
      if (!s.error) setSummary(s.data as Summary);
      if (!q.error) setQuestions((q.data || []) as QuestionAnalysis[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [selected]);
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError("");
      const result = await supabase.rpc("admin_training_progress", {
        p_training_id: selected,
        p_search: debounced,
        p_limit: PAGE_SIZE,
        p_offset: (page - 1) * PAGE_SIZE,
      });
      if (cancelled) return;
      if (result.error) {
        setRows([]);
        setTotal(0);
        setError(result.error.message);
      } else {
        const data = (result.data || []) as ProgressRow[];
        if (!data.length && page > 1) {
          setPage(1);
          return;
        }
        setRows(data);
        setTotal(Number(data[0]?.total_count || 0));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [selected, debounced, page]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const completionRate = summary?.started
    ? Math.round((summary.completed / summary.started) * 100)
    : 0;
  const passRate = summary?.posttest_completed
    ? Math.round((summary.passed / summary.posttest_completed) * 100)
    : 0;
  const selectedTraining = trainings.find((t) => t.id === selected);
  const exportCsv = async () => {
    if (!selected) return;
    setExporting(true);
    try {
      const all: ProgressRow[] = [];
      let offset = 0;
      while (true) {
        const { data, error: e } = await supabase.rpc(
          "admin_training_progress",
          {
            p_training_id: selected,
            p_search: debounced,
            p_limit: 100,
            p_offset: offset,
          },
        );
        if (e) throw e;
        const batch = (data || []) as ProgressRow[];
        all.push(...batch);
        if (batch.length < 100) break;
        offset += 100;
      }
      const header = [
        "Nama",
        "Email",
        "Pre-Test",
        "Materi Selesai",
        "Total Materi",
        "Post-Test Terbaik",
        "Percobaan",
        "Status",
        "Aktivitas Terakhir",
      ];
      const body = all.map((r) =>
        [
          r.full_name,
          r.email,
          r.pre_score ?? "",
          r.completed_materials,
          r.total_materials,
          r.best_post_score ?? "",
          r.post_attempts,
          r.learning_status,
          fmtDate(r.last_activity_at),
        ]
          .map(csvCell)
          .join(","),
      );
      const blob = new Blob(
        ["\uFEFF" + [header.map(csvCell).join(","), ...body].join("\n")],
        { type: "text/csv;charset=utf-8" },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `LONTAR_Progress_${(selectedTraining?.title || "Pelatihan").replace(/[^a-z0-9]+/gi, "_")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ekspor gagal.");
    } finally {
      setExporting(false);
    }
  };
  const cards = useMemo(
    () =>
      summary
        ? [
            {
              label: "Peserta Mulai",
              value: summary.started,
              sub: `${summary.completed} selesai`,
              icon: Users,
            },
            {
              label: "Penyelesaian",
              value: `${completionRate}%`,
              sub: `${summary.completed}/${summary.started || 0} peserta`,
              icon: BookOpenCheck,
            },
            {
              label: "Kelulusan",
              value: `${passRate}%`,
              sub: `${summary.passed}/${summary.posttest_completed || 0} sudah Post-Test`,
              icon: GraduationCap,
            },
            {
              label: "Peningkatan Nilai",
              value: formatScoreChange(summary.improvement),
              sub: `${summary.pretest_average ?? "—"} → ${summary.posttest_average ?? "—"} • ${summary.paired_count} pasangan nilai`,
              icon: TrendingUp,
            },
          ]
        : [],
    [summary, completionRate, passRate],
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-bold">Monitoring & Analisis Pelatihan</h2>
          <p className="mt-1 text-xs text-slate-500">
            Progress peserta, perbandingan Pre/Post-Test, kualitas soal, dan
            ekspor laporan.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex items-center gap-2 rounded-xl border bg-slate-50 p-1.5 dark:border-slate-700 dark:bg-slate-800">
            <Sliders className="ml-2 h-4 w-4 text-slate-400" />
            <select
              disabled={exporting}
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                StorageAPI.setSelectTraining(e.target.value);
                setPage(1);
              }}
              className="max-w-[260px] bg-transparent py-1.5 pr-2 text-xs font-bold outline-none"
            >
              {trainings.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => void exportCsv()}
            disabled={exporting || !selected || loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#07375c] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {exporting ? "Mengekspor..." : "Ekspor CSV"}
          </button>
        </div>
      </div>
      {(error || analyticsError) && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-xs text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          <b>Data analisis gagal dimuat.</b> {error || analyticsError}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <c.icon className="mb-3 h-5 w-5 text-[#07375c] dark:text-sky-300" />
            <p className="text-[11px] font-semibold text-slate-500">
              {c.label}
            </p>
            <p className="mt-1 text-2xl font-black">{c.value}</p>
            <p className="mt-1 text-[10px] text-slate-400">{c.sub}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input
            disabled={exporting}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
            placeholder="Cari nama atau email peserta..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs dark:border-slate-700 dark:bg-slate-800"
          />
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b p-4 dark:border-slate-800">
          <h3 className="text-sm font-bold">Progress Peserta</h3>
          <p className="text-[11px] text-slate-500">
            Tahap terakhir dan aktivitas terbaru setiap peserta.
          </p>
        </div>
        {loading ? (
          <div className="p-10">
            <LontarLoadingSpinner size="md" text="Memuat monitoring..." />
          </div>
        ) : (
          <>
            <div className="space-y-3 p-3 md:hidden">
              {rows.length === 0 && (
                <p className="p-4 text-center text-xs text-slate-500">
                  Belum ada peserta sesuai pencarian.
                </p>
              )}
              {rows.map((r) => (
                <div
                  key={r.user_id}
                  className="rounded-xl border p-3 dark:border-slate-700"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">
                        {r.full_name}
                      </p>
                      <p className="truncate text-[10px] text-slate-500">
                        {r.email}
                      </p>
                    </div>
                    <Status value={r.learning_status} />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px]">
                    <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800">
                      Pre
                      <br />
                      <b>{r.pre_score ?? "-"}</b>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800">
                      Materi
                      <br />
                      <b>
                        {r.completed_materials}/{r.total_materials}
                      </b>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800">
                      Post
                      <br />
                      <b>{r.best_post_score ?? "-"}</b>
                    </div>
                  </div>
                  <p className="mt-2 text-[10px] text-slate-400">
                    Terakhir: {fmtDate(r.last_activity_at)}
                  </p>
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800">
                  <tr>
                    <th className="p-4">Peserta</th>
                    <th className="p-4 text-center">Pre</th>
                    <th className="p-4 text-center">Materi</th>
                    <th className="p-4 text-center">Post</th>
                    <th className="p-4">Tahap</th>
                    <th className="p-4">Aktivitas Terakhir</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-slate-800">
                  {rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="p-6 text-center text-slate-500"
                      >
                        Belum ada peserta sesuai pencarian.
                      </td>
                    </tr>
                  )}
                  {rows.map((r) => (
                    <tr key={r.user_id}>
                      <td className="p-4">
                        <b>{r.full_name}</b>
                        <p className="text-[10px] text-slate-400">{r.email}</p>
                      </td>
                      <td className="p-4 text-center font-mono">
                        {r.pre_score ?? "-"}
                      </td>
                      <td className="p-4 text-center font-mono">
                        {r.completed_materials}/{r.total_materials}
                      </td>
                      <td className="p-4 text-center font-mono font-bold">
                        {r.best_post_score ?? "-"}
                      </td>
                      <td className="p-4">
                        <Status value={r.learning_status} />
                      </td>
                      <td className="p-4 text-[11px] text-slate-500">
                        {fmtDate(r.last_activity_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="flex items-center justify-between border-t p-3 text-xs dark:border-slate-800">
          <span>
            {rows.length} dari {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((v) => Math.max(1, v - 1))}
              disabled={page === 1 || loading}
              className="rounded-lg border p-1.5 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <b>
              {page}/{totalPages}
            </b>
            <button
              onClick={() => setPage((v) => Math.min(totalPages, v + 1))}
              disabled={page >= totalPages || loading}
              className="rounded-lg border p-1.5 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-sm font-bold">Analisis Soal Post-Test</h3>
        <p className="mb-4 mt-1 text-[11px] text-slate-500">
          Menghitung seluruh percobaan Post-Test yang sudah dikirim. Diurutkan
          dari persentase benar terendah; jawaban sementara tidak dihitung.
        </p>
        {questions.length ? (
          <div className="space-y-2">
            {questions.slice(0, 20).map((q, i) => (
              <div
                key={q.question_id}
                className="flex gap-3 rounded-xl border border-slate-100 p-3 dark:border-slate-800"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold dark:bg-slate-800">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold">{q.question}</p>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                    <span>
                      {q.correct_count}/{q.answered_count} benar
                    </span>
                    <b
                      className={
                        (q.correct_percent ?? 0) < 60
                          ? "text-red-600"
                          : "text-emerald-600"
                      }
                    >
                      {q.correct_percent ?? 0}% benar
                    </b>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-xs text-slate-400">
            Belum ada jawaban Post-Test untuk dianalisis.
          </p>
        )}
      </div>
    </div>
  );
}
