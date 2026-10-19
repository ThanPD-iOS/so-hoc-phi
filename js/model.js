// Data and the rules for counting sessions and money (see Docs/flow.html, "Quy tắc tính" and "Dữ liệu").
// Everything here is pure: functions take the state and today's date, mutate the state they are given, and never touch the DOM.

import * as D from "./date.js";

export const APP_ID = "so-hoc-phi";
export const DATA_VERSION = 2;
export const LIMITS = { className: 30, studentName: 40, priceMin: 1000, priceMax: 10000000 };
export const LEGACY_CLASS_NAME = "Lớp của cô";

export function emptyState(today) {
  return {
    v: DATA_VERSION,
    settings: { slipTitle: "" },
    classes: [],
    students: [],
    sessions: [],
    cancelled: [],
    meta: { installedAt: today, generated: {}, lastBackup: null, snoozeUntil: null, seq: 0 },
  };
}

const newId = (state, prefix) => `${prefix}${++state.meta.seq}`;

/* ---------- Names, prices, validation ---------- */

export const cleanName = (s) => String(s ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
const nameKey = (s) => cleanName(s).toLocaleLowerCase("vi");
export const sameName = (a, b) => nameKey(a) === nameKey(b);

export const fmtMoney = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "đ";
export const fmtNumber = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
export const parsePrice = (s) => {
  const digits = String(s ?? "").replace(/\D/g, "");
  return digits ? Number(digits) : null;
};

// Each check returns null when valid, "" when empty (block the button, show nothing), or a message to show.
export function classNameError(name, otherNames) {
  const n = cleanName(name);
  if (!n) return "";
  if (n.length > LIMITS.className) return `Tên lớp tối đa ${LIMITS.className} ký tự`;
  const dup = otherNames.find((o) => sameName(o, n));
  if (dup) return `Đã có ${cleanName(dup)}. Đặt tên khác, ví dụ ${n} tối, hoặc đổi tên ${cleanName(dup)} trước.`;
  return null;
}
export function studentNameError(name, className, otherNames) {
  const n = cleanName(name);
  if (!n) return "";
  if (n.length > LIMITS.studentName) return `Tên tối đa ${LIMITS.studentName} ký tự`;
  if (otherNames.some((o) => sameName(o, n))) return `${className} đã có ${n}. Thêm chữ để phân biệt, ví dụ ${n} B.`;
  return null;
}
export function priceError(amount) {
  if (amount == null) return "";
  if (amount < LIMITS.priceMin || amount > LIMITS.priceMax) return "Nhập học phí từ 1.000đ đến 10.000.000đ";
  return null;
}
export const daysError = (days) => (days.length ? null : "Chọn ít nhất một ngày trong tuần");

/* ---------- Lookups ---------- */

export const classById = (state, id) => state.classes.find((c) => c.id === id);
export const studentById = (state, id) => state.students.find((s) => s.id === id);
export const studentsOf = (state, classId) => state.students.filter((s) => s.classId === classId);
export const sessionAt = (state, classId, date) => state.sessions.find((s) => s.classId === classId && s.date === date);
export const isCancelled = (state, classId, date) => state.cancelled.some((x) => x.classId === classId && x.date === date);

export const isScheduled = (cls, date) => cls.days.includes(D.weekday(date));
export const classActiveOn = (cls, date) => cls.startDate <= date && (!cls.stoppedFrom || date < cls.stoppedFrom);
export const isStopped = (cls, today) => !!cls.stoppedFrom && cls.stoppedFrom <= today;
export const enrolledOn = (stu, date) => stu.from <= date && (!stu.until || date < stu.until);
export const enrolledInMonth = (stu, ym) => stu.from <= D.monthEnd(ym) && (!stu.until || stu.until > D.monthStart(ym));

// Price list is kept sorted by date. Dates before the first entry use the first price.
export function priceOn(cls, date) {
  let amount = cls.prices[0].amount;
  for (const p of cls.prices) if (p.from <= date) amount = p.amount;
  return amount;
}
export const upcomingPrices = (cls, today) => cls.prices.filter((p) => p.from > today);

export const activeClasses = (state, today) => state.classes.filter((c) => !isStopped(c, today));

/* ---------- Session generation ---------- */

// Creates the sessions for every scheduled day each class has not been generated for yet, up to today.
// Returns how many were created.
export function generate(state, today) {
  let created = 0;
  for (const c of state.classes) {
    const last = state.meta.generated[c.id];
    let from = last ? D.addDays(last, 1) : c.startDate;
    if (from < c.startDate) from = c.startDate;
    let to = today;
    if (c.stoppedFrom && c.stoppedFrom <= to) to = D.addDays(c.stoppedFrom, -1);
    for (const d of D.eachDay(from, to)) {
      if (!isScheduled(c, d) || isCancelled(state, c.id, d) || sessionAt(state, c.id, d)) continue;
      state.sessions.push({ classId: c.id, date: d, price: priceOn(c, d), absent: [], extra: false });
      created++;
    }
    if (!last || last < today) state.meta.generated[c.id] = today;
  }
  return created;
}

// Scheduled days between from and today that would become sessions, used by the yellow line in setup.
export function countScheduled(days, from, today) {
  let n = 0;
  if (from > today) return 0;
  for (const d of D.eachDay(from, today)) if (days.includes(D.weekday(d))) n++;
  return n;
}

/* ---------- What happens on a given day ---------- */

// For one class on one date: "held" (a session on or before today), "planned" (in the future),
// "cancelled" (a scheduled day that was cancelled), or null (nothing).
export function dayStatus(state, cls, date, today) {
  if (!classActiveOn(cls, date)) return null;
  const s = sessionAt(state, cls.id, date);
  if (s) return date <= today ? "held" : "planned";
  if (!isScheduled(cls, date)) return null;
  if (isCancelled(state, cls.id, date)) return "cancelled";
  return date > today ? "planned" : null;
}

export function dayClasses(state, date, today) {
  return state.classes.map((cls) => ({ cls, status: dayStatus(state, cls, date, today) }));
}

// The absent list of a held or planned session (virtual planned sessions have nobody absent yet).
export const absentOn = (state, classId, date) => sessionAt(state, classId, date)?.absent ?? [];

export function nextPlanned(state, cls, today) {
  if (isStopped(cls, today)) return null;
  for (let i = 1; i <= 366; i++) {
    const d = D.addDays(today, i);
    if (cls.stoppedFrom && d >= cls.stoppedFrom) return null;
    if (dayStatus(state, cls, d, today) === "planned") return d;
  }
  return null;
}

/* ---------- Counting ---------- */

export function isCounted(state, stu, session, today) {
  const cls = classById(state, session.classId);
  return (
    session.classId === stu.classId &&
    session.date <= today &&
    classActiveOn(cls, session.date) &&
    enrolledOn(stu, session.date) &&
    !session.absent.includes(stu.id)
  );
}

const heldInMonth = (state, classId, ym, today) =>
  state.sessions
    .filter((s) => s.classId === classId && D.monthOf(s.date) === ym && s.date <= today && classActiveOn(classById(state, classId), s.date))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

export const heldCountInMonth = (state, classId, ym, today) => heldInMonth(state, classId, ym, today).length;

export function slip(state, studentId, ym, today) {
  const stu = studentById(state, studentId);
  const held = heldInMonth(state, stu.classId, ym, today).filter((s) => enrolledOn(stu, s.date));
  const rows = held.filter((s) => !s.absent.includes(stu.id)).map((s) => ({ date: s.date, price: s.price }));
  const absences = held.filter((s) => s.absent.includes(stu.id)).map((s) => s.date);
  const prices = [...new Set(rows.map((r) => r.price))];
  return {
    rows,
    absences,
    count: rows.length,
    total: rows.reduce((sum, r) => sum + r.price, 0),
    price: prices.length === 1 ? prices[0] : null,
    mixed: prices.length > 1,
    partial: D.monthOf(today) === ym,
  };
}

// Students who get a slip that month: in the class at least one day of the month, and the class running that month.
export function slipStudents(state, classId, ym) {
  const cls = classById(state, classId);
  if (cls.startDate > D.monthEnd(ym) || (cls.stoppedFrom && cls.stoppedFrom <= D.monthStart(ym))) return [];
  return studentsOf(state, classId).filter((s) => enrolledInMonth(s, ym));
}
export const slipClasses = (state, ym) => state.classes.filter((c) => slipStudents(state, c.id, ym).length);

/* ---------- Attendance changes ---------- */

// Toggles one student's absence on a held or planned day. Returns true when the student is now absent.
export function toggleAbsent(state, classId, date, studentId, today) {
  const cls = classById(state, classId);
  let s = sessionAt(state, classId, date);
  if (!s) {
    // Only planned days can be missing a session record: a pre-marked absence stores it.
    s = { classId, date, price: priceOn(cls, date), absent: [], extra: !isScheduled(cls, date) };
    state.sessions.push(s);
  }
  const i = s.absent.indexOf(studentId);
  if (i >= 0) s.absent.splice(i, 1);
  else s.absent.push(studentId);
  // Future scheduled sessions are only stored while somebody is pre-marked absent.
  if (date > today && !s.extra && !s.absent.length) removeSession(state, classId, date);
  return i < 0;
}

function removeSession(state, classId, date) {
  state.sessions = state.sessions.filter((s) => !(s.classId === classId && s.date === date));
}

export function cancelSession(state, classId, date) {
  const cls = classById(state, classId);
  removeSession(state, classId, date);
  if (isScheduled(cls, date) && !isCancelled(state, classId, date)) state.cancelled.push({ classId, date });
}

export function addSession(state, classId, date, today) {
  const cls = classById(state, classId);
  state.cancelled = state.cancelled.filter((x) => !(x.classId === classId && x.date === date));
  const scheduled = isScheduled(cls, date);
  if (date > today && scheduled) return; // a planned day again, nothing to store
  if (!sessionAt(state, classId, date)) {
    state.sessions.push({ classId, date, price: priceOn(cls, date), absent: [], extra: !scheduled });
  }
}

// Classes that can get an extra session on a date (C2, B3): running that day and with no session yet.
export function addableClasses(state, date, today) {
  return state.classes.filter((c) => {
    if (!classActiveOn(c, date)) return false;
    const st = dayStatus(state, c, date, today);
    return st === null || st === "cancelled";
  });
}

/* ---------- Classes ---------- */

export function addClass(state, { name, price, days, startDate, students }) {
  const cls = {
    id: newId(state, "l"),
    name: cleanName(name),
    startDate,
    prices: [{ from: startDate, amount: price }],
    days: [...days].sort(),
    stoppedFrom: null,
  };
  state.classes.push(cls);
  for (const n of students) addStudent(state, cls.id, n, startDate);
  return cls;
}

export function renameClass(state, classId, name) {
  classById(state, classId).name = cleanName(name);
}

function applyPrices(state, cls, from) {
  cls.prices.sort((a, b) => (a.from < b.from ? -1 : 1));
  for (const s of state.sessions) if (s.classId === cls.id && s.date >= from) s.price = priceOn(cls, s.date);
}

export function setPrice(state, classId, from, amount) {
  const cls = classById(state, classId);
  cls.prices = cls.prices.filter((p) => p.from !== from);
  cls.prices.push({ from, amount });
  applyPrices(state, cls, from);
}

export function removePrice(state, classId, from) {
  const cls = classById(state, classId);
  if (cls.prices.length < 2) return;
  cls.prices = cls.prices.filter((p) => p.from !== from);
  applyPrices(state, cls, from);
}

// Held sessions whose price a change would rewrite (shown before saving a price that starts in the past).
export function priceChangeEffect(state, classId, from, amount, today) {
  const copy = structuredClone(state);
  setPrice(copy, classId, from, amount);
  const before = new Map(state.sessions.filter((s) => s.classId === classId).map((s) => [s.date, s.price]));
  const changed = copy.sessions.filter((s) => s.classId === classId && s.date <= today && before.get(s.date) !== s.price);
  return { count: changed.length, first: changed.map((s) => s.date).sort()[0] ?? null };
}

// Future sessions a new schedule would drop. All of them hold a pre-marked absence or they would not be stored.
export function daysChangeEffect(state, classId, days, today) {
  return state.sessions
    .filter((s) => s.classId === classId && s.date > today && !s.extra && !days.includes(D.weekday(s.date)))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function setDays(state, classId, days, today) {
  const cls = classById(state, classId);
  const dropped = new Set(daysChangeEffect(state, classId, days, today).map((s) => s.date));
  cls.days = [...days].sort();
  state.sessions = state.sessions.filter((s) => !(s.classId === classId && dropped.has(s.date)));
  state.cancelled = state.cancelled.filter((x) => !(x.classId === classId && x.date > today && !days.includes(D.weekday(x.date))));
  // Today just added to the schedule: today's session starts now. Today removed: a held session stays.
  if (isScheduled(cls, today) && classActiveOn(cls, today) && !sessionAt(state, classId, today) && !isCancelled(state, classId, today)) {
    state.sessions.push({ classId, date: today, price: priceOn(cls, today), absent: [], extra: false });
  }
}

export function stopClass(state, classId, date) {
  classById(state, classId).stoppedFrom = date;
}
export function resumeClass(state, classId) {
  classById(state, classId).stoppedFrom = null;
}

export function deleteClass(state, classId) {
  const ids = new Set(studentsOf(state, classId).map((s) => s.id));
  state.classes = state.classes.filter((c) => c.id !== classId);
  state.students = state.students.filter((s) => !ids.has(s.id));
  state.sessions = state.sessions.filter((s) => s.classId !== classId);
  state.cancelled = state.cancelled.filter((x) => x.classId !== classId);
  delete state.meta.generated[classId];
}

/* ---------- Students ---------- */

export function addStudent(state, classId, name, from) {
  const stu = { id: newId(state, "hs"), classId, name: cleanName(name), from, until: null };
  state.students.push(stu);
  return stu;
}

export function updateStudent(state, studentId, { name, from, until }) {
  const stu = studentById(state, studentId);
  stu.name = cleanName(name);
  stu.from = from;
  stu.until = until || null;
}

export function deleteStudent(state, studentId) {
  state.students = state.students.filter((s) => s.id !== studentId);
  for (const s of state.sessions) s.absent = s.absent.filter((id) => id !== studentId);
}

export function currentStudents(state, today) {
  return state.students.filter((s) => {
    const cls = classById(state, s.classId);
    return !isStopped(cls, today) && (!s.until || s.until > today);
  });
}

/* ---------- Backup ---------- */

export function shouldRemindBackup(state, today) {
  const m = state.meta;
  if (m.snoozeUntil && today < m.snoozeUntil) return null;
  if (m.lastBackup) {
    const days = D.diffDays(m.lastBackup, today);
    return days >= 30 ? `Đã ${days} ngày chưa sao lưu dữ liệu.` : null;
  }
  return D.diffDays(m.installedAt, today) >= 14 ? "Chưa sao lưu dữ liệu lần nào." : null;
}

export const backupFileName = (today) => `${APP_ID}-${today}.json`;
export const backupText = (state, today) =>
  JSON.stringify({ app: APP_ID, v: DATA_VERSION, savedAt: today, data: state });

export const BAD_FILE = "File này không phải file sao lưu của Sổ học phí. Chọn file có tên bắt đầu bằng so-hoc-phi.";

// Reads a backup file's text. Returns { state, savedAt, summary } or { error }.
export function readBackup(text) {
  let file;
  try {
    file = JSON.parse(text);
  } catch {
    return { error: BAD_FILE };
  }
  if (!file || file.app !== APP_ID || typeof file.data !== "object" || !file.data) return { error: BAD_FILE };
  const savedAt = D.isISO(file.savedAt) ? file.savedAt : null;
  let state;
  try {
    state = Array.isArray(file.data.classes) ? normalize(file.data) : migrateV1(file.data);
  } catch {
    return { error: BAD_FILE };
  }
  if (savedAt) state.meta.lastBackup = savedAt;
  const until = savedAt ?? "9999-12-31";
  return {
    state,
    savedAt,
    summary: {
      classes: state.classes.length,
      students: state.students.length,
      sessions: state.sessions.filter((s) => s.date <= until).length,
    },
  };
}

const must = (ok) => {
  if (!ok) throw new Error("bad backup");
};
const isDays = (a) => Array.isArray(a) && a.length > 0 && a.every((d) => Number.isInteger(d) && d >= 0 && d <= 6);

function normalize(data) {
  const state = emptyState(D.isISO(data.meta?.installedAt) ? data.meta.installedAt : D.today());
  state.settings.slipTitle = typeof data.settings?.slipTitle === "string" ? data.settings.slipTitle : "";
  for (const c of data.classes) {
    must(typeof c.id === "string" && typeof c.name === "string" && D.isISO(c.startDate) && isDays(c.days));
    must(Array.isArray(c.prices) && c.prices.length && c.prices.every((p) => D.isISO(p.from) && Number.isFinite(p.amount)));
    state.classes.push({
      id: c.id, name: c.name, startDate: c.startDate, days: [...c.days].sort(),
      prices: c.prices.map((p) => ({ from: p.from, amount: p.amount })).sort((a, b) => (a.from < b.from ? -1 : 1)),
      stoppedFrom: D.isISO(c.stoppedFrom) ? c.stoppedFrom : null,
    });
  }
  const classIds = new Set(state.classes.map((c) => c.id));
  for (const s of data.students ?? []) {
    must(typeof s.id === "string" && classIds.has(s.classId) && typeof s.name === "string" && D.isISO(s.from));
    state.students.push({ id: s.id, classId: s.classId, name: s.name, from: s.from, until: D.isISO(s.until) ? s.until : null });
  }
  const stuIds = new Set(state.students.map((s) => s.id));
  for (const s of data.sessions ?? []) {
    must(classIds.has(s.classId) && D.isISO(s.date) && Number.isFinite(s.price));
    const absent = Array.isArray(s.absent) ? s.absent.filter((id) => stuIds.has(id)) : [];
    state.sessions.push({ classId: s.classId, date: s.date, price: s.price, absent, extra: !!s.extra });
  }
  for (const x of data.cancelled ?? []) if (classIds.has(x.classId) && D.isISO(x.date)) state.cancelled.push({ classId: x.classId, date: x.date });
  const m = data.meta ?? {};
  for (const [id, d] of Object.entries(m.generated ?? {})) if (classIds.has(id) && D.isISO(d)) state.meta.generated[id] = d;
  state.meta.lastBackup = D.isISO(m.lastBackup) ? m.lastBackup : null;
  state.meta.snoozeUntil = D.isISO(m.snoozeUntil) ? m.snoozeUntil : null;
  state.meta.seq = Math.max(Number(m.seq) || 0, ...[...classIds, ...stuIds].map((id) => Number(id.replace(/\D/g, "")) || 0));
  return state;
}

// Files from the single-class version: one price, one schedule, students and sessions without a class.
// They are put into one class named "Lớp của cô".
function migrateV1(data) {
  const set = data.settings ?? {};
  const students = data.students ?? [];
  const sessions = data.sessions ?? [];
  must(Array.isArray(students) && Array.isArray(sessions) && isDays(set.days) && Number.isFinite(set.price));
  const start = D.isISO(set.startDate) ? set.startDate : sessions.map((s) => s.date).filter(D.isISO).sort()[0] ?? D.today();
  const generated = D.isISO(data.meta?.generatedTo) ? { l1: data.meta.generatedTo } : {};
  return normalize({
    settings: { slipTitle: set.slipTitle ?? "" },
    classes: [{ id: "l1", name: LEGACY_CLASS_NAME, startDate: start, days: set.days, prices: [{ from: start, amount: set.price }], stoppedFrom: null }],
    students: students.map((s) => ({ ...s, id: String(s.id), classId: "l1", from: s.from ?? start })),
    sessions: sessions.map((s) => ({ ...s, classId: "l1", price: s.price ?? set.price, absent: (s.absent ?? []).map(String) })),
    cancelled: (data.cancelled ?? []).map((x) => ({ classId: "l1", date: typeof x === "string" ? x : x.date })),
    meta: { ...data.meta, generated },
  });
}
