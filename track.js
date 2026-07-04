function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("trackForm");
  const results = document.getElementById("results");
  const trackBtn = document.getElementById("trackBtn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const roll = document.getElementById("rollInput").value.trim();
    if (!roll) return;

    trackBtn.disabled = true;
    results.innerHTML = "";

    try {
      const res = await fetch(`/api/complaints?roll=${encodeURIComponent(roll)}`);
      const data = await res.json();
      const complaints = data.complaints || [];

      if (!complaints.length) {
        results.innerHTML = `<div class="t-empty">No complaints found for roll number "${escapeHtml(roll)}".</div>`;
        return;
      }

      complaints.forEach((c) => {
        const badgeClass = c.status.replace(" ", "-");
        const card = document.createElement("div");
        card.className = "t-card";
        card.innerHTML = `
          <div class="t-top">
            <div>
              <div class="t-subject">${escapeHtml(c.subject)}</div>
              <div class="t-meta">${escapeHtml(c.department)} &middot; Filed ${escapeHtml(c.created_at)}</div>
            </div>
            <span class="badge ${badgeClass}">${escapeHtml(c.status)}</span>
          </div>
          ${c.remarks ? `<div class="t-remarks">HOD remark: ${escapeHtml(c.remarks)}</div>` : ""}
        `;
        results.appendChild(card);
      });
    } catch (err) {
      showToast("Could not reach the server. Please try again.", "error");
    } finally {
      trackBtn.disabled = false;
    }
  });
});
