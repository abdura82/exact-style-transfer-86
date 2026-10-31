import type { AttendanceRow } from "./store";

export const VAKITLER = ["Sabah", "Öğle", "İkindi", "Akşam", "Yatsı"] as const;
export const COLUMNS = [...VAKITLER, "Ders"] as const;

/** One cell of the yoklama (one vakit or the lesson). "yok" = not marked = did not come. */
export type CellStatus = "geldi" | "gec" | "izinli" | "hasta" | "yok";
export type CellNote = "gec" | "izinli" | "hasta";

export const CELL_LETTER: Record<CellStatus, string> = { geldi: "✓", gec: "G", izinli: "İ", hasta: "H", yok: "X" };
export const CELL_LABEL: Record<CellStatus, string> = { geldi: "Geldi", gec: "Geç", izinli: "İzinli", hasta: "Hasta", yok: "Gelmedi" };

/** Status of one vakit/ders cell. Each cell has exactly one status. */
export function cellStatus(r: Pick<AttendanceRow, "vakitler" | "ders" | "durum" | "durumlar"> | undefined, c: string): CellStatus {
  if (!r) return "yok";
  const note = r.durumlar?.[c];
  if (note) return note;
  if (c === "Ders" ? r.ders : r.vakitler.includes(c)) return "geldi";
  // Old records stored İzinli for the whole day.
  if (!r.durumlar && r.durum === "izinli") return "izinli";
  return "yok";
}

export const came = (s: CellStatus) => s === "geldi" || s === "gec";

/** Vakit (or ders) the student came to — on time or late. */
export const prayedCount = (r: AttendanceRow) => VAKITLER.filter((v) => came(cellStatus(r, v))).length;

const hasNote = (r: AttendanceRow, n: CellNote) =>
  r.durumlar ? Object.values(r.durumlar).includes(n) : r.durum === n;

/** katıldı = came to at least one cell; katılmadı = came to none and at least one unexcused cell; otherwise excused (neither). */
export function dayResult(r: AttendanceRow | undefined, cols: readonly string[] = VAKITLER): "katildi" | "katilmadi" | "mazeret" {
  const s = cols.map((c) => cellStatus(r, c));
  if (s.some(came)) return "katildi";
  return s.includes("yok") ? "katilmadi" : "mazeret";
}

export function computeStats(rows: AttendanceRow[]) {
  const vakit = Object.fromEntries(VAKITLER.map((v) => [v, rows.filter((r) => came(cellStatus(r, v))).length])) as Record<string, number>;
  return {
    toplam: rows.length,
    ders: rows.filter((r) => came(cellStatus(r, "Ders"))).length,
    gec: rows.filter((r) => hasNote(r, "gec")).length,
    izinli: rows.filter((r) => hasNote(r, "izinli")).length,
    hasta: rows.filter((r) => hasNote(r, "hasta")).length,
    katilmadi: rows.filter((r) => dayResult(r, COLUMNS) === "katilmadi").length,
    namazGun: rows.filter((r) => prayedCount(r) > 0).length,
    vakit,
  };
}

const AYLAR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

export function monthly(rows: AttendanceRow[]) {
  const by: Record<string, AttendanceRow[]> = {};
  for (const r of rows) (by[r.date.slice(0, 7)] ??= []).push(r);
  return Object.keys(by)
    .sort()
    .slice(-6)
    .map((k) => {
      const list = by[k]!;
      const vakitSum = list.reduce((a, r) => a + prayedCount(r), 0);
      return {
        key: k,
        ay: AYLAR[Number(k.slice(5, 7)) - 1] ?? k,
        namaz: Math.round((vakitSum / (list.length * 5)) * 100),
        ders: Math.round((list.filter((r) => came(cellStatus(r, "Ders"))).length / list.length) * 100),
      };
    });
}
