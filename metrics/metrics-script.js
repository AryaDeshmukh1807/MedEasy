document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("metricsForm");
  const insightsBox = document.getElementById("insights");
  const ctx = document.getElementById("metricsChart").getContext("2d");

  const API_BASE = "http://localhost:5001";
  let chart;

  async function loadMetrics() {
    const token = localStorage.getItem("token");
    if (!token) {
      alert("Please log in first");
      window.location.href = "../login/login.html";
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/metrics`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (res.ok) renderChart(data);
      else insightsBox.textContent = "⚠️ Unable to fetch metrics.";
    } catch (err) {
      insightsBox.textContent = "Server error loading metrics.";
    }
  }

  function renderChart(data) {
    const labels = data.map((m) => new Date(m.date).toLocaleDateString());
    const sugar = data.map((m) => m.bloodSugar || null);
    const systolic = data.map((m) => m.systolicBP || null);
    const diastolic = data.map((m) => m.diastolicBP || null);
    const heart = data.map((m) => m.heartRate || null);

    if (chart) chart.destroy();

    chart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "Blood Sugar", data: sugar, borderColor: "#ef5350", fill: false, spanGaps: true },
          { label: "Systolic BP", data: systolic, borderColor: "#42a5f5", fill: false, spanGaps: true },
          { label: "Diastolic BP", data: diastolic, borderColor: "#e4dd05", fill: false, spanGaps: true },
          { label: "Heart Rate", data: heart, borderColor: "#ab47bc", fill: false, spanGaps: true },
        ],
      },
      options: { 
        responsive: true, 
        plugins: { legend: { position: "bottom" } },
        scales: { y: { beginAtZero: false } } 
      },
    });

    generateInsights(data);
  }

  function generateInsights(data) {
    if (data.length === 0) {
      insightsBox.textContent = "Add some metrics to see insights!";
      return;
    }

    // ✅ Fix: Only calculate averages for fields that actually HAVE data (ignores nulls from PDF scans)
    const getAvg = (arr, key) => {
        const filtered = arr.map(m => m[key]).filter(v => v != null && !isNaN(v));
        return filtered.length ? filtered.reduce((a, b) => a + b, 0) / filtered.length : 0;
    };

    const avgSys = getAvg(data, 'systolicBP');
    const avgDia = getAvg(data, 'diastolicBP');
    const avgSugar = getAvg(data, 'bloodSugar');
    const avgHeart = getAvg(data, 'heartRate');

    let insights = `<h3>🩺 Health Insights</h3>`;
    insights += `<p>Average Blood Pressure: <b>${avgSys.toFixed(1)}/${avgDia.toFixed(1)} mmHg</b></p>`;
    insights += `<p>Average Blood Sugar: <b>${avgSugar.toFixed(1)} mg/dL</b></p>`;
    insights += `<p>Average Heart Rate: <b>${avgHeart.toFixed(1)} bpm</b></p>`;

    // Insights based on latest data or averages
    if (avgSys > 130 || avgDia > 80) insights += `<p style="color: #e74c3c;">⚠️ Your BP is above normal. Consider monitoring it daily.</p>`;
    if (avgSugar > 125) insights += `<p style="color: #e74c3c;">⚠️ Blood sugar is slightly high. Review your diet.</p>`;
    if (avgHeart > 100) insights += `<p style="color: #e74c3c;">⚠️ Your resting heart rate seems elevated.</p>`;

    insightsBox.innerHTML = insights;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("token");
    
    // ✅ Fix: Use || null so empty form fields don't save as 0
    const payload = {
        bloodSugar: parseFloat(document.getElementById("bloodSugar").value) || null,
        systolicBP: parseFloat(document.getElementById("systolicBP").value) || null,
        diastolicBP: parseFloat(document.getElementById("diastolicBP").value) || null,
        heartRate: parseFloat(document.getElementById("heartRate").value) || null,
        weight: parseFloat(document.getElementById("weight").value) || null
    };

    try {
      const res = await fetch(`${API_BASE}/api/metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        alert("✅ Metrics saved successfully!");
        form.reset();
        loadMetrics();
      } else {
        alert("⚠️ Could not save metrics.");
      }
    } catch (err) {
      alert("❌ Server error while saving metrics.");
    }
  });

  loadMetrics();
});