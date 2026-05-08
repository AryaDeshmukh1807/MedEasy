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
        const res = await fetch('http://localhost:5001/api/profile', {
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
      const res = await fetch('http://localhost:5001/api/metrics', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();

      if (res.ok && data.length > 0) {
        data.forEach(item => {
          // Format date nicely (MM/DD)
          const dateObj = new Date(item.date);
          const formattedDate = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`; 
          
          userData.metrics.dates.push(formattedDate);
          userData.metrics.bloodGlucose.push(item.bloodSugar || null);
          userData.metrics.bloodPressureSys.push(item.systolicBP || null);
          userData.metrics.bloodPressureDia.push(item.diastolicBP || null);
          userData.metrics.heartRate.push(item.heartRate || null);
        });

        // Update the top summary cards with the most recent entry
        const lastEntry = data[data.length - 1];
        userData.currentValues.bp = `${lastEntry.systolicBP || '--'}/${lastEntry.diastolicBP || '--'} mmHg`;
        userData.currentValues.glucose = `${lastEntry.bloodSugar || '--'} mg/dL`;
        userData.currentValues.hr = `${lastEntry.heartRate || '--'} bpm`;
      }
    } catch (err) {
      console.error("⚠️ Error fetching metrics from DB:", err);
    }
  }

  // 🚨 WAIT for the database to return the data before doing UI work
  await fetchMetrics();

  // Safely update top metric cards (Only if they exist on the current page)
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
          spanGaps: true // ✅ Allows the line to connect across missing PDF data
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
    if (!insightsBox) return; // Skip if on upload page

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
        const res = await fetch('http://localhost:5001/api/metrics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ bloodSugar, systolicBP, diastolicBP, heartRate, weight }),
        });

        const data = await res.json();
        if (res.ok) {
          alert('✅ Metrics added successfully!');
          modal.classList.remove('active');
          metricsForm.reset();

          // Update displayed text metrics at top
          if (bpEl) bpEl.textContent = `${systolicBP || '--'}/${diastolicBP || '--'} mmHg`;
          if (glucoseEl) glucoseEl.textContent = `${bloodSugar || '--'} mg/dL`;
          if (hrEl) hrEl.textContent = `${heartRate || '--'} bpm`;

          // Add data to chart arrays
          const todayObj = new Date();
          const todayFormatted = `${todayObj.getMonth() + 1}/${todayObj.getDate()}`;
          
          userData.metrics.dates.push(todayFormatted);
          userData.metrics.bloodGlucose.push(bloodSugar);
          userData.metrics.bloodPressureSys.push(systolicBP);
          userData.metrics.bloodPressureDia.push(diastolicBP);
          userData.metrics.heartRate.push(heartRate);

          // Update charts dynamically
          if (glucoseChart) {
            glucoseChart.data.labels = userData.metrics.dates;
            glucoseChart.data.datasets[0].data = userData.metrics.bloodGlucose;
            glucoseChart.update('active');
          }
          if (bpChart) {
            bpChart.data.labels = userData.metrics.dates;
            bpChart.data.datasets[0].data = userData.metrics.bloodPressureSys;
            bpChart.data.datasets[1].data = userData.metrics.bloodPressureDia;
            bpChart.update('active');
          }
          if (hrChart) {
            hrChart.data.labels = userData.metrics.dates;
            hrChart.data.datasets[0].data = userData.metrics.heartRate;
            hrChart.update('active');
          }

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
  // Supports multiple ID variations depending on what you used in upload-report.html
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

      // Change button text to show loading state
      const submitBtn = uploadForm.querySelector('button[type="submit"]');
      const originalText = submitBtn ? submitBtn.innerHTML : "Upload";
      if (submitBtn) {
        submitBtn.innerHTML = "Scanning PDF... ⏳";
        submitBtn.disabled = true;
      }

      try {
        const res = await fetch('http://localhost:5001/api/reports/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }, // Do NOT set Content-Type for FormData
          body: formData
        });

        const data = await res.json();
        
        if (res.ok) {
          alert("✅ Analysis Complete!");
          
          // Show extraction details and warnings
          if (data.extraction) {
            console.log("📊 Extraction Method:", data.extraction.method);
            console.log("📈 Metrics Found:", data.extraction.metricsFound);
          }
          if (data.warning) {
            console.warn("⚠️ ", data.warning);
            alert("ℹ️ " + data.warning);
          }
          
          // Check if we are currently on the dashboard page
          if (document.getElementById('glucoseChart')) {
             // We are on the dashboard: Live Update
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
             // We are on the separate Upload page: Redirect to Dashboard!
             window.location.href = '../index/index.html'; 
          }

        } else {
          alert("⚠️ Analysis failed: " + (data.message || "Unknown error"));
          if (data.error) {
            console.error("ErrorDetails:", data.error);
          }
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