// The month's Excel file (D3): a "Tổng hợp" sheet, then one attendance sheet per class.

import * as D from "./date.js";
import * as M from "./model.js";
import { buildXlsx } from "./xlsx.js";

export const excelFileName = (ym) => `hoc-phi-${ym}.xlsx`;

export function monthSheets(state, ym, today) {
  const classes = M.slipClasses(state, ym);
  const head = (cells) => cells.map((v) => ({ v, bold: true }));

  const summary = [head(["STT", "Lớp", "Học sinh", "Số buổi", "Học phí (đ)"])];
  let count = 0;
  let total = 0;
  for (const cls of classes) {
    for (const stu of M.slipStudents(state, cls.id, ym)) {
      const s = M.slip(state, stu.id, ym, today);
      summary.push([summary.length, cls.name, stu.name, s.count, { v: s.total, money: true }]);
      count += s.count;
      total += s.total;
    }
  }
  summary.push([null, null, { v: "Tổng", bold: true }, { v: count, bold: true }, { v: total, bold: true, money: true }]);

  const sheets = [{ name: "Tổng hợp", cols: [6, 16, 24, 10, 14], rows: summary }];
  for (const cls of classes) {
    const students = M.slipStudents(state, cls.id, ym);
    const held = state.sessions
      .filter((s) => s.classId === cls.id && D.monthOf(s.date) === ym && s.date <= today && M.classActiveOn(cls, s.date))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    const rows = [head(["Ngày", "Thứ", ...students.map((s) => s.name)])];
    for (const s of held) {
      rows.push([
        D.fmtDMY(s.date),
        D.dayShort(D.weekday(s.date)),
        ...students.map((stu) => (!M.enrolledOn(stu, s.date) ? null : s.absent.includes(stu.id) ? "Nghỉ" : "x")),
      ]);
    }
    sheets.push({ name: cls.name, cols: [12, 6, ...students.map(() => 14)], rows });
  }
  return { sheets, classes: classes.length, students: summary.length - 2 };
}

export function monthXlsx(state, ym, today) {
  return buildXlsx(monthSheets(state, ym, today).sheets);
}
