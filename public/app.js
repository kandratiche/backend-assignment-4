let chart;

function setMsg(text) {
  document.getElementById("msg").textContent = text || "";
}

function fmt(n) {
  if (n === null || n === undefined) return "-";
  return Number(n).toFixed(3);
}

async function loadData() {
  setMsg("");

  const field = document.getElementById("field").value;
  const start = document.getElementById("start").value;
  const end = document.getElementById("end").value;
  const chartType = document.getElementById("chartType").value;

  const qs = new URLSearchParams({ field });
  if (start) qs.set("start_date", start);
  if (end) qs.set("end_date", end);

  const r1 = await fetch(`/api/measurements?${qs.toString()}`);
  const data = await r1.json();
  if (!r1.ok) {
    setMsg(data.error || "Failed to load data");
    return;
  }

  const labels = data.map(d => new Date(d.timestamp).toLocaleString());
  const values = data.map(d => d[field]);

  const r2 = await fetch(`/api/measurements/metrics?${qs.toString()}`);
  const metrics = await r2.json();
  if (!r2.ok) {
    setMsg(metrics.error || "Failed to load metrics");
    return;
  }

  document.getElementById("mAvg").textContent = fmt(metrics.avg);
  document.getElementById("mMin").textContent = fmt(metrics.min);
  document.getElementById("mMax").textContent = fmt(metrics.max);
  document.getElementById("mStd").textContent = fmt(metrics.stdDev);
  document.getElementById("mCount").textContent = metrics.count ?? "-";

  const ctx = document.getElementById("chart");
  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: chartType,
    data: {
      labels,
      datasets: [{ label: field, data: values }]
    },
    options: { responsive: true }
  });
}

document.getElementById("loadBtn").addEventListener("click", () => {
  loadData().catch(err => setMsg(err.message));
});