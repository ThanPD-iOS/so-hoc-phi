// Dates are "YYYY-MM-DD" strings in the phone's local time, months are "YYYY-MM".
// String comparison orders them correctly, so the rest of the app compares them with < and >.

const pad = (n) => String(n).padStart(2, "0");

export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromISO = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const today = () => toISO(new Date());
export const isISO = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && toISO(fromISO(s)) === s;

export const addDays = (s, n) => {
  const d = fromISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
};
// Number of days from a to b (b - a).
export const diffDays = (a, b) => Math.round((fromISO(b) - fromISO(a)) / 86400000);
// 0 = Chủ nhật, 1 = Thứ 2 ... 6 = Thứ 7, same as Date#getDay.
export const weekday = (s) => fromISO(s).getDay();

export const monthOf = (s) => s.slice(0, 7);
export const monthStart = (ym) => `${ym}-01`;
export const monthEnd = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return toISO(new Date(y, m, 0));
};
export const addMonths = (ym, n) => {
  const [y, m] = ym.split("-").map(Number);
  return toISO(new Date(y, m - 1 + n, 1)).slice(0, 7);
};

export function* eachDay(from, to) {
  for (let d = from; d <= to; d = addDays(d, 1)) yield d;
}

// Display order on screens: T2 first, CN last.
export const WEEK = [1, 2, 3, 4, 5, 6, 0];
const SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const LONG = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
export const dayShort = (wd) => SHORT[wd];
export const dayLong = (wd) => LONG[wd];

export const fmtDM = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
export const fmtDMY = (s) => `${fmtDM(s)}/${s.slice(0, 4)}`;
export const fmtLong = (s) => `${dayLong(weekday(s))}, ${fmtDMY(s)}`;
export const fmtMonth = (ym) => `Tháng ${Number(ym.slice(5, 7))}/${ym.slice(0, 4)}`;
export const fmtDays = (days) => WEEK.filter((d) => days.includes(d)).map(dayShort).join(" · ");
