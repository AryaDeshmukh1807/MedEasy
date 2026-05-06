document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("signupForm");
  const messageBox = document.createElement("p");
  messageBox.id = "message";
  form.appendChild(messageBox);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    if (!name || !email || !password) {
      messageBox.textContent = "⚠️ Please fill in all fields.";
      messageBox.style.color = "red";
      return;
    }

    try {
      const res = await fetch("http://localhost:5000/api/auth/register",{
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (res.ok) {
        messageBox.textContent = "✅ Signup successful! Redirecting to login...";
        messageBox.style.color = "green";
        setTimeout(() => (window.location.href = "../login/login.html"), 2000);
      } else {
        messageBox.textContent = `❌ ${data.message || "Signup failed. Please try again."}`;
        messageBox.style.color = "red";
      }
    } catch (error) {
      console.error("Signup failed:", error);
      messageBox.textContent = "⚠️ Server error. Please try again later.";
      messageBox.style.color = "red";
    }
  });
});
