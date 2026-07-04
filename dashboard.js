let currentDepartment = "";
let currentFilter = "";
let allComplaints = [];

async function checkAuth() {
  const res = await fetch("/api/hod/me");
  const data = await res.json();

  if (!data.authenticated) {
    window.location.href = "/hod-login";
    return;
  }

  currentDepartment = data.department;
  document.getElementById("deptName").textContent = ` — ${currentDepartment} Dept.`;
  document.getElementById("deptLabelNav").textContent = currentDepartment;
  document.getElementById("authGate").classList.add("hidden");
  document.getElementById("dashContent").classList.remove("hidden");

  loadComplaints();
}

async function loadStats() {
  const res = await fetch(`/api/complaints/stats?department=${encodeURIComponent(currentDepartment)}`);
  const stats = await res.json();
  document.getElementById("statTotal").textContent = stats.Total ?? 0;
  document.getElementById("statPending").textContent = stats.Pending ?? 0;
  document.getElementById("statProgress").textContent = stats["In Progress"] ?? 0;
  document.getElementById("statResolved").textContent = stats.Resolved ?? 0;
}

async function loadComplaints() {
  const params = new URLSearchParams({ department: currentDepartment });
  if (currentFilter) params.set("status", currentFilter);

  const res = await fetch(`/api/complaints?${params.toString()}`);
  const data = await res.json();
  allComplaints = data.complaints || [];
  renderComplaints();
  loadStats();
}

function renderComplaints() {
  const list = document.getElementById("complaintList");
  const empty = document.getElementById("emptyState");

  list.innerHTML = "";

  if (!allComplaints.length) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  allComplaints.forEach((c) => {
    const card = document.createElement("div");
    card.className = "c-card";
    const badgeClass = c.status.replace(" ", "-");

    card.innerHTML = `
      <div class="c-top">
        <div>
          <div class="c-subject">${escapeHtml(c.subject)}</div>
          <div class="c-meta">${escapeHtml(c.name)} &middot; Roll ${escapeHtml(c.roll)} &middot; ${escapeHtml(c.semester)} &middot; Filed ${escapeHtml(c.created_at)}</div>
        </div>
        <span class="badge ${badgeClass}">${escapeHtml(c.status)}</span>
      </div>
      <p class="c-desc">${escapeHtml(c.description)}</p>
      <div class="c-controls">
        <select data-id="${c.id}" class="status-select">
          <option value="Pending" ${c.status === "Pending" ? "selected" : ""}>Pending</option>
          <option value="In Progress" ${c.status === "In Progress" ? "selected" : ""}>In Progress</option>
          <option value="Resolved" ${c.status === "Resolved" ? "selected" : ""}>Resolved</option>
        </select>
        <input type="text" class="remarks-input" data-id="${c.id}" placeholder="Add a remark for the student" value="${escapeHtml(c.remarks || "")}">
        <button class="btn btn-dark save-btn" data-id="${c.id}">Save</button>
      </div>
    `;
    list.appendChild(card);
  });

  document.querySelectorAll(".save-btn").forEach((btn) => {
    btn.addEventListener("click", () => saveComplaint(btn.dataset.id));
  });
}

async function saveComplaint(id) {
  const select = document.querySelector(`.status-select[data-id="${id}"]`);
  const remarksInput = document.querySelector(`.remarks-input[data-id="${id}"]`);

  try {
    const res = await fetch(`/api/complaints/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: select.value, remarks: remarksInput.value.trim() }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Update failed");

    showToast("Complaint updated.", "success");
    loadComplaints();
  } catch (err) {
    showToast(err.message || "Could not update complaint", "error");
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

document.addEventListener("DOMContentLoaded", () => {
  checkAuth();

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentFilter = tab.dataset.status;
      loadComplaints();
    });
  });

  document.getElementById("logoutLink").addEventListener("click", async (e) => {
    e.preventDefault();
    await fetch("/api/hod/logout", { method: "POST" });
    window.location.href = "/hod-login";
  });
});
