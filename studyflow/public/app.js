/* ============================================================
   app.js
   Task planner logic, shared by index.html, planner.html, and
   progress.html. Each render function starts with a guard that
   checks whether the elements it needs exist on the current
   page, so one file safely serves all three.
   ============================================================ */

const OLD_LOCAL_KEY = "studyflow_tasks_v1";

/* ---- storage helpers (tasks live in the server database) --------- */

let tasks = [];

// Call the tasks API with the logged-in student's token.
async function api(method, body) {
  const session = getSession();
  const res = await fetch(API + "/api/tasks", {
    method,
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.token },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) return logout();
  return res.json();
}

// Save the current tasks array to the database.
const saveTasks = () => api("PUT", tasks).catch(() => alert("Can't reach the server. Please try again."));

// Load this student's tasks, then paint the page. Tasks left in this
// browser's old localStorage are moved into the database once.
async function loadTasks() {
  try {
    tasks = await api("GET");
    const old = JSON.parse(localStorage.getItem(OLD_LOCAL_KEY) || "[]");
    if (!tasks.length && Array.isArray(old) && old.length) {
      tasks = old;
      await saveTasks();
    }
    localStorage.removeItem(OLD_LOCAL_KEY);
  } catch {
    tasks = [];
    alert("Can't reach the server. Please try again.");
  }
  refresh();
}

/* ---- small utilities ---------------------------------------- */

// Shorthand for document.getElementById.
const $ = (id) => document.getElementById(id);

// Today's date as "YYYY-MM-DD", matching <input type="date">.
const today = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Format a "YYYY-MM-DD" string as e.g. "Oct 3, 2026".
const prettyDate = (date) => {
  if (!date) return "No deadline";
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

// Escape special characters before inserting text into HTML.
const escapeHTML = (value) => {
  const entities = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return String(value).replace(/[&<>"']/g, (ch) => entities[ch]);
};

// Count how many tasks are marked complete.
const countDone = () => tasks.filter((t) => t.done).length;

// Overall completion percentage across all tasks.
const percent = () => {
  if (!tasks.length) return 0;
  return Math.round((countDone() / tasks.length) * 100);
};

/* ---- rendering helpers ---------------------------------------- */

// Build the HTML for a single task row.
// `actions` controls whether edit/delete buttons are included.
function taskMarkup(t, actions = true) {
  const due = t.date === today() ? "Today" : prettyDate(t.date);

  const actionButtons = actions
    ? `<div class="task-actions">
         <button class="icon-btn" type="button" data-edit="${t.id}" aria-label="Edit task">✎</button>
         <button class="icon-btn" type="button" data-delete="${t.id}" aria-label="Delete task">×</button>
       </div>`
    : "";

  return `
    <article class="task-item ${t.done ? "is-done" : ""}">
      <input
        class="task-check"
        type="checkbox"
        aria-label="Mark ${escapeHTML(t.title)} complete"
        data-toggle="${t.id}"
        ${t.done ? "checked" : ""}
      >
      <div class="task-info">
        <strong>${escapeHTML(t.title)}</strong>
        <small>${escapeHTML(t.subject)} · ${due}</small>
      </div>
      <span class="priority ${t.priority.toLowerCase()}">${escapeHTML(t.priority)}</span>
      ${actionButtons}
    </article>`;
}

// Wrap a placeholder message in the "empty state" box.
function empty(message) {
  return `<div class="empty">${message}</div>`;
}

/* ---- page renderers ------------------------------------------- */

// Fill in the dashboard (index.html): totals, today's tasks,
// and the overall progress bar.
function updateDashboard() {
  if (!$("totalCount")) return;

  $("totalCount").textContent = tasks.length;
  $("doneCount").textContent = countDone();
  $("pendingCount").textContent = tasks.length - countDone();

  const todays = tasks.filter((t) => t.date === today() && !t.done);
  $("todayTasks").innerHTML = todays.length
    ? todays.map((t) => taskMarkup(t, false)).join("")
    : empty("No pending tasks due today. Enjoy your progress!");

  $("progressPercent").textContent = percent() + "%";
  $("progressFill").style.width = percent() + "%";
  $("progressCaption").textContent = `${countDone()} of ${tasks.length} tasks completed`;
}

// Fill in the full, editable task list (planner.html).
function renderPlanner() {
  if (!$("allTasks")) return;

  const filter = $("taskFilter").value;
  const visible = tasks
    .filter((t) => filter === "all" || (filter === "done" ? t.done : !t.done))
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  $("allTasks").innerHTML = visible.length
    ? visible.map((t) => taskMarkup(t)).join("")
    : empty(
        filter === "done"
          ? "No completed tasks yet."
          : "No tasks here yet. Add one above to get started."
      );
}

// Fill in the progress page (progress.html): stats, per-subject
// progress, and recently completed tasks.
function renderProgress() {
  if (!$("subjectProgress")) return;

  $("rateCount").textContent = percent() + "%";
  $("progressDone").textContent = countDone();

  const subjects = [...new Set(tasks.map((t) => t.subject))];
  $("subjectCount").textContent = subjects.length;

  $("subjectProgress").innerHTML = subjects.length
    ? subjects
        .map((s) => {
          const group = tasks.filter((t) => t.subject === s);
          const done = group.filter((t) => t.done).length;
          const p = Math.round((done / group.length) * 100);
          return `
            <div class="subject-row">
              <span class="subject-name">${escapeHTML(s)}</span>
              <div class="progress-track">
                <div class="progress-fill" style="width:${p}%"></div>
              </div>
              <span class="subject-percent">${p}%</span>
            </div>`;
        })
        .join("")
    : empty("Add tasks in different subjects to see your progress.");

  const completed = tasks
    .filter((t) => t.done)
    .slice()
    .reverse()
    .slice(0, 5);

  $("completedTasks").innerHTML = completed.length
    ? completed.map((t) => taskMarkup(t, false)).join("")
    : empty("Completed tasks will appear here.");
}

// Re-render every part of every page. Each function guards
// itself, so this is safe to call regardless of which page
// is currently loaded.
function refresh() {
  updateDashboard();
  renderPlanner();
  renderProgress();
}

/* ---- sidebar: student name, date, logout ----------------------- */

if ($("railUser")) {
  const session = getSession();
  $("railUser").textContent = session ? session.name : "";
}

if ($("railDate")) {
  $("railDate").textContent = new Date().toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

if ($("logoutLink")) {
  $("logoutLink").addEventListener("click", (e) => {
    e.preventDefault();
    logout();
  });
}

/* ---- add / edit task form (planner.html only) ------------------ */

// Reset the form back to its default "add a new task" state.
function clearForm() {
  $("taskForm").reset();
  $("editId").value = "";
  $("taskPriority").value = "Medium";
  $("formTitle").textContent = "Add a study task";
  $("submitTask").textContent = "＋ Add task";
  $("cancelEdit").classList.add("hidden");
}

if ($("taskForm")) {
  $("taskDate").min = today();

  $("taskForm").addEventListener("submit", (e) => {
    e.preventDefault();

    const title = $("taskTitle").value.trim();
    const subject = $("taskSubject").value;
    const date = $("taskDate").value;
    const priority = $("taskPriority").value;
    const id = $("editId").value;

    if (!title || !subject || !date) {
      alert("Please complete all required fields.");
      return;
    }

    if (id) {
      // Editing an existing task.
      const task = tasks.find((t) => t.id === id);
      if (task) Object.assign(task, { title, subject, date, priority });
    } else {
      // Creating a new task.
      tasks.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        title,
        subject,
        date,
        priority,
        done: false,
        created: Date.now(),
      });
    }

    saveTasks();
    clearForm();
    refresh();
  });

  $("cancelEdit").addEventListener("click", clearForm);
  $("taskFilter").addEventListener("change", renderPlanner);
}

/* ---- task list interactions: delete, edit, toggle complete ----- */

// Event delegation: one listener handles every delete/edit
// button, including ones created after the list re-renders.
document.addEventListener("click", (e) => {
  const del = e.target.closest("[data-delete]");
  if (del) {
    tasks = tasks.filter((t) => t.id !== del.dataset.delete);
    saveTasks();
    refresh();
    return;
  }

  const edit = e.target.closest("[data-edit]");
  if (edit) {
    const t = tasks.find((t) => t.id === edit.dataset.edit);
    if (!t || !$("taskForm")) {
      // Editing only happens on the planner page.
      location.href = "planner.html";
      return;
    }
    $("editId").value = t.id;
    $("taskTitle").value = t.title;
    $("taskSubject").value = t.subject;
    $("taskDate").value = t.date;
    $("taskPriority").value = t.priority;
    $("formTitle").textContent = "Edit study task";
    $("submitTask").textContent = "Save changes";
    $("cancelEdit").classList.remove("hidden");
    $("taskTitle").focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});

// Toggling a task's checkbox.
document.addEventListener("change", (e) => {
  const id = e.target.dataset.toggle;
  if (!id) return;

  const t = tasks.find((t) => t.id === id);
  if (t) {
    t.done = e.target.checked;
    saveTasks();
    refresh();
  }
});

/* ---- initial paint ---------------------------------------------- */

loadTasks();
