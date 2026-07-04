document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("hodLoginForm");
  const loginBtn = document.getElementById("loginBtn");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email");
    const password = document.getElementById("password");
    const department = document.getElementById("department");

    let valid = true;
    [email, password, department].forEach((el) => {
      if (!el.value.trim()) {
        el.classList.add("invalid");
        valid = false;
      } else {
        el.classList.remove("invalid");
      }
    });

    if (!valid) {
      showToast("Please fill in all fields.", "error");
      return;
    }

    loginBtn.classList.add("loading");
    loginBtn.disabled = true;

    try {
      const res = await fetch("/api/hod/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.value.trim(),
          password: password.value,
          department: department.value,
        }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Login failed");

      showToast(`Welcome back, ${data.department} HOD.`, "success");
      setTimeout(() => (window.location.href = "/dashboard"), 500);
    } catch (err) {
      showToast(err.message || "Login failed", "error");
    } finally {
      loginBtn.classList.remove("loading");
      loginBtn.disabled = false;
    }
  });
});
