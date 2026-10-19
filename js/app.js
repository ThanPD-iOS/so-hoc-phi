// Screens and interaction. Every change goes: action -> model function -> commit() -> render().
// Screen ids in comments (A1, B1, ...) match Docs/flow.html.

import * as D from "./date.js";
import * as M from "./model.js";
import * as store from "./store.js";
import { monthXlsx, excelFileName, monthSheets } from "./export.js";

const APP_VERSION = "1.1";
const SAVE_FAIL = "Không lưu được. Điện thoại có thể đã đầy bộ nhớ, xoá bớt ảnh hoặc ứng dụng rồi thử lại.";
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const ORDINAL = ["nhất", "hai", "ba", "tư", "năm", "sáu", "bảy", "tám", "chín", "mười"];

const root = document.getElementById("app");
const toastEl = document.getElementById("toast");
const fileInput = document.getElementById("file");

let today = D.today();
let state = loadState();

const ui = {
  tab: "today",
  stack: [], // pages opened from Cài đặt
  cal: { month: D.monthOf(today), sel: today },
  slip: { month: null, classId: null, studentId: null },
  confirm: null, // id of the inline confirm that is open
  form: {},
  touched: new Set(),
  validate: null,
  setup: null, // the setup wizard (A) while it is open
  restore: null, // { result } while a chosen backup file is shown
};

function loadState() {
  const s = store.load();
  if (!s || s.v !== M.DATA_VERSION || !Array.isArray(s.classes)) return null;
  if (M.generate(s, today)) store.save(s);
  return s;
}

/* ---------- Helpers ---------- */

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const $ = (sel) => root.querySelector(sel);
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;

let toastTimer;
function toast(msg, ms = 2200) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), ms);
}

function commit(msg) {
  if (!store.save(state)) toast(SAVE_FAIL, 6000);
  else if (msg) toast(msg);
  render();
}

function setErr(name, msg) {
  const el = $(`[data-err="${name}"]`);
  if (el) {
    el.textContent = msg || "";
    el.hidden = !msg;
  }
  $(`[data-f="${name}"]`)?.closest(".in")?.classList.toggle("er", !!msg);
}
const setOk = (ok) => {
  const b = $("[data-primary]");
  if (b) b.disabled = !ok;
};
// Field errors for prices and dates show after the field is left, so typing "2" does not flash an error.
const shown = (name, msg) => (msg && (ui.touched.has(name) || ui.touched.has("*")) ? msg : "");

function input(f, value, { type = "text", money, max, min, placeholder = "", maxlength, focus } = {}) {
  const attrs = [
    `data-f="${f}"`,
    `value="${esc(value)}"`,
    type === "date" ? 'type="date"' : 'type="text" enterkeyhint="done" autocomplete="off"',
    money ? 'inputmode="numeric" data-money="1"' : "",
    max ? `max="${max}"` : "",
    min ? `min="${min}"` : "",
    placeholder ? `placeholder="${esc(placeholder)}"` : "",
    maxlength ? `maxlength="${maxlength}"` : "",
    focus ? "data-focus" : "",
  ].join(" ");
  return `<div class="in"><input ${attrs}>${money ? '<span class="u">đ</span>' : ""}</div>`;
}
// A <label> would forward taps on its text to the first button inside, so groups of buttons use a <div>.
const field = (label, control, f, hint = "", tag = "label") =>
  `<${tag} class="f"><span class="lbl">${label}</span>${control}<span class="err" data-err="${f}" hidden></span>${hint ? `<span class="hint">${hint}</span>` : ""}</${tag}>`;

const dayPicker = (days) =>
  `<div class="days">${D.WEEK.map((w) => `<button type="button" class="${days.includes(w) ? "on" : ""}" data-act="day" data-w="${w}" aria-pressed="${days.includes(w)}">${D.dayShort(w)}</button>`).join("")}</div>`;

const back = (label, act = "back") => `<button class="back" data-act="${act}">‹ ${esc(label)}</button>`;
const confirmBox = (text, yes, yesAct, data = "") =>
  `<div class="confirm"><span>${text}</span><div class="btns"><button class="btn r" data-act="${yesAct}" ${data}>${yes}</button><button class="btn q" data-act="unconfirm">Thôi</button></div></div>`;

const priceText = (cls) => {
  const up = M.upcomingPrices(cls, today);
  return `${M.fmtMoney(M.priceOn(cls, today))}/buổi${up.length ? ` · từ ${D.fmtDM(up[0].from)}: ${M.fmtMoney(up[0].amount)}` : ""}`;
};
const enrolledToday = (cls) => M.studentsOf(state, cls.id).filter((s) => !s.until || s.until > today).length;

/* ---------- Render ---------- */

const TABS = [
  ["today", "Hôm nay", '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16.2 9.6"/>'],
  ["calendar", "Lịch", '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'],
  ["slips", "Phiếu", '<path d="M6.5 3.5h8l4 4v13h-12z"/><path d="M9.5 11.5h6M9.5 15h6M9.5 18.5h3"/>'],
  ["settings", "Cài đặt", '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'],
];

function render() {
  const view = currentView();
  // Replacing a focused input fires focusout; the new view's checks must not run before its DOM exists.
  ui.validate = null;
  document.body.classList.toggle("notabs", !view.tabs);
  root.innerHTML =
    `<main class="main">${view.html}</main>` +
    (view.tabs
      ? `<nav class="tabbar">${TABS.map(([id, label, icon]) => `<button class="${ui.tab === id ? "on" : ""}" data-act="tab" data-tab="${id}"><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>${label}</button>`).join("")}</nav>`
      : "");
  ui.validate = view.validate ?? null;
  ui.validate?.();
  root.querySelector("[data-focus]")?.focus();
}

function currentView() {
  if (ui.restore) return restoreView();
  if (ui.setup) return setupView();
  if (ui.tab === "settings" && ui.stack.length) return pageView(ui.stack.at(-1));
  return { today: todayView, calendar: calendarView, slips: slipsView, settings: settingsView }[ui.tab]();
}

function navigate(fn) {
  ui.confirm = null;
  ui.touched = new Set();
  fn();
  render();
  window.scrollTo(0, 0);
}

/* ---------- A · Setup ---------- */

function newSetup(mode) {
  const needInstall = mode === "first" && isIOS() && !isStandalone() && store.flag("safari") !== "1";
  return {
    mode,
    step: needInstall ? "install" : "class",
    classes: [],
    cur: blankClass(),
    editIndex: null,
    startDate: mode === "first" ? D.monthStart(D.monthOf(today)) : today,
    tagInput: "",
  };
}
const blankClass = () => ({ name: "", price: "", days: [], students: [] });

// Setup inputs write straight into the draft: the class fields into cur, tagInput and startDate into the setup itself.
function setupForm() {
  const s = ui.setup;
  ui.form = s.step === "class" ? s.cur : s;
}

function setupView() {
  const s = ui.setup;
  setupForm();
  if (s.step === "install") return { html: installHtml(true) };
  if (s.step === "class") return setupClassView();
  if (s.step === "students") return setupStudentsView();
  if (s.step === "review") return setupReviewView();
  return setupStartView();
}

const steps = (n) => `<div class="steps">${[1, 2, 3].map((i) => `<i class="${i <= n ? "on" : ""}"></i>`).join("")}</div>`;

function installHtml(inSetup) {
  return `
    ${inSetup ? '<p class="eb">Sổ học phí</p>' : back("Cài đặt")}
    <h1>${inSetup ? "Thêm app ra màn hình chính nha" : "Cách cài lên màn hình chính"}</h1>
    ${!inSetup && isStandalone() ? '<p class="hint">Cô đang mở app từ màn hình chính rồi, không cần cài lại.</p>' : ""}
    <div class="card">
      <div class="li"><span class="num">1</span><span>Mở link app bằng <b>Safari</b>, bấm nút <b>Chia sẻ</b> <span class="share-ic">⇪</span> ở thanh dưới</span></div>
      <div class="li"><span class="num">2</span><span>Chọn <b>Thêm vào MH chính</b>, rồi bấm <b>Thêm</b></span></div>
      <div class="li"><span class="num">3</span><span>Đóng Safari, mở app từ biểu tượng <b>Sổ học phí</b></span></div>
    </div>
    <div class="warn">Dữ liệu nhập trong Safari không chuyển sang app được, nên cài trước rồi mới nhập.</div>
    ${inSetup ? '<div class="sp"></div><button class="btn q" data-act="useSafari">Vẫn dùng trong Safari</button>' : ""}`;
}

// A2 · one class (also the first step of "+ Thêm lớp")
function setupClassView() {
  const s = ui.setup;
  const c = s.cur;
  const index = s.editIndex ?? s.classes.length;
  const first = s.mode === "first" && index === 0;
  const eyebrow = s.mode === "first" ? `Bước 1/3 · Lớp thứ ${ORDINAL[index] ?? index + 1}` : "Thêm lớp · bước 1/3";
  const title = first ? "Chào cô giáo! Cô dạy lớp nào?" : s.editIndex != null ? `Sửa ${esc(c.name)}` : "Thêm một lớp";
  const backBtn =
    s.mode === "add"
      ? back("Lớp học", "setupCancel")
      : s.classes.length || s.editIndex != null
        ? back("Các lớp của cô", "setupToReview")
        : "";
  return {
    html: `
      ${backBtn}
      ${steps(1)}
      <p class="eb">${eyebrow}</p>
      <h1>${title}</h1>
      ${field("Tên lớp", input("name", c.name, { placeholder: "Ví dụ: Lớp 6", maxlength: 60, focus: !c.name }), "name")}
      ${field("Học phí một buổi", input("price", c.price, { money: true, placeholder: "250.000" }), "price", "Cả lớp cùng một giá. Lớp khác đặt giá riêng.")}
      ${field("Học vào thứ", dayPicker(c.days), "days", "", "div")}
      <div class="sp"></div>
      ${s.mode === "first" && s.editIndex != null && s.classes.length > 1 ? '<button class="btn rt" data-act="setupDropClass">Bỏ lớp này</button>' : ""}
      <button class="btn" data-primary data-act="setupClassNext">Tiếp</button>
      ${first && !s.classes.length ? '<p class="hint center">Đã có file sao lưu? <button class="link" data-act="pickFile">Khôi phục</button></p>' : ""}`,
    validate() {
      const others =
        s.mode === "first" ? s.classes.filter((_, i) => i !== s.editIndex).map((x) => x.name) : state.classes.map((x) => x.name);
      const nameErr = M.classNameError(c.name, others);
      const priceErr = M.priceError(M.parsePrice(c.price));
      setErr("name", nameErr);
      setErr("price", shown("price", priceErr));
      setOk(nameErr === null && priceErr === null && c.days.length > 0);
    },
  };
}

// A3 · students of the class
function setupStudentsView() {
  const s = ui.setup;
  const c = s.cur;
  return {
    html: `
      ${steps(2)}
      <p class="eb">${s.mode === "first" ? "Bước 2/3" : "Thêm lớp · bước 2/3"} · ${esc(c.name)}</p>
      <h1>Học sinh ${esc(c.name)}</h1>
      <form class="f" data-submit="addTag">
        <span class="lbl">Tên học sinh</span>
        <div class="btns"><div class="in grow"><input data-f="tagInput" type="text" enterkeyhint="done" autocomplete="off" maxlength="60" placeholder="Ví dụ: Minh An" value="${esc(s.tagInput)}" data-focus></div><button class="btn small" type="submit" data-tagbtn>Thêm</button></div>
        <span class="err" data-err="tagInput" hidden></span>
      </form>
      <div class="tags">${c.students.map((n, i) => `<button class="tag" data-act="untag" data-i="${i}" aria-label="Bỏ ${esc(n)}">${esc(n)}<span>×</span></button>`).join("")}</div>
      <p class="hint">${c.students.length ? `${c.students.length} học sinh · ` : ""}Gõ tên rồi bấm Thêm hoặc phím Xong trên bàn phím. Chạm × để bỏ.</p>
      <div class="sp"></div>
      <div class="btns"><button class="btn q" data-act="setupStudentsBack">Quay lại</button><button class="btn" data-primary data-act="setupStudentsNext">Tiếp</button></div>`,
    validate() {
      const err = M.studentNameError(s.tagInput, c.name, c.students);
      setErr("tagInput", err);
      const btn = $("[data-tagbtn]");
      if (btn) btn.disabled = err !== null;
      setOk(c.students.length > 0);
    },
  };
}

function backfillWarning(classes, from) {
  const counts = classes.map((c) => ({ name: c.name, n: M.countScheduled(c.days, from, today) }));
  const total = counts.reduce((a, x) => a + x.n, 0);
  if (!total || from > today) return "";
  const detail = counts.length > 1 ? ` (${counts.map((x) => `${esc(x.name)}: ${x.n}`).join(", ")})` : "";
  return `${total} buổi từ ${D.fmtDM(from)} đến hôm nay${detail} sẽ được tính là cả lớp có mặt. Em nào nghỉ thì sửa ở tab Lịch.`;
}

// A4 · review all classes, pick the date counting starts
function setupReviewView() {
  const s = ui.setup;
  return {
    html: `
      ${steps(3)}
      <p class="eb">Bước 3/3</p>
      <h1>Các lớp của cô</h1>
      <div class="list">${s.classes
        .map((c, i) => `<button data-act="setupEdit" data-i="${i}"><span>${esc(c.name)}</span><small>${D.fmtDays(c.days)} · ${M.fmtMoney(M.parsePrice(c.price))} · ${c.students.length} em</small></button>`)
        .join("")}</div>
      <button class="btn g" data-act="setupAddAnother">+ Thêm lớp</button>
      ${field("Tính tiền từ ngày", input("startDate", s.startDate, { type: "date", max: today }), "startDate")}
      <div class="warn" data-warn hidden></div>
      <div class="sp"></div>
      <div class="btns"><button class="btn q" data-act="setupReviewBack">Quay lại</button><button class="btn" data-primary data-act="setupFinish">Bắt đầu dùng</button></div>`,
    validate() {
      const ok = D.isISO(s.startDate) && s.startDate <= today;
      setErr("startDate", ok ? null : "Chọn một ngày không sau hôm nay");
      const w = $("[data-warn]");
      const text = ok ? backfillWarning(s.classes, s.startDate) : "";
      w.innerHTML = text;
      w.hidden = !text;
      setOk(ok);
    },
  };
}

// "+ Thêm lớp" from Cài đặt, last step: when counting starts for the new class
function setupStartView() {
  const s = ui.setup;
  const c = s.cur;
  return {
    html: `
      ${steps(3)}
      <p class="eb">Thêm lớp · bước 3/3 · ${esc(c.name)}</p>
      <h1>Tính tiền ${esc(c.name)} từ ngày nào?</h1>
      ${field("Tính tiền từ ngày", input("startDate", s.startDate, { type: "date", max: today }), "startDate", "Mặc định là hôm nay. Chọn ngày trước đó nếu lớp đã học từ trước, app sẽ tạo bù các buổi từ ngày đó.")}
      <div class="warn" data-warn hidden></div>
      <div class="sp"></div>
      <div class="btns"><button class="btn q" data-act="setupStudentsBackFromStart">Quay lại</button><button class="btn" data-primary data-act="setupAddFinish">Thêm lớp</button></div>`,
    validate() {
      const ok = D.isISO(s.startDate) && s.startDate <= today;
      setErr("startDate", ok ? null : "Chọn một ngày không sau hôm nay");
      const w = $("[data-warn]");
      const text = ok ? backfillWarning([{ ...c, name: c.name }], s.startDate) : "";
      w.innerHTML = text;
      w.hidden = !text;
      setOk(ok);
    },
  };
}

function finishSetup() {
  const s = ui.setup;
  state = M.emptyState(today);
  for (const c of s.classes) {
    M.addClass(state, { name: c.name, price: M.parsePrice(c.price), days: c.days, startDate: s.startDate, students: c.students });
  }
  const created = M.generate(state, today);
  ui.setup = null;
  ui.tab = "today";
  navigate(() => {});
  commit(
    created
      ? `Xong! Đã tạo ${created} buổi${s.classes.length > 1 ? ` của ${s.classes.length} lớp` : ""} từ ${D.fmtDM(s.startDate)} đến hôm nay`
      : "Xong! Bắt đầu điểm danh thôi",
  );
}

/* ---------- B · Hôm nay ---------- */

function addButtons(classes, date) {
  return `<div class="btns wrap">${classes.map((c) => `<button class="btn g" data-act="add" data-c="${c.id}" data-d="${date}">+ ${esc(c.name)}</button>`).join("")}</div>`;
}

// One class on one day: tap a name to mark absent. Used by Hôm nay and Lịch.
function attendCard(cls, date, status, withDate) {
  const students = M.studentsOf(state, cls.id).filter((s) => M.enrolledOn(s, date));
  const absent = M.absentOn(state, cls.id, date);
  const present = students.filter((s) => !absent.includes(s.id)).length;
  const planned = status === "planned";
  const title = withDate ? `${esc(cls.name)} · ${D.dayLong(D.weekday(date))}, ${D.fmtDM(date)}${planned ? " · dự kiến" : ""}` : esc(cls.name);
  const hint = planned
    ? "Đến ngày sẽ tự tính. Em nào báo nghỉ trước thì chạm vào tên."
    : date === today
      ? "Cả lớp mặc định có mặt. Em nào nghỉ có phép thì chạm vào tên."
      : "Chạm vào tên để đổi có mặt hoặc nghỉ có phép.";
  const key = `cancel:${cls.id}:${date}`;
  return `
    <div class="card">
      <div class="row"><h2>${title}</h2><span class="cnt">${present}/${students.length}${planned ? "" : " có mặt"}</span></div>
      <p class="hint">${students.length ? hint : "Chưa có học sinh nào trong lớp vào ngày này."}</p>
      ${students
        .map((s) => {
          const off = absent.includes(s.id);
          return `<button class="stu${off ? " off" : ""}" data-act="toggle" data-c="${cls.id}" data-d="${date}" data-s="${s.id}" aria-pressed="${off}"><span>${esc(s.name)}</span><span class="pill">${off ? "Nghỉ có phép" : "Có mặt"}</span></button>`;
        })
        .join("")}
      ${
        ui.confirm === key
          ? confirmBox(`Huỷ buổi ${esc(cls.name)} ngày ${D.fmtDM(date)}? Buổi này sẽ không tính tiền cho em nào trong lớp.`, "Huỷ buổi", "cancel", `data-c="${cls.id}" data-d="${date}"`)
          : `<button class="btn q" data-act="confirm" data-key="${key}">Huỷ buổi này</button>`
      }
    </div>`;
}

function todayView() {
  const out = [`<p class="eb">Hôm nay</p><h1>${D.fmtLong(today)}</h1>`];
  const remind = M.shouldRemindBackup(state, today);
  if (remind) {
    out.push(`<div class="warn"><span>${remind}</span><div class="btns"><button class="btn" data-act="backup">Sao lưu ngay</button><button class="btn q white" data-act="snooze">Để sau</button></div></div>`);
  }
  if (!state.classes.length) {
    out.push(`<div class="card"><h2>Chưa có lớp nào</h2><p class="hint">Thêm một lớp để bắt đầu điểm danh.</p><button class="btn" data-act="addClass">+ Thêm lớp</button></div>`);
    return { html: out.join(""), tabs: true };
  }
  const held = M.dayClasses(state, today, today).filter((x) => x.status === "held");
  for (const { cls } of held) out.push(attendCard(cls, today, "held", false));
  const addable = M.addableClasses(state, today, today);
  if (!held.length) {
    out.push(`<div class="card"><h2>Hôm nay không có lịch học</h2>${addable.length ? `<p class="hint">Dạy bù hoặc dạy thêm, ví dụ trước kỳ thi, thì chọn lớp:</p>${addButtons(addable, today)}` : ""}</div>`);
  } else if (addable.length) {
    out.push(`<div class="more"><p class="hint">Dạy thêm lớp khác hôm nay?</p>${addButtons(addable, today)}</div>`);
  }
  const upcoming = M.activeClasses(state, today)
    .filter((c) => !held.some((x) => x.cls.id === c.id))
    .map((c) => ({ c, d: M.nextPlanned(state, c, today) }))
    .filter((x) => x.d)
    .sort((a, b) => (a.d < b.d ? -1 : 1));
  if (upcoming.length) {
    out.push(`<div class="card"><p class="eb">Buổi tới</p>${upcoming
      .map(({ c, d }) => `<div class="row"><h2>${esc(c.name)} · ${D.dayLong(D.weekday(d))}, ${D.fmtDM(d)}</h2><span class="cnt">${M.studentsOf(state, c.id).filter((s) => M.enrolledOn(s, d)).length} em</span></div>`)
      .join("")}${held.length ? "" : '<p class="hint">Báo nghỉ trước ở tab Lịch</p>'}</div>`);
  }
  const ym = D.monthOf(today);
  const counts = state.classes
    .map((c) => ({ c, n: M.heldCountInMonth(state, c.id, ym, today) }))
    .filter(({ c, n }) => n || !M.isStopped(c, today))
    .map(({ c, n }) => `${esc(c.name)} đã học ${n} buổi`);
  if (counts.length) out.push(`<p class="hint foot">Tháng ${Number(ym.slice(5))}: ${counts.join(" · ")}</p>`);
  return { html: out.join(""), tabs: true };
}

/* ---------- C · Lịch ---------- */

const minMonth = () => (state.classes.length ? D.monthOf(state.classes.map((c) => c.startDate).sort()[0]) : D.monthOf(today));

function calendarView() {
  const { month, sel } = ui.cal;
  const first = D.monthStart(month);
  let cells = D.WEEK.map((w) => `<b>${D.dayShort(w)}</b>`).join("") + "<span></span>".repeat((D.weekday(first) + 6) % 7);
  for (const d of D.eachDay(first, D.monthEnd(month))) {
    const day = M.dayClasses(state, d, today);
    const held = day.some((x) => x.status === "held");
    const planned = day.some((x) => x.status === "planned");
    const absent = day.some((x) => (x.status === "held" || x.status === "planned") && M.absentOn(state, x.cls.id, d).length);
    const cls = [held ? "h" : planned ? "p" : "", d === today ? "t" : "", d === sel ? "s" : "", absent ? "a" : ""].join(" ").trim();
    cells += `<button class="${cls}" data-act="pick" data-d="${d}" aria-label="${D.fmtLong(d)}">${Number(d.slice(8))}</button>`;
  }
  const maxMonth = D.addMonths(D.monthOf(today), 6);
  const nav = `<div class="nav"><button data-act="calMonth" data-n="-1" ${month <= minMonth() ? "disabled" : ""} aria-label="Tháng trước">‹</button><h2>${D.fmtMonth(month)}</h2><button data-act="calMonth" data-n="1" ${month >= maxMonth ? "disabled" : ""} aria-label="Tháng sau">›</button></div>`;

  const day = M.dayClasses(state, sel, today);
  const shownCls = day.filter((x) => x.status === "held" || x.status === "planned");
  const cancelled = day.filter((x) => x.status === "cancelled");
  const addable = M.addableClasses(state, sel, today).filter((c) => !cancelled.some((x) => x.cls.id === c.id));
  const panel = [];
  for (const { cls, status } of shownCls) panel.push(attendCard(cls, sel, status, true));
  for (const { cls } of cancelled) {
    panel.push(`<div class="card"><div class="row"><h2>${esc(cls.name)} · ${D.dayLong(D.weekday(sel))}, ${D.fmtDM(sel)}</h2><span class="cnt">Đã huỷ</span></div><p class="hint">Buổi này không tính tiền.</p><button class="btn g" data-act="add" data-c="${cls.id}" data-d="${sel}">Thêm lại buổi này</button></div>`);
  }
  if (!shownCls.length && !cancelled.length) {
    panel.push(`<div class="card"><h2>${D.fmtLong(sel)}</h2><p class="hint">${addable.length ? "Ngày này không có buổi học. Thêm buổi cho lớp:" : "Ngày này không có buổi học."}</p>${addable.length ? addButtons(addable, sel) : ""}</div>`);
  } else if (addable.length) {
    panel.push(`<div class="more"><p class="hint">Thêm buổi cho lớp khác ngày ${D.fmtDM(sel)}:</p>${addButtons(addable, sel)}</div>`);
  }
  return {
    html: `
      <p class="eb">Lịch học</p>${nav}
      <div class="card"><div class="cal">${cells}</div>
        <div class="legend"><span><i class="h"></i>Đã học</span><span><i class="p"></i>Dự kiến</span><span><i class="a"></i>Có em nghỉ</span></div></div>
      ${panel.join("")}`,
    tabs: true,
  };
}

/* ---------- D · Phiếu ---------- */

function slipsView() {
  const sl = ui.slip;
  if (!sl.month) {
    // Days 1-7 open last month, the time fees are collected.
    sl.month = Number(today.slice(8)) <= 7 ? D.addMonths(D.monthOf(today), -1) : D.monthOf(today);
    if (sl.month < minMonth()) sl.month = minMonth();
  }
  const ym = sl.month;
  const nav = `<div class="nav"><button data-act="slipMonth" data-n="-1" ${ym <= minMonth() ? "disabled" : ""} aria-label="Tháng trước">‹</button><h2>${D.fmtMonth(ym)}</h2><button data-act="slipMonth" data-n="1" ${ym >= D.monthOf(today) ? "disabled" : ""} aria-label="Tháng sau">›</button></div>`;
  const classes = M.slipClasses(state, ym);
  if (!classes.length) {
    return { html: `${nav}<div class="card"><h2>Tháng này chưa có học sinh nào</h2><p class="hint">Chọn tháng khác bằng mũi tên ở trên.</p></div>`, tabs: true };
  }
  if (!classes.some((c) => c.id === sl.classId)) sl.classId = classes[0].id;
  const cls = M.classById(state, sl.classId);
  const students = M.slipStudents(state, cls.id, ym);
  if (!students.some((s) => s.id === sl.studentId)) sl.studentId = students[0].id;
  const stu = M.studentById(state, sl.studentId);
  const p = M.slip(state, stu.id, ym, today);
  const head = [state.settings.slipTitle, cls.name, D.fmtMonth(ym), p.partial ? `tính đến ${D.fmtDM(today)}` : ""].filter(Boolean).map(esc).join(" · ");
  const rows = p.rows
    .map((r, i) => `<tr><td>${i + 1}</td><td>${D.fmtDMY(r.date)}</td><td class="r">${D.dayLong(D.weekday(r.date))}</td>${p.mixed ? `<td class="r">${M.fmtMoney(r.price)}</td>` : ""}</tr>`)
    .join("");
  const chips = (items, act, selId) =>
    `<div class="chips">${items.map((x) => `<button class="${x.id === selId ? "on" : ""}" data-act="${act}" data-id="${x.id}">${esc(x.name)}</button>`).join("")}</div>`;
  return {
    html: `
      ${nav}
      ${classes.length > 1 ? chips(classes, "slipClass", cls.id) : ""}
      ${chips(students, "slipStudent", stu.id)}
      <div class="slip">
        <div class="se">${head}</div>
        <div class="sn">${esc(stu.name)}</div>
        <table><tr><th>STT</th><th>Ngày</th><th class="r">Thứ</th>${p.mixed ? '<th class="r">Học phí</th>' : ""}</tr>${rows || `<tr><td colspan="${p.mixed ? 4 : 3}" class="none">Không có buổi nào tính tiền</td></tr>`}</table>
        ${p.absences.length ? `<div class="off">Nghỉ có phép, không tính: ${p.absences.map(D.fmtDM).join(", ")}</div>` : ""}
        <div class="tot"><span>${p.count} buổi${p.price ? ` × ${M.fmtMoney(p.price)}` : ""}</span><b>${M.fmtMoney(p.total)}</b></div>
      </div>
      <p class="hint">Chụp màn hình phiếu này để gửi phụ huynh.</p>
      <button class="btn g" data-act="excel">Xuất Excel tháng ${Number(ym.slice(5))}</button>`,
    tabs: true,
  };
}

/* ---------- E · Cài đặt ---------- */

function settingsView() {
  const active = M.activeClasses(state, today);
  const last = state.meta.lastBackup;
  return {
    html: `
      <p class="eb">Cài đặt</p><h1>Cài đặt</h1>
      <div class="list">
        <button data-act="open" data-page="classes"><span>Lớp học</span><small>${active.length} lớp · ${M.currentStudents(state, today).length} em</small></button>
        <label class="row-in"><span>Tên trên phiếu</span><input data-change="slipTitle" type="text" enterkeyhint="done" maxlength="60" placeholder="Ví dụ: Lớp Toán cô Phượng" value="${esc(state.settings.slipTitle)}"></label>
      </div>
      <div class="list">
        <button data-act="open" data-page="backup"><span>Sao lưu dữ liệu</span><small>${last ? D.fmtDMY(last) : "Chưa sao lưu"}</small></button>
        <button data-act="pickFile"><span>Khôi phục từ file</span></button>
        <button data-act="open" data-page="install"><span>Cách cài lên màn hình chính</span></button>
      </div>
      <div class="list">
        <button data-act="open" data-page="guide"><span>Hướng dẫn sử dụng</span></button>
      </div>
      <div class="sp"></div>
      <p class="hint center">Dữ liệu chỉ nằm trên máy này · Phiên bản ${APP_VERSION}</p>`,
    tabs: true,
  };
}

function pageView(page) {
  const views = { classes: classesPage, class: classPage, rename: renamePage, addStudent: addStudentPage, student: studentPage, price: pricePage, days: daysPage, backup: backupPage, install: () => ({ html: installHtml(false) }), guide: guidePage };
  const v = views[page.type](page);
  return { ...v, tabs: true };
}

// E2 · classes
function classesPage() {
  const running = state.classes.filter((c) => !M.isStopped(c, today));
  const stopped = state.classes.filter((c) => M.isStopped(c, today));
  const row = (c) =>
    `<button data-act="open" data-page="class" data-id="${c.id}"><span>${esc(c.name)}</span><small>${
      M.isStopped(c, today)
        ? `ngừng từ ${D.fmtDMY(c.stoppedFrom)}`
        : `${D.fmtDays(c.days)} · ${M.fmtMoney(M.priceOn(c, today))} · ${enrolledToday(c)} em${c.stoppedFrom ? ` · ngừng từ ${D.fmtDM(c.stoppedFrom)}` : ""}`
    }</small></button>`;
  return {
    html: `
      ${back("Cài đặt")}<h1>Lớp học</h1>
      <button class="btn" data-act="addClass">+ Thêm lớp</button>
      ${running.length ? `<p class="sec">Đang dạy · ${running.length}</p><div class="list">${running.map(row).join("")}</div>` : ""}
      ${stopped.length ? `<p class="sec">Đã ngừng · ${stopped.length}</p><div class="list">${stopped.map(row).join("")}</div><p class="hint">Lớp đã ngừng vẫn có phiếu các tháng cũ.</p>` : ""}`,
  };
}

// E3 · one class
function classPage(page) {
  const cls = M.classById(state, page.id);
  const students = M.studentsOf(state, cls.id).sort((a, b) => Number(!!a.until && a.until <= today) - Number(!!b.until && b.until <= today));
  const current = students.filter((s) => !s.until || s.until > today).length;
  let stop;
  if (cls.stoppedFrom) {
    stop = `<p class="hint">${M.isStopped(cls, today) ? "Đã ngừng" : "Sẽ ngừng"} dạy từ ${D.fmtDMY(cls.stoppedFrom)}. Phiếu các tháng trước vẫn giữ.</p><button class="btn g" data-act="resumeClass">Dạy lại lớp này</button>`;
  } else if (ui.confirm === "stop") {
    stop = `<div class="confirm">${field("Ngừng dạy từ ngày", input("stopFrom", ui.form.stopFrom, { type: "date", min: cls.startDate }), "stopFrom")}<span>Từ ngày này không tạo buổi mới cho ${esc(cls.name)}. Phiếu các tháng trước vẫn giữ.</span><div class="btns"><button class="btn r" data-primary data-act="stopClass">Ngừng dạy</button><button class="btn q" data-act="unconfirm">Thôi</button></div></div>`;
  } else {
    stop = '<button class="btn rt" data-act="confirm" data-key="stop">Ngừng dạy lớp này</button>';
  }
  const del =
    ui.confirm === "deleteClass"
      ? confirmBox(`Xoá hẳn ${esc(cls.name)}, ${students.length} học sinh và mọi buổi điểm danh của lớp? Không lấy lại được.`, "Xoá hẳn", "deleteClass")
      : '<button class="btn rt" data-act="confirm" data-key="deleteClass">Xoá hẳn lớp</button>';
  return {
    html: `
      ${back("Lớp học")}<h1>${esc(cls.name)}</h1>
      <div class="list">
        <button data-act="open" data-page="rename" data-id="${cls.id}"><span>Tên lớp</span><small>${esc(cls.name)}</small></button>
        <button data-act="open" data-page="price" data-id="${cls.id}"><span>Học phí</span><small>${priceText(cls)}</small></button>
        <button data-act="open" data-page="days" data-id="${cls.id}"><span>Lịch học</span><small>${D.WEEK.filter((w) => cls.days.includes(w)).map(D.dayLong).join(", ")}</small></button>
      </div>
      <p class="sec">Học sinh · ${current}</p>
      ${students.length ? `<div class="list">${students
        .map((s) => {
          const left = s.until && s.until <= today;
          return `<button data-act="open" data-page="student" data-id="${s.id}" class="${left ? "dim" : ""}"><span>${esc(s.name)}</span><small>${left ? `nghỉ từ ${D.fmtDM(s.until)}` : `từ ${D.fmtDM(s.from)}${s.until ? ` · nghỉ từ ${D.fmtDM(s.until)}` : ""}`}</small></button>`;
        })
        .join("")}</div>` : ""}
      <button class="btn g" data-act="open" data-page="addStudent" data-id="${cls.id}">+ Thêm học sinh</button>
      <div class="sp"></div>
      ${stop}
      ${del}`,
    validate() {
      if (ui.confirm !== "stop") return;
      const ok = D.isISO(ui.form.stopFrom) && ui.form.stopFrom > cls.startDate;
      setErr("stopFrom", ok ? null : `Chọn ngày sau ngày bắt đầu tính (${D.fmtDMY(cls.startDate)})`);
      setOk(ok);
    },
  };
}

function renamePage(page) {
  const cls = M.classById(state, page.id);
  return {
    html: `
      ${back(cls.name)}<h1>Tên lớp</h1>
      ${field("Tên lớp", input("name", ui.form.name, { maxlength: 60, focus: true }), "name", "Phiếu và Excel các tháng cũ cũng sẽ hiện tên mới.")}
      <div class="sp"></div>
      <button class="btn" data-primary data-act="saveRename">Lưu</button>`,
    validate() {
      const err = M.classNameError(ui.form.name, state.classes.filter((c) => c.id !== cls.id).map((c) => c.name));
      setErr("name", err);
      setOk(err === null && M.cleanName(ui.form.name) !== cls.name);
    },
  };
}

// E4 · add a student
function addStudentPage(page) {
  const cls = M.classById(state, page.id);
  return {
    html: `
      ${back(cls.name)}<h1>Thêm học sinh vào ${esc(cls.name)}</h1>
      ${field("Tên", input("name", ui.form.name, { maxlength: 60, focus: true, placeholder: "Ví dụ: Phương Anh" }), "name")}
      ${field("Bắt đầu học từ", input("from", ui.form.from, { type: "date" }), "from", `Mặc định là hôm nay. Chọn ngày trước đó nếu em ấy đã học từ trước, các buổi của ${esc(cls.name)} từ ngày đó được tính có mặt.`)}
      <div class="sp"></div>
      <button class="btn" data-primary data-act="saveAddStudent">Thêm</button>`,
    validate() {
      const err = M.studentNameError(ui.form.name, cls.name, M.studentsOf(state, cls.id).map((s) => s.name));
      setErr("name", err);
      setOk(err === null && D.isISO(ui.form.from));
    },
  };
}

// E5 · edit, let go, delete a student
function studentPage(page) {
  const stu = M.studentById(state, page.id);
  const cls = M.classById(state, stu.classId);
  const f = ui.form;
  return {
    html: `
      ${back(cls.name)}<h1>${esc(stu.name)}</h1>
      ${field("Tên", input("name", f.name, { maxlength: 60 }), "name")}
      ${field("Bắt đầu học từ", input("from", f.from, { type: "date" }), "from")}
      ${field(
        "Nghỉ học từ ngày",
        input("until", f.until, { type: "date" }) + (f.until ? '<button class="link" data-act="clearUntil">Xoá ngày này (em ấy học lại)</button>' : ""),
        "until",
        "Từ ngày này em ấy không còn trong danh sách điểm danh. Phiếu các tháng trước vẫn giữ. Để trống nếu em vẫn đang học.",
        "div",
      )}
      <button class="btn" data-primary data-act="saveStudent">Lưu</button>
      <div class="sp"></div>
      <p class="hint">Chuyển lớp: cho em nghỉ ở lớp này từ ngày chuyển, rồi thêm em vào lớp mới từ ngày đó.</p>
      ${
        ui.confirm === "deleteStudent"
          ? confirmBox(`Xoá hẳn ${esc(stu.name)} và mọi buổi điểm danh của em ấy? Không lấy lại được.`, "Xoá hẳn", "deleteStudent")
          : '<button class="btn rt" data-act="confirm" data-key="deleteStudent">Xoá hẳn học sinh này</button>'
      }`,
    validate() {
      const nameErr = M.studentNameError(f.name, cls.name, M.studentsOf(state, cls.id).filter((s) => s.id !== stu.id).map((s) => s.name));
      const fromOk = D.isISO(f.from);
      const untilErr = f.until && fromOk && f.until <= f.from ? `Ngày nghỉ học phải sau ngày bắt đầu học (${D.fmtDMY(f.from)})` : null;
      setErr("name", nameErr);
      setErr("until", untilErr);
      setOk(nameErr === null && fromOk && !untilErr && (!f.until || D.isISO(f.until)));
    },
  };
}

// F1 · price
function pricePage(page) {
  const cls = M.classById(state, page.id);
  const f = ui.form;
  const up = M.upcomingPrices(cls, today);
  return {
    html: `
      ${back(cls.name)}<h1>Học phí ${esc(cls.name)}</h1>
      ${field("Học phí một buổi", input("price", f.price, { money: true, focus: true }), "price")}
      ${field("Áp dụng từ ngày", input("from", f.from, { type: "date" }), "from")}
      <p class="hint" data-keep></p>
      <div class="warn" data-warn hidden></div>
      ${up.length ? `<p class="sec">Sắp áp dụng</p><div class="list plain">${up.map((p) => `<div><span>${M.fmtMoney(p.amount)} từ ${D.fmtDMY(p.from)}</span><button class="link red" data-act="removePrice" data-from="${p.from}">Bỏ</button></div>`).join("")}</div>` : ""}
      <div class="sp"></div>
      <button class="btn" data-primary data-act="savePrice">Lưu học phí</button>`,
    validate() {
      const amount = M.parsePrice(f.price);
      const err = M.priceError(amount);
      setErr("price", shown("price", err));
      const dateOk = D.isISO(f.from);
      const keep = $("[data-keep]");
      const warn = $("[data-warn]");
      keep.textContent = "";
      warn.hidden = true;
      if (dateOk) {
        const before = M.priceOn(cls, D.addDays(f.from, -1));
        const others = state.classes.length > 1 ? " Lớp khác không đổi." : "";
        keep.textContent = `Các buổi ${cls.name} trước ${D.fmtDM(f.from)} giữ giá ${M.fmtMoney(before)}.${others}`;
        if (err === null) {
          const eff = M.priceChangeEffect(state, cls.id, f.from, amount, today);
          if (eff.count) {
            warn.textContent = `Sẽ đổi giá ${eff.count} buổi ${cls.name} đã học từ ${D.fmtDM(eff.first)} sang ${M.fmtMoney(amount)}.`;
            warn.hidden = false;
          }
        }
      }
      setOk(err === null && dateOk);
    },
  };
}

// F2 · schedule
function daysPage(page) {
  const cls = M.classById(state, page.id);
  const f = ui.form;
  const dropped = ui.confirm === "days" ? M.daysChangeEffect(state, cls.id, f.days, today) : [];
  const name = (id) => M.studentById(state, id)?.name ?? "";
  return {
    html: `
      ${back(cls.name)}<h1>Lịch học ${esc(cls.name)}</h1>
      ${dayPicker(f.days)}
      <p class="hint">Áp dụng từ hôm nay. Buổi đã học không đổi. Hai lớp trùng ngày cũng được.</p>
      <span class="err" data-err="days" hidden></span>
      <div class="sp"></div>
      ${
        dropped.length
          ? `<div class="warn"><span>${dropped.map((s) => `Bỏ buổi ${esc(cls.name)} ngày ${D.fmtDM(s.date)} (${s.absent.map((id) => esc(name(id))).join(", ")} đã báo nghỉ)?`).join("<br>")}</span><div class="btns"><button class="btn" data-act="saveDays" data-force="1">Bỏ và lưu lịch</button><button class="btn q white" data-act="unconfirm">Thôi</button></div></div>`
          : '<button class="btn" data-primary data-act="saveDays">Lưu lịch</button>'
      }`,
    validate() {
      const same = f.days.length === cls.days.length && f.days.every((d) => cls.days.includes(d));
      setErr("days", f.days.length ? null : "Chọn ít nhất một ngày trong tuần");
      setOk(f.days.length > 0 && !same);
    },
  };
}

// Hướng dẫn sử dụng: the same content as the user guide doc, one tap-to-open section per topic.
const GUIDE = [
  ["Điểm danh mỗi buổi (tab Hôm nay)", `
    <p>Cả lớp mặc định có mặt, chỉ cần chạm vào em nghỉ. Không có nút Lưu: chạm là lưu ngay.</p>
    <ol><li>Mở app, tab Hôm nay hiện sẵn thẻ của lớp có lịch học hôm nay. Hai lớp cùng ngày thì có hai thẻ.</li>
    <li>Chạm vào tên em nghỉ có phép. Tên bị gạch, buổi này không tính tiền em đó.</li>
    <li>Chạm nhầm thì chạm lại lần nữa để bỏ.</li></ol>
    <p><b>Huỷ buổi</b> (nghỉ lễ, cô bận): bấm Huỷ buổi này ở cuối thẻ rồi xác nhận. <b>Dạy thêm hôm nay</b>: bấm nút + tên lớp.</p>
    <p>Quên mở app vài hôm cũng không sao: các buổi đúng lịch vẫn tự được tạo, cả lớp có mặt.</p>`],
  ["Sửa ngày khác (tab Lịch)", `
    <p>Chạm một ngày trên lịch, thẻ điểm danh hiện bên dưới, dùng giống tab Hôm nay. Sửa được cả các tháng trước.</p>
    <p>Ô tím: đã học. Ô viền đứt: sắp học. Chấm đỏ: có em nghỉ.</p>
    <ul><li><b>Báo nghỉ trước:</b> chạm ngày sắp tới, chạm tên em.</li>
    <li><b>Dạy bù ngoài lịch:</b> chạm ngày đó, bấm + tên lớp.</li>
    <li><b>Nghỉ lễ, Tết:</b> chạm ngày đó, bấm Huỷ buổi này. Huỷ nhầm thì bấm Thêm lại buổi này.</li></ul>`],
  ["Cuối tháng: gửi phiếu (tab Phiếu)", `
    <ol><li>Mở tab Phiếu. Từ ngày 1 đến ngày 7 app tự mở tháng trước.</li>
    <li>Chạm tên lớp, rồi chạm tên em.</li>
    <li>Chụp màn hình (nút nguồn + tăng âm lượng), cắt lấy phần phiếu, gửi Zalo cho phụ huynh.</li></ol>
    <p>Bấm <b>Xuất Excel</b> để lưu cả tháng vào Tệp hoặc gửi Zalo cho chính mình. Dòng đầu phiếu sửa ở Cài đặt → Tên trên phiếu.</p>`],
  ["Lớp và học sinh", `
    <p>Vào Cài đặt → Lớp học → chạm tên lớp. Mọi thay đổi tính theo ngày nên tiền các tháng cũ không đổi.</p>
    <ul><li><b>Em mới:</b> + Thêm học sinh, chọn ngày bắt đầu học.</li>
    <li><b>Em nghỉ hẳn:</b> chạm tên em, chọn Nghỉ học từ ngày. Học lại thì xoá ngày này.</li>
    <li><b>Chuyển lớp:</b> cho em nghỉ ở lớp cũ từ ngày chuyển, rồi thêm em vào lớp mới từ ngày đó.</li>
    <li><b>Mở thêm lớp:</b> Lớp học → + Thêm lớp, rồi chọn ngày bắt đầu tính tiền.</li>
    <li><b>Thôi dạy:</b> Ngừng dạy lớp này, phiếu cũ vẫn còn.</li>
    <li><b>Năm học mới:</b> đổi tên từ lớp cao nhất trước (Lớp 7 thành Lớp 8, rồi Lớp 6 thành Lớp 7).</li></ul>
    <p>Xoá hẳn chỉ dùng khi nhập nhầm, không lấy lại được.</p>`],
  ["Đổi học phí, lịch học", `
    <p><b>Học phí:</b> trang lớp → Học phí, gõ giá mới, chọn Áp dụng từ ngày. Tăng giá từ tháng sau thì chọn ngày 01 tháng sau, các buổi trước vẫn giữ giá cũ.</p>
    <p><b>Lịch học:</b> trang lớp → Lịch học, chạm lại các thứ. Áp dụng từ hôm nay, buổi đã học không đổi.</p>`],
  ["Sao lưu, đổi điện thoại", `
    <p>Xoá app hoặc đổi máy là mất dữ liệu, nên cần file sao lưu. App nhắc khi đã 30 ngày chưa sao lưu.</p>
    <ol><li><b>Sao lưu:</b> Cài đặt → Sao lưu dữ liệu → Tạo file sao lưu, chọn Lưu vào Tệp hoặc gửi Zalo cho chính mình.</li>
    <li><b>Máy mới:</b> cài app, bấm Khôi phục ở màn thiết lập, chọn file sao lưu.</li></ol>`],
  ["Câu hỏi thường gặp", `
    <ul><li><b>Lỡ xoá app?</b> Cài lại rồi khôi phục từ file sao lưu gần nhất.</li>
    <li><b>Báo "Không lưu được"?</b> Điện thoại đầy bộ nhớ, xoá bớt ảnh hoặc ứng dụng.</li>
    <li><b>Thấy giao diện cũ?</b> Đóng hẳn app rồi mở lại.</li>
    <li><b>Dữ liệu có lên mạng không?</b> Không, chỉ nằm trên iPhone này và file sao lưu cô tự lưu.</li></ul>`],
];

function guidePage() {
  return {
    html: `
      ${back("Cài đặt")}<h1>Hướng dẫn sử dụng</h1>
      <p class="hint">Chạm vào một mục để xem.</p>
      ${GUIDE.map(([title, body]) => `<details class="guide"><summary>${title}</summary><div>${body}</div></details>`).join("")}`,
  };
}

// G1 · backup
function backupPage() {
  const last = state.meta.lastBackup;
  const ago = last ? D.diffDays(last, today) : null;
  return {
    html: `
      ${back("Cài đặt")}<h1>Sao lưu</h1>
      <div class="card"><span class="hint">Lần gần nhất</span><h2>${last ? `${D.fmtDMY(last)} · ${ago ? `${ago} ngày trước` : "hôm nay"}` : "Chưa sao lưu lần nào"}</h2></div>
      <button class="btn" data-act="backup">Tạo file sao lưu</button>
      <p class="hint">Tạo file <b>${M.backupFileName(today)}</b>, rồi lưu vào Tệp hoặc gửi Zalo cho chính mình. Khi đổi máy, mở file này để lấy lại dữ liệu.</p>
      <div class="sp"></div>
      <button class="btn g" data-act="pickFile">Khôi phục từ file sao lưu</button>`,
  };
}

// G2 · restore
function restoreView() {
  const { result } = ui.restore;
  if (result.error) {
    return {
      html: `${back("Quay lại", "closeRestore")}<h1>Khôi phục</h1><p class="err">${result.error}</p><button class="btn g" data-act="pickFile">Chọn file khác</button>`,
      tabs: !!state && !ui.setup,
    };
  }
  const s = result.summary;
  return {
    html: `
      ${back("Quay lại", "closeRestore")}<h1>Khôi phục</h1>
      <div class="card"><span class="hint">File đã chọn</span><h2>${result.savedAt ? `Sao lưu ngày ${D.fmtDMY(result.savedAt)}` : "File sao lưu"}</h2><span class="hint">${s.classes} lớp · ${s.students} học sinh · ${s.sessions} buổi học</span></div>
      ${
        state
          ? `<div class="confirm"><span>Toàn bộ dữ liệu đang có trên máy sẽ được thay bằng dữ liệu trong file này.</span><div class="btns"><button class="btn r" data-act="doRestore">Khôi phục</button><button class="btn q" data-act="closeRestore">Thôi</button></div></div>`
          : '<button class="btn" data-act="doRestore">Khôi phục</button>'
      }`,
    tabs: !!state && !ui.setup,
  };
}

/* ---------- Sharing files ---------- */

// Opens the iPhone share sheet with a file. Falls back to a download where sharing files is not supported.
async function shareFile(bytes, name, type) {
  const blob = new Blob([bytes], { type });
  const file = new File([blob], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (e) {
      if (e.name === "AbortError") return "cancelled";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return "downloaded";
}

function backupNow() {
  // Built synchronously so the share sheet still counts as a response to the tap.
  const text = M.backupText(state, today);
  shareFile(new TextEncoder().encode(text), M.backupFileName(today), "application/json")
    .then((r) => {
      if (r === "cancelled") return;
      state.meta.lastBackup = today;
      state.meta.snoozeUntil = null;
      commit("Đã sao lưu. Nhớ để file ở nơi không bị xoá.");
    })
    .catch(() => toast("Không tạo được file sao lưu. Thử lại."));
}

/* ---------- Actions ---------- */

const page = () => ui.stack.at(-1);
const pageClass = () => M.classById(state, page().id);

function formFor(p) {
  if (!p) return {};
  const cls = p.type === "student" ? null : M.classById(state, p.id);
  const stu = p.type === "student" ? M.studentById(state, p.id) : null;
  switch (p.type) {
    case "class": return { stopFrom: today };
    case "rename": return { name: cls.name };
    case "addStudent": return { name: "", from: today };
    case "student": return { name: stu.name, from: stu.from, until: stu.until ?? "" };
    case "price": return { price: M.fmtNumber(M.priceOn(cls, today)), from: today };
    case "days": return { days: [...cls.days] };
    default: return {};
  }
}
function openPage(p) {
  navigate(() => {
    ui.stack.push(p);
    ui.form = formFor(p);
  });
}
const popPage = (msg) => {
  navigate(() => {
    ui.stack.pop();
    ui.form = formFor(ui.stack.at(-1));
  });
  if (msg) toast(msg);
};

const actions = {
  tab({ tab }) {
    navigate(() => {
      if (tab === "calendar" && ui.tab !== "calendar") ui.cal = { month: D.monthOf(today), sel: today };
      if (tab === "settings") ui.stack = [];
      ui.restore = null;
      ui.tab = tab;
    });
  },
  back: () => popPage(),
  open: ({ page: type, id }) => openPage({ type, id }),
  confirm({ key }) {
    ui.confirm = key;
    render();
  },
  unconfirm() {
    ui.confirm = null;
    render();
  },

  // A · setup
  useSafari() {
    store.flag("safari", "1");
    navigate(() => (ui.setup.step = "class"));
  },
  setupClassNext() {
    navigate(() => (ui.setup.step = "students"));
  },
  setupToReview() {
    navigate(() => {
      ui.setup.cur = blankClass();
      ui.setup.editIndex = null;
      ui.setup.step = "review";
    });
  },
  setupCancel() {
    navigate(() => (ui.setup = null));
  },
  setupDropClass() {
    navigate(() => {
      ui.setup.classes.splice(ui.setup.editIndex, 1);
      ui.setup.editIndex = null;
      ui.setup.cur = blankClass();
      ui.setup.step = "review";
    });
  },
  addTag() {
    const s = ui.setup;
    const err = M.studentNameError(s.tagInput, s.cur.name, s.cur.students);
    if (err !== null) return;
    s.cur.students.push(M.cleanName(s.tagInput));
    s.tagInput = "";
    render();
  },
  untag({ i }) {
    ui.setup.cur.students.splice(Number(i), 1);
    render();
  },
  setupStudentsBack() {
    navigate(() => (ui.setup.step = "class"));
  },
  setupStudentsBackFromStart() {
    navigate(() => (ui.setup.step = "students"));
  },
  setupStudentsNext() {
    const s = ui.setup;
    // A name typed but not added yet still counts.
    if (M.cleanName(s.tagInput) && M.studentNameError(s.tagInput, s.cur.name, s.cur.students) === null) {
      s.cur.students.push(M.cleanName(s.tagInput));
    }
    s.tagInput = "";
    s.cur.name = M.cleanName(s.cur.name);
    navigate(() => {
      if (s.mode === "add") {
        s.step = "start";
        return;
      }
      if (s.editIndex != null) s.classes[s.editIndex] = s.cur;
      else s.classes.push(s.cur);
      s.cur = blankClass();
      s.editIndex = null;
      s.step = "review";
    });
  },
  setupEdit({ i }) {
    navigate(() => {
      const s = ui.setup;
      s.editIndex = Number(i);
      s.cur = structuredClone(s.classes[s.editIndex]);
      s.step = "class";
    });
  },
  setupAddAnother() {
    navigate(() => {
      ui.setup.cur = blankClass();
      ui.setup.editIndex = null;
      ui.setup.step = "class";
    });
  },
  setupReviewBack() {
    navigate(() => {
      const s = ui.setup;
      s.editIndex = s.classes.length - 1;
      s.cur = structuredClone(s.classes[s.editIndex]);
      s.step = "students";
    });
  },
  setupFinish: () => finishSetup(),
  setupAddFinish() {
    const c = ui.setup.cur;
    const cls = M.addClass(state, { name: c.name, price: M.parsePrice(c.price), days: c.days, startDate: ui.setup.startDate, students: c.students });
    M.generate(state, today);
    navigate(() => (ui.setup = null));
    commit(`Đã thêm ${cls.name}`);
  },
  addClass() {
    navigate(() => {
      ui.tab = "settings";
      if (!ui.stack.length) ui.stack = [{ type: "classes" }];
      ui.setup = newSetup("add");
    });
  },

  // B, C · attendance
  toggle({ c, d, s }) {
    const absent = M.toggleAbsent(state, c, d, s, today);
    const name = M.studentById(state, s).name;
    commit(absent ? `${name} nghỉ có phép · chạm lại để bỏ` : `${name} có mặt`);
  },
  cancel({ c, d }) {
    M.cancelSession(state, c, d);
    ui.confirm = null;
    commit(`Đã huỷ buổi ${M.classById(state, c).name} ngày ${D.fmtDM(d)}`);
  },
  add({ c, d }) {
    M.addSession(state, c, d, today);
    commit(`Đã thêm buổi ${M.classById(state, c).name} ngày ${D.fmtDM(d)}`);
  },
  pick({ d }) {
    ui.cal.sel = d;
    ui.confirm = null;
    render();
  },
  calMonth({ n }) {
    ui.cal.month = D.addMonths(ui.cal.month, Number(n));
    ui.cal.sel = D.monthOf(today) === ui.cal.month ? today : D.monthStart(ui.cal.month);
    ui.confirm = null;
    render();
  },

  // D · slips
  slipMonth({ n }) {
    ui.slip.month = D.addMonths(ui.slip.month, Number(n));
    render();
  },
  slipClass({ id }) {
    ui.slip.classId = id;
    ui.slip.studentId = null;
    render();
  },
  slipStudent({ id }) {
    ui.slip.studentId = id;
    render();
  },
  excel() {
    const ym = ui.slip.month;
    const bytes = monthXlsx(state, ym, today);
    shareFile(bytes, excelFileName(ym), XLSX_TYPE)
      .then((r) => r === "downloaded" && toast(`Đã tải file ${excelFileName(ym)}`))
      .catch(() => toast("Không tạo được file Excel. Thử lại."));
  },

  // E · classes and students
  saveRename() {
    M.renameClass(state, page().id, ui.form.name);
    store.save(state);
    popPage(`Đã đổi tên lớp thành ${pageClass().name}`);
  },
  stopClass() {
    const cls = pageClass();
    M.stopClass(state, cls.id, ui.form.stopFrom);
    ui.confirm = null;
    commit(`${cls.name} ngừng từ ${D.fmtDMY(ui.form.stopFrom)}. Phiếu cũ vẫn giữ.`);
  },
  resumeClass() {
    const cls = pageClass();
    M.resumeClass(state, cls.id);
    M.generate(state, today);
    commit(`${cls.name} dạy lại từ hôm nay`);
  },
  deleteClass() {
    const cls = pageClass();
    M.deleteClass(state, cls.id);
    store.save(state);
    popPage(`Đã xoá ${cls.name}`);
  },
  saveAddStudent() {
    const cls = pageClass();
    const stu = M.addStudent(state, cls.id, ui.form.name, ui.form.from);
    store.save(state);
    popPage(`Đã thêm ${stu.name} vào ${cls.name}`);
  },
  clearUntil() {
    ui.form.until = "";
    render();
  },
  saveStudent() {
    M.updateStudent(state, page().id, ui.form);
    store.save(state);
    popPage(`Đã lưu ${M.cleanName(ui.form.name)}`);
  },
  deleteStudent() {
    const stu = M.studentById(state, page().id);
    M.deleteStudent(state, stu.id);
    store.save(state);
    popPage(`Đã xoá ${stu.name}`);
  },

  // F · price and schedule
  savePrice() {
    const cls = pageClass();
    const amount = M.parsePrice(ui.form.price);
    M.setPrice(state, cls.id, ui.form.from, amount);
    store.save(state);
    popPage(`${cls.name} từ ${D.fmtDMY(ui.form.from)}: ${M.fmtMoney(amount)} một buổi`);
  },
  removePrice({ from }) {
    const cls = pageClass();
    M.removePrice(state, cls.id, from);
    commit(`Đã bỏ mức giá từ ${D.fmtDMY(from)}`);
  },
  saveDays({ force }) {
    const cls = pageClass();
    const days = ui.form.days;
    if (!force && M.daysChangeEffect(state, cls.id, days, today).length) {
      ui.confirm = "days";
      render();
      return;
    }
    M.setDays(state, cls.id, days, today);
    store.save(state);
    popPage(`Lịch mới ${cls.name}: ${D.fmtDays(days)}`);
  },
  day({ w }, el) {
    const days = ui.form.days;
    const wd = Number(w);
    const i = days.indexOf(wd);
    if (i >= 0) days.splice(i, 1);
    else days.push(wd);
    el.classList.toggle("on", i < 0);
    el.setAttribute("aria-pressed", String(i < 0));
    if (ui.confirm === "days") {
      ui.confirm = null;
      render();
    } else ui.validate?.();
  },

  // G · backup and restore
  backup: () => backupNow(),
  snooze() {
    state.meta.snoozeUntil = D.addDays(today, 7);
    commit();
  },
  pickFile() {
    fileInput.value = "";
    fileInput.click();
  },
  closeRestore() {
    navigate(() => (ui.restore = null));
  },
  doRestore() {
    const { result } = ui.restore;
    state = result.state;
    M.generate(state, today);
    const s = result.summary;
    navigate(() => {
      ui.restore = null;
      ui.setup = null;
      ui.stack = [];
      ui.tab = "today";
      ui.slip = { month: null, classId: null, studentId: null };
    });
    commit(`Đã khôi phục ${s.classes} lớp, ${s.students} học sinh, ${s.sessions} buổi học`);
  },
};

/* ---------- Events ---------- */

root.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled) return;
  if (el.form && el.type === "submit") return; // handled by the form's submit
  e.preventDefault();
  actions[el.dataset.act]?.({ ...el.dataset }, el);
});

root.addEventListener("submit", (e) => {
  e.preventDefault();
  actions[e.target.dataset.submit]?.({ ...e.target.dataset }, e.target);
});

root.addEventListener("input", (e) => {
  const el = e.target;
  const f = el.dataset.f;
  if (!f) return;
  if (el.dataset.money) {
    const n = M.parsePrice(el.value);
    el.value = n == null ? "" : M.fmtNumber(n);
  }
  ui.form[f] = el.value;
  ui.validate?.();
});

root.addEventListener("focusout", (e) => {
  const f = e.target.dataset?.f;
  if (!f) return;
  ui.touched.add(f);
  ui.validate?.();
});

root.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.tagName === "INPUT" && !e.target.form) e.target.blur();
});

root.addEventListener("change", (e) => {
  if (e.target.dataset.change === "slipTitle") {
    state.settings.slipTitle = M.cleanName(e.target.value).slice(0, 60);
    commit("Đã lưu tên trên phiếu");
  }
});

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  let text = "";
  try {
    text = await file.text();
  } catch {
    // unreadable files fall through to the "not a backup" message
  }
  navigate(() => (ui.restore = { result: M.readBackup(text) }));
});

// The app can stay open across midnight: a new day creates its sessions.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || D.today() === today) return;
  today = D.today();
  if (state) {
    M.generate(state, today);
    store.save(state);
  }
  ui.cal = { month: D.monthOf(today), sel: today };
  ui.slip.month = null;
  render();
});

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
navigator.storage?.persist?.().catch(() => {});

if (!state) ui.setup = newSetup("first");
render();

// Exposed for the test page only.
window.__shp = { M, monthSheets, get state() { return state; } };
