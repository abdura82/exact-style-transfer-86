import type { AttendanceRow, Student } from "./store";
import { VAKITLER, CELL_LETTER, CELL_LABEL, cellStatus, came, computeStats, dayResult } from "./stats";

export type Period = "gunluk" | "haftalik" | "aylik" | "yillik" | "tumu";

export const PERIODS: { key: Period; label: string }[] = [
  { key: "gunluk", label: "Günlük" },
  { key: "haftalik", label: "Haftalık" },
  { key: "aylik", label: "Aylık" },
  { key: "yillik", label: "Yıllık" },
  { key: "tumu", label: "Tümü" },
];

export type Range = { start: string; end: string };

export const PAPER_COLUMNS = [...VAKITLER, "Ders"];

/** Blank paper charts never derive absence marks from missing attendance. */
export function buildBlankChart(students: Pick<Student, "id" | "name">[], range: Range) {
  const days: string[] = [];
  const cursor = new Date(`${range.start}T00:00:00Z`);
  const end = new Date(`${range.end}T00:00:00Z`);
  if (!Number.isFinite(cursor.getTime()) || !Number.isFinite(end.getTime()) || cursor > end) throw new Error("Tarih aralığı geçersiz.");
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return {
    days,
    columns: PAPER_COLUMNS,
    rows: [...students].sort((a, b) => a.name.localeCompare(b.name, "tr")).map((s) => ({
      studentId: s.id, name: s.name, days: days.map(() => PAPER_COLUMNS.map(() => "")),
    })),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");
const toKey = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parse = (s: string) => new Date(`${s}T00:00:00Z`);

/** Date range (inclusive, YYYY-MM-DD) for a period around the reference day. Weeks run Monday–Sunday. */
export function periodRange(period: Period, ref: string, rows: AttendanceRow[] = []): Range {
  const d = parse(ref);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  switch (period) {
    case "gunluk":
      return { start: ref, end: ref };
    case "haftalik": {
      const offset = (d.getUTCDay() + 6) % 7; // Monday = 0
      const mon = new Date(Date.UTC(y, m, d.getUTCDate() - offset));
      const sun = new Date(Date.UTC(y, m, d.getUTCDate() - offset + 6));
      return { start: toKey(mon), end: toKey(sun) };
    }
    case "aylik":
      return { start: toKey(new Date(Date.UTC(y, m, 1))), end: toKey(new Date(Date.UTC(y, m + 1, 0))) };
    case "yillik":
      return { start: `${y}-01-01`, end: `${y}-12-31` };
    case "tumu": {
      if (!rows.length) return { start: ref, end: ref };
      const dates = rows.map((r) => r.date).sort();
      return { start: dates[0]!, end: dates[dates.length - 1]! };
    }
  }
}

export function filterRows(rows: AttendanceRow[], range: Range, studentId?: string) {
  return rows.filter((r) => r.date >= range.start && r.date <= range.end && (!studentId || r.studentId === studentId));
}



export type SummaryRow = {
  name: string;
  gun: number;
  kilinan: number;
  toplamVakit: number;
  namazYuzde: number;
  ders: number;
  dersYuzde: number;
  gec: number;
  izinli: number;
  hasta: number;
};

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export function buildReport(students: Student[], rows: AttendanceRow[]) {
  const nameOf = new Map(students.map((s) => [s.id, s.name]));
  const byStudent = new Map<string, AttendanceRow[]>();
  for (const r of rows) {
    if (!nameOf.has(r.studentId)) continue;
    (byStudent.get(r.studentId) ?? byStudent.set(r.studentId, []).get(r.studentId)!).push(r);
  }

  const summary: SummaryRow[] = students
    .filter((s) => byStudent.has(s.id))
    .map((s) => {
      const list = byStudent.get(s.id)!;
      const stats = computeStats(list);
      const kilinan = list.reduce((a, r) => a + VAKITLER.filter((v) => came(cellStatus(r, v))).length, 0);
      const ders = stats.ders;
      return {
        name: s.name,
        gun: list.length,
        kilinan,
        toplamVakit: list.length * VAKITLER.length,
        namazYuzde: pct(kilinan, list.length * VAKITLER.length),
        ders,
        dersYuzde: pct(ders, list.length),
        gec: stats.gec,
        izinli: stats.izinli,
        hasta: stats.hasta,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));

  const detail = rows
    .filter((r) => nameOf.has(r.studentId))
    .map((r) => ({
      date: r.date,
      name: nameOf.get(r.studentId)!,
      vakitler: VAKITLER.map((v) => CELL_LETTER[cellStatus(r, v)]),
      ders: CELL_LETTER[cellStatus(r, "Ders")],
      durum: [...new Set([...VAKITLER, "Ders"].map((v) => cellStatus(r, v)).filter((s) => s !== "geldi" && s !== "yok").map((s) => CELL_LABEL[s]))].join(", ") || (r.durum === "gec" ? "Geç" : "Normal"),
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "tr"));

  return { summary, detail };
}

export function formatDay(s: string) {
  return parse(s).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function rangeLabel(r: Range) {
  return r.start === r.end ? formatDay(r.start) : `${formatDay(r.start)} – ${formatDay(r.end)}`;
}

/** ASCII file-name slug for Turkish names ("Ahmet Yılmaz" -> "ahmet-yilmaz"). */
export function fileSlug(s: string) {
  const map: Record<string, string> = { ı: "i", ğ: "g", ü: "u", ş: "s", ö: "o", ç: "c" };
  return (
    s.toLocaleLowerCase("tr").replace(/[ığüşöç]/g, (c) => map[c] ?? c).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "talebe"
  );
}

export type ChartMark = (typeof CELL_LETTER)[keyof typeof CELL_LETTER];
export type ChartRow = { name: string; days: ChartMark[][]; katildi: number; katilmadi: number };

/**
 * Namaz takip çizelgesi: one row per student, one 5-vakit block per recorded day.
 * ✓ = geldi, G = geç, İ = izinli, H = hasta, X = gelmedi.
 * Katıldığı gün = at least one attended/late prayer; missed = none attended and at least one X.
 */
export function buildChart(students: Student[], rows: AttendanceRow[]) {
  const ids = new Set(students.map((s) => s.id));
  const days = [...new Set(rows.filter((r) => ids.has(r.studentId)).map((r) => r.date))].sort();
  const byKey = new Map(rows.map((r) => [`${r.studentId}|${r.date}`, r]));
  const list: ChartRow[] = [...students]
    .sort((a, b) => a.name.localeCompare(b.name, "tr"))
    .map((s) => {
      let katildi = 0, katilmadi = 0;
      const marks = days.map((d) => {
        const r = byKey.get(`${s.id}|${d}`);
        const result = dayResult(r);
        if (result === "katildi") katildi++;
        if (result === "katilmadi") katilmadi++;
        return VAKITLER.map((v) => CELL_LETTER[cellStatus(r, v)]);
      });
      return { name: s.name, days: marks, katildi, katilmadi };
    });
  return { days, rows: list };
}

const AY_ADLARI = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

/** Splits a chart into one chart per month; counts are recomputed for that month only. */
export function chartByMonth(chart: ReturnType<typeof buildChart>) {
  const keys = [...new Set(chart.days.map((d) => d.slice(0, 7)))];
  return keys.map((key) => {
    const idx = chart.days.flatMap((d, i) => (d.startsWith(key) ? [i] : []));
    return {
      key,
      label: `${AY_ADLARI[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`,
      days: idx.map((i) => chart.days[i]!),
      rows: chart.rows.map((r) => {
        const days = idx.map((i) => r.days[i]!);
        const katildi = days.filter((m) => m.includes("✓") || m.includes("G")).length;
        const katilmadi = days.filter((m) => !m.includes("✓") && !m.includes("G") && m.includes("X")).length;
        return { name: r.name, days, katildi, katilmadi };
      }),
    };
  });
}
