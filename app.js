const config = window.TEACHER_PORTAL_CONFIG || {};
const loginView = document.querySelector("#loginView");
const appView = document.querySelector("#appView");
const loginForm = document.querySelector("#loginForm");
const emailInput = document.querySelector("#emailInput");
const passwordInput = document.querySelector("#passwordInput");
const loginMessage = document.querySelector("#loginMessage");
const passwordDialogOpenButton = document.querySelector("#passwordDialogOpenButton");
const logoutButton = document.querySelector("#logoutButton");
const scopeText = document.querySelector("#scopeText");
const classFilter = document.querySelector("#classFilter");
const periodPresetGroup = document.querySelector("#periodPresetGroup");
const startDateInput = document.querySelector("#startDateInput");
const endDateInput = document.querySelector("#endDateInput");
const reloadButton = document.querySelector("#reloadButton");
const passwordDialog = document.querySelector("#passwordDialog");
const passwordDialogCloseButton = document.querySelector("#passwordDialogCloseButton");
const passwordForm = document.querySelector("#passwordForm");
const currentPasswordInput = document.querySelector("#currentPasswordInput");
const newPasswordInput = document.querySelector("#newPasswordInput");
const confirmPasswordInput = document.querySelector("#confirmPasswordInput");
const passwordMessage = document.querySelector("#passwordMessage");
const needsCount = document.querySelector("#needsCount");
const excusedCount = document.querySelector("#excusedCount");
const totalCount = document.querySelector("#totalCount");
const studentCount = document.querySelector("#studentCount");
const studentListButton = document.querySelector("#studentListButton");
const studentDialog = document.querySelector("#studentDialog");
const studentDialogTitle = document.querySelector("#studentDialogTitle");
const studentDialogMeta = document.querySelector("#studentDialogMeta");
const studentDialogContent = document.querySelector("#studentDialogContent");
const studentDialogBack = document.querySelector("#studentDialogBack");
const studentDialogClose = document.querySelector("#studentDialogClose");
const rankingPanel = document.querySelector("#rankingPanel");
const rankingTitle = document.querySelector("#rankingTitle");
const gradeLeadRankingActions = document.querySelector("#gradeLeadRankingActions");
const rankingToggleButton = document.querySelector("#rankingToggleButton");
const rankingMeta = document.querySelector("#rankingMeta");
const rankingBody = document.querySelector("#rankingBody");
const rankingEmpty = document.querySelector("#rankingEmpty");
const rankingMoreActions = document.querySelector("#rankingMoreActions");
const rankingMoreButton = document.querySelector("#rankingMoreButton");
const classSummaryMeta = document.querySelector("#classSummaryMeta");
const classSummaryChart = document.querySelector("#classSummaryChart");
const classSummaryBody = document.querySelector("#classSummaryBody");
const recordsTitle = document.querySelector("#recordsTitle");
const recordsMeta = document.querySelector("#recordsMeta");
const clearSelectedStudentButton = document.querySelector("#clearSelectedStudentButton");
const selectedStudentSummary = document.querySelector("#selectedStudentSummary");
const recordsTableWrap = document.querySelector("#recordsTableWrap");
const recordsBody = document.querySelector("#recordsBody");
const recordsEmpty = document.querySelector("#recordsEmpty");
const appMessage = document.querySelector("#appMessage");

let supabaseClient = null;
let teacherProfile = null;
let teacherClasses = [];
let students = [];
let resultRows = [];
let studentDialogState = { mode: "classes", grade: null, classNo: null };
let selectedStudentId = null;
let activePeriodKey = "all";
let isRankingPanelOpen = true;
let selectedRankingClass = null;
let rankingSortKey = null;
let rankingSortDirection = "asc";
const RANKING_PAGE_SIZE = 30;
let rankingVisibleLimit = RANKING_PAGE_SIZE;

function setMessage(target, text = "") {
  target.textContent = text;
}

function hasValidConfig() {
  return Boolean(
    config.supabaseUrl &&
    config.supabaseAnonKey &&
    !config.supabaseAnonKey.includes("PASTE_") &&
    !config.supabaseAnonKey.includes("YOUR_")
  );
}

function localDateText(date = new Date()) {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
}

function yearStartText() {
  return `${new Date().getFullYear()}-01-01`;
}

function monthStartText(year, monthIndex) {
  return localDateText(new Date(year, monthIndex, 1));
}

function monthEndText(year, monthIndex) {
  const monthEnd = new Date(year, monthIndex + 1, 0);
  const today = new Date();
  if (year === today.getFullYear() && monthIndex === today.getMonth()) {
    return localDateText(today);
  }
  return localDateText(monthEnd);
}

function periodPresets() {
  const today = new Date();
  const year = today.getFullYear();
  const presets = [
    {
      key: "all",
      label: "전체",
      start: yearStartText(),
      end: localDateText(today),
    },
  ];

  for (let monthIndex = 0; monthIndex <= today.getMonth(); monthIndex += 1) {
    presets.push({
      key: `month-${monthIndex + 1}`,
      label: `${monthIndex + 1}월`,
      start: monthStartText(year, monthIndex),
      end: monthEndText(year, monthIndex),
    });
  }

  return presets;
}

function renderPeriodPresets() {
  if (!periodPresetGroup) return;
  periodPresetGroup.innerHTML = periodPresets().map((preset) => {
    const activeClass = preset.key === activePeriodKey ? " active" : "";
    return `
      <button class="period-button${activeClass}" type="button" data-period-key="${preset.key}">
        ${escapeHtml(preset.label)}
      </button>
    `;
  }).join("");
}

function syncPeriodPreset() {
  const start = startDateInput.value;
  const end = endDateInput.value;
  const matched = periodPresets().find((preset) => preset.start === start && preset.end === end);
  activePeriodKey = matched?.key || "custom";
  renderPeriodPresets();
}

async function applyPeriodPreset(periodKey) {
  const preset = periodPresets().find((item) => item.key === periodKey);
  if (!preset) return;
  activePeriodKey = preset.key;
  startDateInput.value = preset.start;
  endDateInput.value = preset.end;
  renderPeriodPresets();
  await loadResults();
}

function showLogin() {
  loginView.classList.remove("hidden");
  appView.classList.add("hidden");
}

function showApp() {
  loginView.classList.add("hidden");
  appView.classList.remove("hidden");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatStatus(status) {
  if (status === "needs_check") return "확인 필요";
  if (status === "excused") return "외출 확인";
  if (status === "no_issue") return "이상 없음";
  return status || "-";
}

function formatCertificate(value) {
  const text = String(value || "").trim();
  if (text === "보유" || text === "미보유") return text;
  return "-";
}

function resolvedCertificate(row) {
  const text = String(row?.ksos_certificate || "").trim();
  if (text === "보유" || text === "미보유") return text;
  const hasKsosOuting = [
    row?.ksos_reason,
    row?.ksos_from_text,
    row?.ksos_to_text,
    row?.outing_from,
    row?.outing_to,
  ].some((value) => String(value || "").trim());
  return hasKsosOuting ? "보유" : "미보유";
}

function certificateClass(value) {
  if (value === "보유") return "certificate-badge certificate-has";
  if (value === "미보유") return "certificate-badge certificate-missing";
  return "certificate-badge";
}

function statusClass(status) {
  if (status === "needs_check") return "status-badge status-needs";
  if (status === "excused") return "status-badge status-excused";
  return "status-badge status-normal";
}

function formatRole(role) {
  if (role === "grade_lead") return "학년부장";
  return "담임";
}

function isGradeLead() {
  return teacherProfile?.role === "grade_lead";
}

function applyRoleLayout() {
  const gradeLead = isGradeLead();
  appView.classList.toggle("grade-lead-view", gradeLead);
  appView.classList.toggle("homeroom-view", !gradeLead);
  gradeLeadRankingActions.classList.toggle("hidden", !gradeLead);
}

function formatTimeRange(from, to) {
  const left = from ? String(from).slice(0, 5) : "";
  const right = to ? String(to).slice(0, 5) : "";
  if (left && right) return `${left} ~ ${right}`;
  if (left) return left;
  if (right) return `~ ${right}`;
  return "-";
}

function formatRawTime(textValue, timeValue) {
  const text = String(textValue || "").trim();
  if (text) return text;
  return timeValue ? String(timeValue).slice(0, 5) : "-";
}

function classLabel(grade, classNo) {
  return `${grade}-${classNo}반`;
}

function selectedClassNo() {
  const value = classFilter.value;
  if (!value || value === "all") return null;
  return Number(value);
}

function visibleStudents() {
  const classNo = selectedClassNo();
  if (!classNo) return students;
  return students.filter((student) => Number(student.class_no) === classNo);
}

function visibleResults() {
  const classNo = selectedClassNo();
  if (!classNo) return resultRows;
  return resultRows.filter((row) => Number(row.student?.class_no) === classNo);
}

function studentSort(a, b) {
  return (
    Number(a.grade) - Number(b.grade) ||
    Number(a.class_no) - Number(b.class_no) ||
    Number(a.student_no) - Number(b.student_no) ||
    String(a.name).localeCompare(String(b.name), "ko")
  );
}

function resultSort(a, b) {
  const dateCompare = String(b.result_date).localeCompare(String(a.result_date));
  if (dateCompare) return dateCompare;
  return studentSort(a.student || {}, b.student || {});
}

function renderScope() {
  const name = teacherProfile?.display_name || "담임";
  const role = formatRole(teacherProfile?.role);
  const scopes = teacherClasses
    .map((item) => (Number(item.class_no) === 0 ? `${item.grade}학년 전체` : classLabel(item.grade, item.class_no)))
    .join(", ");
  scopeText.textContent = `${name} · ${role} · ${scopes}`;
}

function renderClassOptions() {
  const classMap = new Map();
  students.forEach((student) => {
    const grade = Number(student.grade);
    const classNo = Number(student.class_no);
    if (grade && classNo) classMap.set(`${grade}-${classNo}`, { grade, classNo });
  });
  teacherClasses.forEach((item) => {
    const grade = Number(item.grade);
    const classNo = Number(item.class_no);
    if (grade && classNo) classMap.set(`${grade}-${classNo}`, { grade, classNo });
  });

  const classes = Array.from(classMap.values()).sort((a, b) => a.grade - b.grade || a.classNo - b.classNo);
  const canSeeWholeGrade = teacherClasses.some((item) => Number(item.class_no) === 0);
  const canSeeMultiple = classes.length > 1 || canSeeWholeGrade;

  classFilter.innerHTML = "";
  if (canSeeMultiple) {
    const option = document.createElement("option");
    option.value = "all";
    option.textContent = "전체";
    classFilter.append(option);
  }

  classes.forEach(({ grade, classNo }) => {
    const option = document.createElement("option");
    option.value = String(classNo);
    option.textContent = classLabel(grade, classNo);
    classFilter.append(option);
  });

  if (!classFilter.value && classFilter.options.length) {
    classFilter.value = classFilter.options[0].value;
  }
  classFilter.disabled = !canSeeMultiple;
  classFilter.title = canSeeMultiple ? "" : "담임 권한은 담당 반으로 고정됩니다.";
}

function buildStudentStats(results, studentRows = visibleStudents()) {
  const stats = new Map();
  studentRows.forEach((student) => {
    stats.set(student.id, {
      student,
      needs: 0,
      excused: 0,
      total: 0,
    });
  });

  results.forEach((row) => {
    const student = row.student;
    if (!student) return;
    if (!stats.has(student.id)) {
      stats.set(student.id, {
        student,
        needs: 0,
        excused: 0,
        total: 0,
      });
    }
    const item = stats.get(student.id);
    if (row.status === "needs_check") item.needs += 1;
    if (row.status === "excused") item.excused += 1;
    item.total += 1;
  });

  return Array.from(stats.values())
    .filter((item) => item.total > 0)
    .sort((a, b) => {
      return (
        b.needs - a.needs ||
        b.total - a.total ||
        studentSort(a.student, b.student)
      );
    });
}

function renderSummary(results) {
  const needs = results.filter((item) => item.status === "needs_check").length;
  const excused = results.filter((item) => item.status === "excused").length;
  const targetStudentCount = visibleStudents().length;
  needsCount.textContent = String(needs);
  excusedCount.textContent = String(excused);
  totalCount.textContent = String(results.length);
  studentCount.textContent = String(targetStudentCount);
  studentListButton.disabled = targetStudentCount === 0;
}

function rankingClassLabel() {
  if (!selectedRankingClass) return null;
  return classLabel(selectedRankingClass.grade, selectedRankingClass.classNo);
}

function scopedRankingStudents() {
  if (!selectedRankingClass) return visibleStudents();
  return visibleStudents().filter((student) => (
    Number(student.grade) === Number(selectedRankingClass.grade) &&
    Number(student.class_no) === Number(selectedRankingClass.classNo)
  ));
}

function scopedRankingResults(results) {
  if (!selectedRankingClass) return results;
  return results.filter((row) => (
    Number(row.student?.grade) === Number(selectedRankingClass.grade) &&
    Number(row.student?.class_no) === Number(selectedRankingClass.classNo)
  ));
}

function sortedRankingStats(stats) {
  if (!rankingSortKey) return stats;
  const direction = rankingSortDirection === "desc" ? -1 : 1;
  return [...stats].sort((a, b) => {
    const valueCompare = rankingSortKey === "student"
      ? Number(a.student?.student_no) - Number(b.student?.student_no)
      : Number(a[rankingSortKey]) - Number(b[rankingSortKey]);
    return (valueCompare * direction) || studentSort(a.student, b.student);
  });
}

function updateRankingSortButtons() {
  document.querySelectorAll("[data-ranking-sort]").forEach((button) => {
    const isActive = button.dataset.rankingSort === rankingSortKey;
    button.classList.toggle("active", isActive);
    button.classList.toggle("sort-asc", isActive && rankingSortDirection === "asc");
    button.classList.toggle("sort-desc", isActive && rankingSortDirection === "desc");
  });
}

function resetRankingVisibleLimit() {
  rankingVisibleLimit = RANKING_PAGE_SIZE;
}

function renderRanking(results) {
  const gradeLead = isGradeLead();
  const shouldShow = !gradeLead || isRankingPanelOpen || selectedRankingClass;
  rankingPanel.classList.toggle("hidden", !shouldShow);
  rankingPanel.classList.toggle("class-ranking-mode", Boolean(selectedRankingClass));
  rankingToggleButton.textContent = isRankingPanelOpen && !selectedRankingClass
    ? "전체 학생별 누적 숨기기"
    : "전체 학생별 누적 보기";

  if (!shouldShow) {
    rankingTitle.textContent = "학생별 누적";
    rankingMeta.textContent = "반을 누르거나 전체 학생별 누적 보기를 눌러 주세요.";
    rankingBody.innerHTML = "";
    rankingEmpty.classList.add("hidden");
    rankingMoreActions.classList.add("hidden");
    return;
  }

  const selectedLabel = rankingClassLabel();
  const stats = sortedRankingStats(buildStudentStats(scopedRankingResults(results), scopedRankingStudents()));
  rankingTitle.textContent = selectedLabel ? `${selectedLabel} 학생별 누적` : "학생별 누적";
  rankingMeta.textContent = selectedLabel ? `${selectedLabel} · ${stats.length}명` : `${stats.length}명`;
  rankingBody.innerHTML = "";
  updateRankingSortButtons();

  if (!stats.length) {
    rankingEmpty.classList.remove("hidden");
    rankingMoreActions.classList.add("hidden");
    return;
  }
  rankingEmpty.classList.add("hidden");

  const isWholeGradeRanking = gradeLead && !selectedRankingClass;
  const rows = isWholeGradeRanking ? stats.slice(0, rankingVisibleLimit) : stats;
  rankingBody.innerHTML = rows.map((item, index) => {
    const student = item.student;
    return `
      <tr>
        <td class="num">${index + 1}</td>
        <td>
          <button class="inline-student-button" type="button" data-record-student-id="${escapeHtml(student.id)}">
            ${escapeHtml(student.name)}
          </button>
          <span class="sub-text">${escapeHtml(classLabel(student.grade, student.class_no))} ${escapeHtml(student.student_no)}번</span>
        </td>
        <td class="num">${item.needs}</td>
        <td class="num">${item.excused}</td>
        <td class="num">${item.total}</td>
      </tr>
    `;
  }).join("");

  const remaining = stats.length - rows.length;
  rankingMoreActions.classList.toggle("hidden", !isWholeGradeRanking || remaining <= 0);
  if (isWholeGradeRanking && remaining > 0) {
    const nextCount = Math.min(RANKING_PAGE_SIZE, remaining);
    rankingMoreButton.textContent = `${nextCount}명 더 보기 (${rows.length}/${stats.length})`;
  }
}

function renderClassSummaryChart(rows) {
  const maxValue = Math.max(...rows.map((item) => item.total), 1);
  classSummaryChart.classList.toggle("hidden", !rows.length);
  classSummaryChart.innerHTML = rows.map((item) => {
    const isSelectedClass = selectedRankingClass &&
      Number(selectedRankingClass.grade) === item.grade &&
      Number(selectedRankingClass.classNo) === item.classNo;
    const activeClass = isSelectedClass ? " active" : "";
    const chartBars = [
      { key: "needs", label: "확인 필요", shortLabel: "확인", value: item.needs },
      { key: "excused", label: "외출 확인", shortLabel: "외출", value: item.excused },
      { key: "total", label: "합계", shortLabel: "합계", value: item.total },
    ].map((bar) => {
      const rawHeight = Math.round((bar.value / maxValue) * 1000) / 10;
      const height = `${bar.value > 0 ? Math.max(rawHeight, 4) : 0}%`;
      return `
        <div class="class-chart-bar ${bar.key}" title="${escapeHtml(`${classLabel(item.grade, item.classNo)} ${bar.label}: ${bar.value}`)}">
          <strong>${bar.value}</strong>
          <span class="class-chart-track" aria-hidden="true">
            <span class="class-chart-fill" style="height: ${height}"></span>
          </span>
          <span class="class-chart-metric">${bar.shortLabel}</span>
        </div>
      `;
    }).join("");

    return `
      <article class="class-chart-row${activeClass}">
        <button class="class-chart-class" type="button" data-summary-grade="${item.grade}" data-summary-class-no="${item.classNo}">
          ${escapeHtml(classLabel(item.grade, item.classNo))}
        </button>
        <div class="class-chart-bars">
          ${chartBars}
        </div>
      </article>
    `;
  }).join("");
}

function renderClassSummary(results) {
  const groups = new Map();
  visibleStudents().forEach((student) => {
    const key = `${student.grade}-${student.class_no}`;
    if (!groups.has(key)) {
      groups.set(key, {
        grade: Number(student.grade),
        classNo: Number(student.class_no),
        needs: 0,
        excused: 0,
        total: 0,
        students: new Set(),
      });
    }
    groups.get(key).students.add(student.id);
  });

  results.forEach((row) => {
    const student = row.student;
    if (!student) return;
    const key = `${student.grade}-${student.class_no}`;
    if (!groups.has(key)) return;
    const item = groups.get(key);
    if (row.status === "needs_check") item.needs += 1;
    if (row.status === "excused") item.excused += 1;
    item.total += 1;
    item.students.add(student.id);
  });

  const rows = Array.from(groups.values()).sort((a, b) => a.grade - b.grade || a.classNo - b.classNo);
  classSummaryMeta.textContent = `${rows.length}개 반`;
  renderClassSummaryChart(rows);
  classSummaryBody.innerHTML = rows.map((item) => {
    const isSelectedClass = selectedRankingClass &&
      Number(selectedRankingClass.grade) === item.grade &&
      Number(selectedRankingClass.classNo) === item.classNo;
    const classButtonClass = isSelectedClass ? "class-summary-button active" : "class-summary-button";
    return `
      <tr>
        <td>
          <button class="${classButtonClass}" type="button" data-summary-grade="${item.grade}" data-summary-class-no="${item.classNo}">
            ${escapeHtml(classLabel(item.grade, item.classNo))}
          </button>
        </td>
        <td class="num">${item.needs}</td>
        <td class="num">${item.excused}</td>
        <td class="num">${item.total}</td>
        <td class="num">${item.students.size}</td>
      </tr>
    `;
  }).join("");
}

function selectedScopeLabel() {
  const classNo = selectedClassNo();
  if (!classNo) return "전체";
  const sample = visibleStudents()[0] || teacherClasses.find((item) => Number(item.class_no) === classNo);
  return classLabel(sample?.grade || teacherClasses[0]?.grade || 2, classNo);
}

function setStudentDialogMode(mode, grade = null, classNo = null) {
  studentDialogState = { mode, grade, classNo };
  studentDialog.classList.toggle("student-dialog-full", mode === "record");
}

function getClassGroups() {
  const rows = [...visibleStudents()].sort(studentSort);
  const groups = new Map();
  rows.forEach((student) => {
    const key = `${student.grade}-${student.class_no}`;
    if (!groups.has(key)) {
      groups.set(key, {
        grade: Number(student.grade),
        classNo: Number(student.class_no),
        label: classLabel(student.grade, student.class_no),
        students: [],
      });
    }
    groups.get(key).students.push(student);
  });
  return Array.from(groups.values()).sort((a, b) => a.grade - b.grade || a.classNo - b.classNo);
}

function statsForStudents(groupStudents) {
  const ids = new Set(groupStudents.map((student) => student.id));
  const rows = resultRows.filter((row) => ids.has(row.student?.id));
  return {
    needs: rows.filter((row) => row.status === "needs_check").length,
    excused: rows.filter((row) => row.status === "excused").length,
    total: rows.length,
  };
}

function renderClassListDialog() {
  const groups = getClassGroups();
  const totalStudents = groups.reduce((sum, group) => sum + group.students.length, 0);
  setStudentDialogMode("classes");
  studentDialogBack.classList.add("hidden");
  studentDialogBack.textContent = "목록";
  studentDialogTitle.textContent = selectedClassNo() ? `${selectedScopeLabel()} 대상 학생` : "대상 학생";
  studentDialogMeta.textContent = `${groups.length}개 반 · ${totalStudents}명`;
  studentDialogContent.className = "student-dialog-content class-list-mode";
  studentDialogContent.innerHTML = groups.map((group) => {
    const stats = statsForStudents(group.students);
    return `
      <button class="class-card" type="button" data-grade="${group.grade}" data-class-no="${group.classNo}">
        <span class="class-card-label">${escapeHtml(group.label)}</span>
        <strong>${group.students.length}명</strong>
        <span class="class-card-meta">확인 ${stats.needs} · 외출 ${stats.excused} · 기록 ${stats.total}</span>
      </button>
    `;
  }).join("");
}

function renderStudentListDialog(grade, classNo) {
  const rows = [...visibleStudents()]
    .filter((student) => Number(student.grade) === Number(grade) && Number(student.class_no) === Number(classNo))
    .sort(studentSort);

  setStudentDialogMode("students", Number(grade), Number(classNo));
  studentDialogBack.classList.remove("hidden");
  studentDialogBack.textContent = "반 목록";
  studentDialogTitle.textContent = `${classLabel(grade, classNo)} 학생`;
  studentDialogMeta.textContent = `${rows.length}명`;
  studentDialogContent.className = "student-dialog-content student-list-mode";
  studentDialogContent.innerHTML = `
    <div class="student-card-grid">
      ${rows.map((student) => {
        const records = resultRows.filter((row) => row.student?.id === student.id);
        const needs = records.filter((row) => row.status === "needs_check").length;
        const excused = records.filter((row) => row.status === "excused").length;
        return `
          <button class="student-card" type="button" data-student-id="${escapeHtml(student.id)}">
            <span class="student-card-number">${escapeHtml(student.student_no)}번</span>
            <span class="student-card-name">${escapeHtml(student.name)}</span>
            <span class="student-card-meta">확인 ${needs} · 외출 ${excused}</span>
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function selectedStudent() {
  return students.find((student) => student.id === selectedStudentId) || null;
}

function selectStudentRecord(studentId, options = {}) {
  const scroll = options.scroll !== false;
  if (!students.some((student) => student.id === studentId)) return;
  selectedStudentId = studentId;
  if (studentDialog.open) {
    studentDialog.close();
  }
  renderAll();
  if (scroll) {
    recordsTitle.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function selectSummaryClass(button) {
  selectedRankingClass = {
    grade: Number(button.dataset.summaryGrade),
    classNo: Number(button.dataset.summaryClassNo),
  };
  resetRankingVisibleLimit();
  isRankingPanelOpen = false;
  renderAll();
  rankingPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function clearSelectedStudent() {
  selectedStudentId = null;
  renderAll();
}

function openStudentDialog() {
  renderClassListDialog();

  if (typeof studentDialog.showModal === "function") {
    studentDialog.showModal();
  }
}

function resetPasswordDialog() {
  currentPasswordInput.value = "";
  newPasswordInput.value = "";
  confirmPasswordInput.value = "";
  passwordMessage.classList.remove("success");
  setMessage(passwordMessage, "");
}

function openPasswordDialog() {
  resetPasswordDialog();
  if (typeof passwordDialog.showModal === "function") {
    passwordDialog.showModal();
  }
  currentPasswordInput.focus();
}

function closePasswordDialog() {
  passwordDialog.close();
  resetPasswordDialog();
}

function renderRecords(results) {
  const selected = selectedStudent();
  recordsBody.innerHTML = "";
  recordsTableWrap.classList.add("hidden");
  selectedStudentSummary.classList.add("hidden");
  selectedStudentSummary.innerHTML = "";

  if (!selected) {
    recordsTitle.textContent = "상세 기록";
    recordsMeta.textContent = "학생을 선택하면 이곳에 1명 상세 기록이 표시됩니다.";
    clearSelectedStudentButton.classList.add("hidden");
    recordsEmpty.textContent = "대상 학생에서 반과 학생을 선택해 주세요.";
    recordsEmpty.classList.remove("hidden");
    return;
  }

  const sorted = results
    .filter((row) => row.student?.id === selected.id)
    .sort(resultSort);
  const needs = sorted.filter((row) => row.status === "needs_check").length;
  const excused = sorted.filter((row) => row.status === "excused").length;

  recordsTitle.textContent = `${selected.name} 상세 기록`;
  recordsMeta.textContent = `${classLabel(selected.grade, selected.class_no)} ${selected.student_no}번 · ${startDateInput.value || yearStartText()} ~ ${endDateInput.value || localDateText()} · ${sorted.length}건`;
  clearSelectedStudentButton.classList.remove("hidden");
  selectedStudentSummary.classList.remove("hidden");
  selectedStudentSummary.innerHTML = `
    <section class="selected-student-profile">
      <span>${escapeHtml(classLabel(selected.grade, selected.class_no))}</span>
      <strong>${escapeHtml(selected.student_no)}번 ${escapeHtml(selected.name)}</strong>
    </section>
    <section class="student-record-summary">
      <article class="mini-stat needs">
        <span>확인 필요</span>
        <strong>${needs}</strong>
      </article>
      <article class="mini-stat excused">
        <span>외출 확인</span>
        <strong>${excused}</strong>
      </article>
    </section>
  `;

  if (!sorted.length) {
    recordsEmpty.textContent = "선택한 기간에 조회된 기록이 없습니다.";
    recordsEmpty.classList.remove("hidden");
    return;
  }
  recordsEmpty.classList.add("hidden");
  recordsTableWrap.classList.remove("hidden");

  recordsBody.innerHTML = sorted.slice(0, 500).map((row) => {
    const student = row.student || {};
    const certificate = resolvedCertificate(row);
    return `
      <tr>
        <td>${escapeHtml(row.result_date)}</td>
        <td>${escapeHtml(classLabel(student.grade || "-", student.class_no || "-"))}</td>
        <td class="num">${escapeHtml(student.student_no || "-")}</td>
        <td class="student-name">${escapeHtml(student.name || "-")}</td>
        <td><span class="${statusClass(row.status)}">${escapeHtml(formatStatus(row.status))}</span></td>
        <td><span class="${certificateClass(certificate)}">${escapeHtml(formatCertificate(certificate))}</span></td>
        <td>${escapeHtml(row.absence_periods || "-")}</td>
        <td>${escapeHtml(row.ksos_reason || "-")}</td>
        <td>${escapeHtml(formatRawTime(row.ksos_from_text, row.outing_from))}</td>
        <td>${escapeHtml(formatRawTime(row.ksos_to_text, row.outing_to))}</td>
        <td>${escapeHtml(row.teacher_name || "-")}</td>
      </tr>
    `;
  }).join("");

  if (sorted.length > 500) {
    recordsMeta.textContent = `${selected.name} · ${sorted.length}건 중 최근 500건`;
  }
}

function renderAll() {
  const results = visibleResults();
  renderSummary(results);
  renderRanking(results);
  renderClassSummary(results);
  renderRecords(results);
}

async function loadTeacherScope() {
  const { data: profileData, error: profileError } = await supabaseClient
    .from("teacher_profiles")
    .select("display_name, role")
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profileData) {
    throw new Error("담임 권한이 연결되어 있지 않습니다.");
  }
  teacherProfile = profileData;
  selectedRankingClass = null;
  isRankingPanelOpen = !isGradeLead();
  applyRoleLayout();

  const { data: classData, error: classError } = await supabaseClient
    .from("teacher_classes")
    .select("grade, class_no")
    .order("grade", { ascending: true })
    .order("class_no", { ascending: true });
  if (classError) throw classError;
  teacherClasses = classData || [];
  if (!teacherClasses.length) {
    throw new Error("담임 반 권한이 없습니다.");
  }
  renderScope();
}

async function loadStudents() {
  const { data, error } = await supabaseClient
    .from("students")
    .select("id, grade, class_no, student_no, name")
    .order("grade", { ascending: true })
    .order("class_no", { ascending: true })
    .order("student_no", { ascending: true });
  if (error) throw error;
  students = (data || []).sort(studentSort);
  renderClassOptions();
}

async function loadResults() {
  const startDate = startDateInput.value || yearStartText();
  const endDate = endDateInput.value || localDateText();
  setMessage(appMessage, "");

  let { data, error } = await supabaseClient
    .from("daily_results")
    .select("result_date, status, absence_periods, ksos_certificate, ksos_reason, ksos_from_text, ksos_to_text, outing_from, outing_to, teacher_name, student:students(id, grade, class_no, student_no, name)")
    .gte("result_date", startDate)
    .lte("result_date", endDate)
    .order("result_date", { ascending: false })
    .limit(10000);

  if (
    error &&
    (String(error.message || "").includes("ksos_certificate") ||
      String(error.message || "").includes("ksos_from_text") ||
      String(error.message || "").includes("ksos_to_text"))
  ) {
    ({ data, error } = await supabaseClient
      .from("daily_results")
      .select("result_date, status, absence_periods, ksos_reason, outing_from, outing_to, teacher_name, student:students(id, grade, class_no, student_no, name)")
      .gte("result_date", startDate)
      .lte("result_date", endDate)
      .order("result_date", { ascending: false })
      .limit(10000));
  }

  if (error) throw error;
  resultRows = (data || []).filter((row) => row.student);
  resetRankingVisibleLimit();
  renderAll();
}

async function loadDashboard() {
  try {
    await loadTeacherScope();
    await loadStudents();
    await loadResults();
  } catch (error) {
    setMessage(appMessage, error.message || "데이터를 불러오지 못했습니다.");
  }
}

async function bootstrap() {
  startDateInput.value = yearStartText();
  endDateInput.value = localDateText();
  syncPeriodPreset();

  if (!hasValidConfig()) {
    setMessage(loginMessage, "config.js에 Supabase publishable key를 넣어 주세요.");
    return;
  }

  supabaseClient = window.supabase.createClient(
    config.supabaseUrl,
    config.supabaseAnonKey
  );

  const { data } = await supabaseClient.auth.getSession();
  if (data.session) {
    showApp();
    await loadDashboard();
  } else {
    showLogin();
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(loginMessage, "");

  if (!hasValidConfig()) {
    setMessage(loginMessage, "config.js에 Supabase publishable key를 넣어 주세요.");
    return;
  }

  if (!supabaseClient) {
    supabaseClient = window.supabase.createClient(
      config.supabaseUrl,
      config.supabaseAnonKey
    );
  }

  const { error } = await supabaseClient.auth.signInWithPassword({
    email: emailInput.value.trim(),
    password: passwordInput.value,
  });

  if (error) {
    setMessage(loginMessage, "아이디 또는 비밀번호를 확인해 주세요.");
    return;
  }

  passwordInput.value = "";
  showApp();
  await loadDashboard();
});

logoutButton.addEventListener("click", async () => {
  if (passwordDialog.open) {
    passwordDialog.close();
  }
  if (supabaseClient) {
    await supabaseClient.auth.signOut();
  }
  teacherProfile = null;
  applyRoleLayout();
  teacherClasses = [];
  students = [];
  resultRows = [];
  selectedStudentId = null;
  selectedRankingClass = null;
  resetRankingVisibleLimit();
  isRankingPanelOpen = true;
  rankingBody.innerHTML = "";
  classSummaryChart.innerHTML = "";
  classSummaryBody.innerHTML = "";
  recordsBody.innerHTML = "";
  renderSummary([]);
  showLogin();
});

classFilter.addEventListener("change", () => {
  selectedStudentId = null;
  selectedRankingClass = null;
  resetRankingVisibleLimit();
  isRankingPanelOpen = !isGradeLead();
  renderAll();
});

periodPresetGroup.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-period-key]");
  if (!button) return;
  try {
    await applyPeriodPreset(button.dataset.periodKey);
  } catch (error) {
    setMessage(appMessage, error.message || "데이터를 불러오지 못했습니다.");
  }
});

startDateInput.addEventListener("change", syncPeriodPreset);
endDateInput.addEventListener("change", syncPeriodPreset);

studentListButton.addEventListener("click", openStudentDialog);

studentDialogContent.addEventListener("click", (event) => {
  const classButton = event.target.closest("[data-grade][data-class-no]");
  if (classButton) {
    renderStudentListDialog(classButton.dataset.grade, classButton.dataset.classNo);
    return;
  }

  const studentButton = event.target.closest("[data-student-id]");
  if (studentButton) {
    selectStudentRecord(studentButton.dataset.studentId);
  }
});

studentDialogBack.addEventListener("click", () => {
  if (studentDialogState.mode === "record") {
    renderStudentListDialog(studentDialogState.grade, studentDialogState.classNo);
    return;
  }
  renderClassListDialog();
});

studentDialogClose.addEventListener("click", () => {
  studentDialog.close();
});

rankingBody.addEventListener("click", (event) => {
  const button = event.target.closest("[data-record-student-id]");
  if (!button) return;
  selectStudentRecord(button.dataset.recordStudentId);
});

rankingPanel.addEventListener("click", (event) => {
  const button = event.target.closest("[data-ranking-sort]");
  if (!button) return;
  const nextSortKey = button.dataset.rankingSort;
  if (rankingSortKey === nextSortKey) {
    rankingSortDirection = rankingSortDirection === "asc" ? "desc" : "asc";
  } else {
    rankingSortKey = nextSortKey;
    rankingSortDirection = nextSortKey === "student" ? "desc" : "asc";
  }
  renderAll();
});

classSummaryBody.addEventListener("click", (event) => {
  const button = event.target.closest("[data-summary-grade][data-summary-class-no]");
  if (!button) return;
  selectSummaryClass(button);
});

classSummaryChart.addEventListener("click", (event) => {
  const button = event.target.closest("[data-summary-grade][data-summary-class-no]");
  if (!button) return;
  selectSummaryClass(button);
});

rankingToggleButton.addEventListener("click", () => {
  selectedRankingClass = null;
  resetRankingVisibleLimit();
  isRankingPanelOpen = !isRankingPanelOpen;
  renderAll();
  if (isRankingPanelOpen) {
    rankingPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

rankingMoreButton.addEventListener("click", () => {
  rankingVisibleLimit += RANKING_PAGE_SIZE;
  renderAll();
});

clearSelectedStudentButton.addEventListener("click", clearSelectedStudent);

passwordDialogOpenButton.addEventListener("click", openPasswordDialog);
passwordDialogCloseButton.addEventListener("click", closePasswordDialog);

passwordDialog.addEventListener("click", (event) => {
  if (event.target === passwordDialog) {
    closePasswordDialog();
  }
});

reloadButton.addEventListener("click", async () => {
  try {
    syncPeriodPreset();
    await loadResults();
  } catch (error) {
    setMessage(appMessage, error.message || "데이터를 불러오지 못했습니다.");
  }
});

passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  passwordMessage.classList.remove("success");
  setMessage(passwordMessage, "");

  const currentPassword = currentPasswordInput.value;
  const newPassword = newPasswordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  if (newPassword.length < 8) {
    setMessage(passwordMessage, "새 비밀번호는 8자 이상이어야 합니다.");
    return;
  }
  if (newPassword !== confirmPassword) {
    setMessage(passwordMessage, "새 비밀번호 확인이 일치하지 않습니다.");
    return;
  }
  if (newPassword === currentPassword) {
    setMessage(passwordMessage, "현재 비밀번호와 다른 비밀번호를 입력해 주세요.");
    return;
  }

  const { data: userData, error: userError } = await supabaseClient.auth.getUser();
  if (userError || !userData.user?.email) {
    setMessage(passwordMessage, "로그인 정보를 다시 확인해 주세요.");
    return;
  }

  const { error: verifyError } = await supabaseClient.auth.signInWithPassword({
    email: userData.user.email,
    password: currentPassword,
  });
  if (verifyError) {
    setMessage(passwordMessage, "현재 비밀번호가 맞지 않습니다.");
    return;
  }

  const { error: updateError } = await supabaseClient.auth.updateUser({
    password: newPassword,
  });
  if (updateError) {
    setMessage(passwordMessage, updateError.message || "비밀번호를 변경하지 못했습니다.");
    return;
  }

  currentPasswordInput.value = "";
  newPasswordInput.value = "";
  confirmPasswordInput.value = "";
  passwordMessage.classList.add("success");
  setMessage(passwordMessage, "비밀번호가 변경되었습니다.");
  window.setTimeout(() => {
    if (passwordDialog.open) {
      passwordDialog.close();
    }
    resetPasswordDialog();
  }, 1200);
});

bootstrap();
