document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("complaintForm");
  const submitBtn = document.getElementById("submitBtn");
  const formCard = document.querySelector(".form-card");
  const formHead = document.querySelector(".form-head");
  const successCard = document.getElementById("successCard");
  const refId = document.getElementById("refId");
  const newComplaintBtn = document.getElementById("newComplaintBtn");

  const fields = ["name", "roll", "semester", "department", "subject", "description"];

  function validate() {
    let valid = true;
    fields.forEach((id) => {
      const el = document.getElementById(id);
      if (!el.value.trim()) {
        el.classList.add("invalid");
        valid = false;
      } else {
        el.classList.remove("invalid");
      }
    });
    return valid;
  }

  fields.forEach((id) => {
    document.getElementById(id).addEventListener("input", (e) => {
      if (e.target.value.trim()) e.target.classList.remove("invalid");
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!validate()) {
      showToast("Please fill in all required fields.", "error");
      return;
    }

    const payload = {};
    fields.forEach((id) => (payload[id] = document.getElementById(id).value.trim()));

    submitBtn.classList.add("loading");
    submitBtn.disabled = true;

    try {
      const res = await fetch("/api/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Something went wrong");

      formCard.style.display = "none";
      formHead.style.display = "none";
      refId.textContent = "#" + data.complaint.id;
      successCard.classList.add("show");
      showToast("Complaint submitted successfully.", "success");
    } catch (err) {
      showToast(err.message || "Could not reach the server. Please try again.", "error");
    } finally {
      submitBtn.classList.remove("loading");
      submitBtn.disabled = false;
    }
  });

  newComplaintBtn?.addEventListener("click", () => {
    form.reset();
    successCard.classList.remove("show");
    formCard.style.display = "block";
    formHead.style.display = "block";
  });
});
