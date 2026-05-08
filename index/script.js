// ✅ One place to change your backend URL
const API_BASE = "https://medeasy-backend.onrender.com";

document.addEventListener('DOMContentLoaded', async () => {
  console.log("✅ MedEase Dashboard Loaded");

  // ===================== USER AUTH & PROFILE =====================
  const userNameElement = document.getElementById('userName');
  const token = localStorage.getItem('token');
  const storedName = localStorage.getItem('userName');

  if (!token) {
    window.location.href = '../login/login.html';
    return;
  }

  if (userNameElement) {
    if (storedName) {
      userNameElement.textContent = storedName;
    } else {
      try {
        const res = await fetch(`${API_BASE}/api/profile`, {   // ✅ fixed
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok && data.name) {
          userNameElement.textContent = data.name;
          localStorage.setItem('userName', data.name);
        } else {
          userNameElement.textContent = 'User';
        }
      } catch {
        userNameElement.textContent = 'User';
      }
    }
  }

  // ===================== STATE MANAGEMENT =====================
  let userData = {
    metrics: { dates: [], bloodGlucose: [], bloodPressureSys: [], bloodPressureDia: [], heartRate: [] },
    currentValues: { bp: '--/-- mmHg', glucose: '-- mg/dL', hr: '-- bpm' }
  };

  // ===================== FETCH DATA FROM DB =====================
  async function fetchMetrics() {
    try {
      const res = await fetch(`${API_BASE}/api/metrics`, {   // ✅ fixed
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();

      if (res.ok && data.length > 0) {
        data.forEach(item => {
          const dateObj = new Date(item.date);
          const formattedDate = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;
          
          userData.metrics.dates.push(formattedDate);
          userData.metrics.bloodGlucose.push(item.bloodSugar || null);
          userData.metrics.bloodPressureSys.push(item.systolicBP || null);
          userData.metrics.bloodPressureDia.push(item.diastolicBP || null);
          userData.metrics.heartRate.push(item.heartRate || null);
        });

        const lastEntry = data[data.length - 1];
        userData.currentValues.bp = `${lastEntry.systolicBP || '--'}/${lastEntry.diastolicBP || '--'} mmHg`;
        userData.currentValues.glucose = `${lastEntry.bloodSugar || '--'} mg/dL`;
        userData.currentValues.hr = `${lastEntry.heartRate || '--'} bpm`;
      }
    } catch (err) {
      console.error("⚠️ Error fetching metrics from DB:", err);
    }
  }

  await fetchMetrics();

  const bpEl = document.getElementById('bpValue');
  const glucoseEl = document.getElementById('glucoseValue');
  const hrEl = document.getElementById('hrValue');

  if (bpEl) bpEl.textContent = userData.currentValues.bp;
  if (glucoseEl) glucoseEl.textContent = userData.currentValues.glucose;
  if (hrEl) hrEl.textContent = userData.currentValues.hr;

  // ===================== CHART HELPERS =====================
  const createChart = (id, labels, data, label, color) => {
    const ctx = document.getElementById(id);
    if (!ctx) return null;

    return new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label,
          data,
          borderColor: color,
          backgroundColor: `${color}33`,
          pointBackgroundColor: color,
          tension: 0.3,
          fill: true,
          spanGaps: true
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 1000, easing: 'easeOutQuart' },
        scales: {
          y: { title: { display: true, text: label, color: '#7f8c8d' } },
          x: { title: { display: true, text: 'Date', color: '#7f8c8d' } },
        },
        plugins: { legend: { display: false } },
      },
    });
  };

  // ===================== DRAW CHARTS =====================
  const glucoseChart = createChart('glucoseChart', userData.metrics.dates, userData.metrics.bloodGlucose, 'Blood Glucose (mg/dL)', '#3498db');
  
  const bpCtx = document.getElementById('bpChart');
  const bpChart = bpCtx ? new Chart(bpCtx, {
    type: 'line',
    data: {
      labels: userData.metrics.dates,
      datasets: [
        { label: 'Systolic', data: userData.metrics.bloodPressureSys, borderColor: '#e73c3c', backgroundColor: '#e74c3c33', tension: 0.3, fill: true, spanGaps: true },
        { label: 'Diastolic', data: userData.metrics.bloodPressureDia, borderColor: '#daf10f', backgroundColor: '#f1c40f33', tension: 0.3, fill: true, spanGaps: true },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 1000, easing: 'easeOutQuart' },
      plugins: { legend: { position: 'top' } },
    },
  }) : null;

  const hrChart = createChart('hrChart', userData.metrics.dates, userData.metrics.heartRate, 'Heart Rate (bpm)', '#2ecc71');

  // ===================== HEALTH INSIGHTS =====================
  const insightsBox = document.getElementById('insightsBox');

  const updateInsights = () => {
    if (!insightsBox) return;

    const validGlucose = userData.metrics.bloodGlucose.filter(v => v !== null).slice(-3);
    const validBpSys = userData.metrics.bloodPressureSys.filter(v => v !== null).slice(-3);
    const validHr = userData.metrics.heartRate.filter(v => v !== null).slice(-3);

    let alertMessage = '';
    if (validGlucose.some(v => v > 125)) alertMessage += '🚨 High Glucose detected. ';
    if (validBpSys.some(v => v > 140)) alertMessage += '⚠️ High Blood Pressure. ';
    if (validHr.some(v => v > 100)) alertMessage += '⚠️ High Heart Rate. ';
    
    if (!alertMessage) alertMessage = '✅ All recent metrics are within normal range.';

    insightsBox.innerHTML = `<h3>🩺 Current Health Insights</h3><p>${alertMessage}</p>`;
  };

  updateInsights();

  // ===================== MODAL LOGIC =====================
  const addMetricsBtn = document.getElementById('addMetricsBtn');
  const modal = document.getElementById('metricsModal');
  const closeModal = document.getElementById('closeModal');
  const metricsForm = document.getElementById('metricsForm');

  if (addMetricsBtn && modal && closeModal) {
    addMetricsBtn.addEventListener('click', () => modal.classList.add('active'));
    closeModal.addEventListener('click', () => modal.classList.remove('active'));
  }

  // ===================== FORM SUBMISSION (MANUAL ENTRY) =====================
  if (metricsForm) {
    metricsForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const bloodSugar = parseFloat(document.getElementById('bloodSugar').value) || null;
      const systolicBP = parseFloat(document.getElementById('systolic').value) || null;
      const diastolicBP = parseFloat(document.getElementById('diastolic').value) || null;
      const heartRate = parseFloat(document.getElementById('heartRate').value) || null;
      const weight = parseFloat(document.getElementById('weight').value) || null;

      try {
        const res = await fetch(`${API_BASE}/api/metrics`, {   // ✅ fixed
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ bloodSugar, systolicBP, diastolicBP, heartRate, weight }),
        });

        const data = await res.json();
        if (res.ok) {
          alert('✅ Metrics added successfully!');
          modal.classList.remove('active');
          metricsForm.reset();

          if (bpEl) bpEl.textContent = `${systolicBP || '--'}/${diastolicBP || '--'} mmHg`;
          if (glucoseEl) glucoseEl.textContent = `${bloodSugar || '--'} mg/dL`;
          if (hrEl) hrEl.textContent = `${heartRate || '--'} bpm`;

          const todayObj = new Date();
          const todayFormatted = `${todayObj.getMonth() + 1}/${todayObj.getDate()}`;
          
          userData.metrics.dates.push(todayFormatted);
          userData.metrics.bloodGlucose.push(bloodSugar);
          userData.metrics.bloodPressureSys.push(systolicBP);
          userData.metrics.bloodPressureDia.push(diastolicBP);
          userData.metrics.heartRate.push(heartRate);

          if (glucoseChart) { glucoseChart.data.labels = userData.metrics.dates; glucoseChart.data.datasets[0].data = userData.metrics.bloodGlucose; glucoseChart.update('active'); }
          if (bpChart) { bpChart.data.labels = userData.metrics.dates; bpChart.data.datasets[0].data = userData.metrics.bloodPressureSys; bpChart.data.datasets[1].data = userData.metrics.bloodPressureDia; bpChart.update('active'); }
          if (hrChart) { hrChart.data.labels = userData.metrics.dates; hrChart.data.datasets[0].data = userData.metrics.heartRate; hrChart.update('active'); }

          updateInsights();
        } else {
          alert(data.message || 'Error saving metrics.');
        }
      } catch (err) {
        console.error('❌ Error saving metrics:', err);
        alert('Server error while saving metrics.');
      }
    });
  }

  // ===================== PDF UPLOAD LOGIC =====================
  const uploadForm = document.getElementById('uploadForm') || document.getElementById('reportUploadForm');

  if (uploadForm) {
    uploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const formData = new FormData();
      const fileField = document.getElementById('reportFileInput') || document.getElementById('reportFile') || document.querySelector('input[type="file"]');
      
      if (!fileField || !fileField.files[0]) {
        alert("Please select a PDF file to upload.");
        return;
      }

      formData.append('reportFile', fileField.files[0]);

      const submitBtn = uploadForm.querySelector('button[type="submit"]');
      const originalText = submitBtn ? submitBtn.innerHTML : "Upload";
      if (submitBtn) {
        submitBtn.innerHTML = "Scanning PDF... ⏳";
        submitBtn.disabled = true;
      }

      try {
        const res = await fetch(`${API_BASE}/api/reports/upload`, {   // ✅ fixed
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        });

        const data = await res.json();
        
        if (res.ok) {
          alert("✅ Analysis Complete!");
          
          if (data.extraction) {
            console.log("📊 Extraction Method:", data.extraction.method);
            console.log("📈 Metrics Found:", data.extraction.metricsFound);
          }
          if (data.warning) {
            console.warn("⚠️ ", data.warning);
            alert("ℹ️ " + data.warning);
          }
          
          if (document.getElementById('glucoseChart')) {
             userData.metrics = { dates: [], bloodGlucose: [], bloodPressureSys: [], bloodPressureDia: [], heartRate: [] };
             await fetchMetrics();
             
             if (bpEl) bpEl.textContent = userData.currentValues.bp;
             if (glucoseEl) glucoseEl.textContent = userData.currentValues.glucose;
             if (hrEl) hrEl.textContent = userData.currentValues.hr;

             if (glucoseChart) { glucoseChart.data.labels = userData.metrics.dates; glucoseChart.data.datasets[0].data = userData.metrics.bloodGlucose; glucoseChart.update(); }
             if (bpChart) { bpChart.data.labels = userData.metrics.dates; bpChart.data.datasets[0].data = userData.metrics.bloodPressureSys; bpChart.data.datasets[1].data = userData.metrics.bloodPressureDia; bpChart.update(); }
             if (hrChart) { hrChart.data.labels = userData.metrics.dates; hrChart.data.datasets[0].data = userData.metrics.heartRate; hrChart.update(); }
             
             updateInsights();
             uploadForm.reset();
          } else {
             window.location.href = '../index/index.html';
          }

        } else {
          alert("⚠️ Analysis failed: " + (data.message || "Unknown error"));
          if (data.error) console.error("ErrorDetails:", data.error);
        }
      } catch (err) {
        console.error("❌ Upload error:", err);
        alert("❌ Server connection error during upload.");
      } finally {
        if (submitBtn) {
          submitBtn.innerHTML = originalText;
          submitBtn.disabled = false;
        }
      }
    });
  }
});