document.addEventListener("DOMContentLoaded", async () => {
  const medForm = document.getElementById("medForm");
  const medList = document.getElementById("medList");
  const medInfo = document.getElementById("medInfo");

  const API_BASE = "http://localhost:5000";
  const token = localStorage.getItem("token");

  if (!token) {
    alert("Session expired. Please log in again.");
    window.location.href = "../login/login.html";
    return;
  }

  /* ============================================================
     ✅ Load all medications
  ============================================================ */
  async function loadMeds() {
    try {
      const res = await fetch(`${API_BASE}/api/medications`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const meds = await res.json();
      console.log("📦 Loaded medications:", meds);
      renderMeds(meds);
    } catch (err) {
      console.error("⚠️ Error loading medications:", err);
      medList.innerHTML =
        "<p>⚠️ Error loading medications. Please try again later.</p>";
    }
  }

  /* ============================================================
     ✅ Render medication cards
  ============================================================ */
  function renderMeds(meds) {
    medList.innerHTML = "";

    if (!Array.isArray(meds) || meds.length === 0) {
      medList.innerHTML = "<p class='empty-msg'>No medications added yet.</p>";
      return;
    }

    meds.forEach((med) => {
      const card = document.createElement("div");
      card.classList.add("med-card");

      card.innerHTML = `
        <div class="med-info">
          <strong>${med.name}</strong> — ${med.dosage}
          <small class="med-time">${med.time || "⏰ Not specified"}</small>
        </div>
        <div class="med-actions">
          <button class="view-btn">
            <span class="view-text">🔍 View</span>
            <span class="spinner hidden"></span>
          </button>
          <button class="delete-btn">🗑 Delete</button>
        </div>
      `;

      // ✅ Fetch details with spinner animation
      const viewBtn = card.querySelector(".view-btn");
      const spinner = viewBtn.querySelector(".spinner");
      const viewText = viewBtn.querySelector(".view-text");

      viewBtn.onclick = async () => {
        // Show spinner and disable button
        spinner.classList.remove("hidden");
        viewText.textContent = "Loading...";
        viewBtn.disabled = true;

        // Show loader in info section
        medInfo.innerHTML = `
          <div class="loading-spinner">
            <div class="spinner"></div>
            <p>Fetching ${med.name} details...</p>
          </div>
        `;

        await fetchMedicineInfo(med.name);

        // Restore button state
        spinner.classList.add("hidden");
        viewText.textContent = "🔍 View";
        viewBtn.disabled = false;
      };

      // ✅ Delete medication
      card.querySelector(".delete-btn").onclick = async () => {
        if (confirm(`Delete ${med.name}?`)) await deleteMedication(med._id);
      };

      medList.appendChild(card);
      setTimeout(() => card.classList.add("show"), 100);
    });
  }

  /* ============================================================
     ✅ Fetch medicine info from backend (online + cache)
  ============================================================ */
  async function fetchMedicineInfo(name) {
    try {
      const res = await fetch(`${API_BASE}/api/medications/info/${name}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      console.log("🌐 Medicine info fetched:", data);

      if (res.ok) {
        medInfo.innerHTML = `
          <h3>${data.name}</h3>
          <p><strong>Description:</strong> ${data.description}</p>
          <p><strong>Side Effects:</strong> ${
            Array.isArray(data.side_effects)
              ? data.side_effects.join(", ")
              : data.side_effects
          }</p>
        `;
      } else {
        medInfo.innerHTML = `<p class="error">⚠️ ${
          data.message || "Could not fetch info online."
        }</p>`;
      }
    } catch (err) {
      medInfo.innerHTML =
        "<p class='error'>⚠️ Unable to fetch online info right now.</p>";
      console.error("❌ Medicine info fetch error:", err);
    }
  }

  /* ============================================================
     ✅ Delete a medication
  ============================================================ */
  async function deleteMedication(id) {
    try {
      const res = await fetch(`${API_BASE}/api/medications/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (res.ok) {
        alert("✅ Medication deleted!");
        await loadMeds();
      } else alert(data.message || "Error deleting medication.");
    } catch (err) {
      console.error("❌ Delete error:", err);
      alert("⚠️ Server error. Please try again.");
    }
  }

  /* ============================================================
     ✅ Add a new medication
  ============================================================ */
  medForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("medName").value.trim();
    const dosage = document.getElementById("dosage").value.trim();

    if (!name || !dosage) return alert("⚠️ Please fill all fields.");

    try {
      const res = await fetch(`${API_BASE}/api/medications`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, dosage }),
      });

      const data = await res.json();
      if (res.ok) {
        alert("✅ Medication added!");
        medForm.reset();
        await loadMeds();
      } else alert(`❌ ${data.message || "Error adding medication."}`);
    } catch (err) {
      console.error("❌ Add med error:", err);
      alert("⚠️ Unable to connect to server.");
    }
  });

  /* ============================================================
     🚀 Initial load
  ============================================================ */
  await loadMeds();
});
