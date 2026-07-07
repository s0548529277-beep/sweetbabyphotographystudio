export function toCSV(rows: Record<string, unknown>[], headers: { key: string; label: string }[]) {
  const escape = (v: unknown) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = headers.map((h) => escape(h.label)).join(",");
  const body = rows.map((r) => headers.map((h) => escape(r[h.key])).join(",")).join("\n");
  return "\ufeff" + head + "\n" + body;
}

export function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
