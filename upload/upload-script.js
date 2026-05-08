// upload-script.js
document.addEventListener('DOMContentLoaded', () => {
  const uploadForm = document.getElementById('uploadForm');
  const uploadStatus = document.getElementById('uploadStatus');
  const fileInput = document.getElementById('reportFile');
  const reportContainer = document.getElementById('reportContainer');
  const fileLabel = document.querySelector('.file-label');
  const fileNameEl = document.querySelector('.file-name');

  const API_BASE = "http://localhost:5001";
  const token = localStorage.getItem("token");

  // immediate check
  if (!token) {
    alert("Please log in first.");
    window.location.href = "../login/login.html";
    return;
  }

  // show chosen filename (if you added a .file-label / .file-name UI)
  if (fileInput && fileNameEl) {
    fileInput.addEventListener('change', () => {
      const f = fileInput.files[0];
      fileNameEl.textContent = f ? f.name : 'No file selected';
    });
  }

  // ===== Upload report =====
  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Debug: log token length (don't print full token in production)
    console.log('Uploading — token present? ', !!token, ' token length:', token?.length);

    const title = document.getElementById('reportTitle').value.trim();
    const notes = document.getElementById('reportNotes').value.trim();
    const file = fileInput.files[0];

    if (!file) {
      showAlert("⚠️ Please select a file.", "warning");
      return;
    }

    const formData = new FormData();
    formData.append("reportFile", file);
    formData.append("title", title);
    formData.append("notes", notes);

    showAlert("⏳ Uploading report...", "");

    try {
      const res = await fetch(`${API_BASE}/api/reports/upload`, {
        method: "POST",
        // IMPORTANT: do NOT set Content-Type when sending FormData — the browser sets the multipart boundary
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      // If the token is invalid/expired, server should return 401
      if (res.status === 401) {
        showAlert("⚠️ Session expired. Redirecting to login...", "warning");
        console.warn('Upload blocked: 401 Unauthorized — token invalid/expired.');
        // clear local token to prevent repeated failures
        localStorage.removeItem('token');
        setTimeout(() => window.location.href = "../login/login.html", 1000);
        return;
      }

      const data = await res.json();

      if (res.ok) {
        showAlert("✅ Report uploaded successfully!", "success");
        
        // Show extraction details for debugging
        if (data.extraction) {
          console.log("📊 PDF Extraction Details:");
          console.log("  Method:", data.extraction.method);
          console.log("  Metrics Found:", data.extraction.metricsFound);
        }
        
        // Show warning if metrics are incomplete
        if (data.warning) {
          showAlert("ℹ️ " + data.warning, "warning");
          console.warn("⚠️ Extraction Warning:", data.warning);
        }
        
        uploadForm.reset();
        if (fileNameEl) fileNameEl.textContent = 'No file selected';
        loadReports();
      } else {
        console.error('Upload failed:', res.status, data);
        showAlert(`❌ ${data.message || 'Upload failed'}${data.error ? ' - ' + data.error : ''}`, "danger");
      }
    } catch (err) {
      console.error('Upload error:', err);
      showAlert("❌ Server error while uploading.", "danger");
    }
  });

  // ===== Load all reports =====
  async function loadReports() {
    try {
      const res = await fetch(`${API_BASE}/api/reports`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        showAlert("⚠️ Session expired. Redirecting to login...", "warning");
        localStorage.removeItem('token');
        setTimeout(() => window.location.href = "../login/login.html", 800);
        return;
      }

      const reports = await res.json();
      renderReports(reports);
    } catch (err) {
      console.error("Error loading reports:", err);
      showAlert("⚠️ Could not load reports.", "warning");
    }
  }

  // ===== Render report cards =====
  function renderReports(reports) {
    reportContainer.innerHTML = "";

    if (!Array.isArray(reports) || reports.length === 0) {
      reportContainer.innerHTML = `<p class="empty-msg">No reports uploaded yet.</p>`;
      return;
    }

    reports.forEach((r) => {
      const date = new Date(r.uploadDate).toLocaleDateString();
      const card = document.createElement("div");
      card.classList.add("report-card");

      // choose icon by extension
      const ext = (r.fileName || '').split('.').pop()?.toLowerCase() || '';
      const iconName = ext === 'pdf' ? 'file-text' : (['jpg','jpeg','png'].includes(ext) ? 'image' : 'file-text');

      card.innerHTML = `
        <div class="report-info" style="display:flex; gap:12px; align-items:center;">
          <i data-lucide="${iconName}" class="report-icon"></i>
          <div>
            <h3>${r.originalName}</h3>
            <p class="upload-date">📅 ${date}</p>
          </div>
        </div>
        <div class="report-actions">
          <a href="${API_BASE}/uploads/${r.fileName}" target="_blank" class="btn-view">
            <i data-lucide="eye"></i> View
          </a>
          <button class="btn-rename" data-id="${r._id}">
            <i data-lucide="edit-3"></i> Rename
          </button>
          <button class="btn-delete" data-id="${r._id}">
            <i data-lucide="trash-2"></i> Delete
          </button>
        </div>
      `;

      card.querySelector(".btn-rename").onclick = () => renameReport(r._id);
      card.querySelector(".btn-delete").onclick = () => deleteReport(r._id);

      reportContainer.appendChild(card);
      // re-create lucide icons in the injected markup
      lucide.createIcons();
    });
  }

  // ===== Rename
  async function renameReport(id) {
    const newName = prompt("Enter new report name:");
    if (!newName) return;
    try {
      const res = await fetch(`${API_BASE}/api/reports/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ newName }),
      });

      if (res.status === 401) {
        showAlert("⚠️ Session expired. Redirecting...", "warning");
        localStorage.removeItem('token');
        setTimeout(() => window.location.href = "../login/login.html", 800);
        return;
      }

      if (res.ok) {
        showAlert("✅ Report renamed successfully.", "success");
        loadReports();
      } else {
        const data = await res.json();
        showAlert(`❌ ${data.message || 'Rename failed'}`, "danger");
      }
    } catch (err) {
      console.error(err);
      showAlert("⚠️ Server error while renaming.", "warning");
    }
  }

  // ===== Delete
  async function deleteReport(id) {
    if (!confirm("Are you sure you want to delete this report?")) return;
    try {
      const res = await fetch(`${API_BASE}/api/reports/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        showAlert("⚠️ Session expired. Redirecting...", "warning");
        localStorage.removeItem('token');
        setTimeout(() => window.location.href = "../login/login.html", 800);
        return;
      }

      if (res.ok) {
        showAlert("🗑️ Report deleted successfully.", "success");
        loadReports();
      } else {
        const data = await res.json();
        showAlert(`❌ ${data.message || 'Delete failed'}`, "danger");
      }
    } catch (err) {
      console.error(err);
      showAlert("⚠️ Server error while deleting.", "warning");
    }
  }

  // ===== Alert helper
  function showAlert(message, type) {
    uploadStatus.className = `alert-box ${type || ''}`.trim();
    uploadStatus.innerHTML = `<p>${message}</p>`;
  }

  // initial load
  loadReports();
});
