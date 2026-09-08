export default function ParticipantStages({
  pre,
  done,
  total,
  post,
  certificate,
}: {
  pre: number | null;
  done: number;
  total: number;
  post: number | null;
  certificate: boolean;
}) {
  return (
    <p className="mt-2 flex flex-wrap gap-1 text-xs">
      <span>Pre-Test {pre === null ? "belum" : "✓"}</span>
      <span>→</span>
      <span>
        Materi {done}/{total}
      </span>
      <span>→</span>
      <span>Post-Test {post === null ? "belum" : "✓"}</span>
      <span>→</span>
      <span>Sertifikat {certificate ? "✓ terbit" : "belum"}</span>
    </p>
  );
}
