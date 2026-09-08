"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { StorageAPI, initLocalStorage } from "@/lib/storage";
import LontarLoadingSpinner from "@/components/LontarLoadingSpinner";
export default function ResumePage() {
  const router = useRouter(),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await initLocalStorage();
        const user = StorageAPI.getCurrentUser();
        if (!user) return router.replace("/login");
        if (user.role === "admin") return router.replace("/admin");
        const trainingId = new URLSearchParams(window.location.search).get(
          "training",
        );
        const { data, error: failure } = await supabase.rpc(
          "my_learning_resume",
          { p_training_id: trainingId },
        );
        if (failure) throw failure;
        if (!active) return;
        if (data.training_id)
          await StorageAPI.loadTrainingResources(data.training_id);
        if (!active) return;
        if (data.certificate_id)
          StorageAPI.selectCertificate(data.certificate_id);
        router.replace(data.path);
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : "Progres gagal dimuat.");
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);
  return (
    <div className="mx-auto max-w-lg py-12 text-center">
      {error ? (
        <>
          <p role="alert">{error}</p>
          <button
            className="mt-4 rounded-xl bg-sky-700 px-5 py-3 text-white"
            onClick={() => router.replace("/trainings")}
          >
            Pilih Pelatihan
          </button>
        </>
      ) : (
        <LontarLoadingSpinner
          text="Melanjutkan tahap terakhir Anda…"
          size="lg"
        />
      )}
    </div>
  );
}
