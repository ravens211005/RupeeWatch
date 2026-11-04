import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, Activity, CalendarClock, ShieldCheck, RefreshCw } from "lucide-react";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

const INDICATORS = [
  { value: "CPI_Inflation", label: "CPI inflation" },
  { value: "WPI_Inflation", label: "WPI inflation" },
  { value: "FX_MoM_Change", label: "INR–USD monthly change" },
  { value: "IIP_YoY_Growth", label: "IIP growth" },
];

const number = (value, digits = 2) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : "—";
};

const dateLabel = (value) => {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
};

export default function AnomalyMonitor() {
  const [indicator, setIndicator] = useState("CPI_Inflation");
  const [method, setMethod] = useState("robust");
  const [summary, setSummary] = useState(null);
  const [anomalies, setAnomalies] = useState([]);
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [summaryResponse, anomalyResponse, seriesResponse] = await Promise.all([
        fetch(`${API_BASE}/api/anomalies/summary`),
        fetch(`${API_BASE}/api/anomalies?method=${encodeURIComponent(method)}&limit=100`),
        fetch(`${API_BASE}/api/anomalies/series?indicator=${encodeURIComponent(indicator)}&method=${encodeURIComponent(method)}`),
      ]);
      if (!summaryResponse.ok || !anomalyResponse.ok || !seriesResponse.ok) {
        throw new Error("The API returned an error. Check that the Plumber backend is running.");
      }
      const [summaryData, anomalyData, seriesData] = await Promise.all([
        summaryResponse.json(), anomalyResponse.json(), seriesResponse.json(),
      ]);
      if (anomalyData?.error || seriesData?.error) {
        throw new Error(anomalyData?.error || seriesData?.error);
      }
      setSummary(summaryData);
      setAnomalies(Array.isArray(anomalyData) ? anomalyData : []);
      setSeries(Array.isArray(seriesData) ? seriesData : []);
    } catch (err) {
      setError(err?.message || "Unable to load anomaly data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [indicator, method]);

  

const chartData = useMemo(
  () =>
    series
      .filter((row) => row.indicator === indicator)
      .map((row) => {
        const flag =
          method === "isolation_forest"
            ? row.isolationAnomaly
            : row.isAnomaly;

        const isFlagged = flag === true || flag === "TRUE";
        const value = Number(row.value);

        return {
          ...row,
          chartDate: dateLabel(row.Date),
          value,
          baseline: Number(row.baseline),
          lowerBound: Number(row.lowerBound),
          upperBound: Number(row.upperBound),
          anomalyValue:
            isFlagged && Number.isFinite(value) ? value : null,
        };
      })
      .filter((row) => Number.isFinite(row.value)),
  [series, indicator, method]
);


  const selectedLabel = INDICATORS.find((item) => item.value === indicator)?.label || indicator;
  const flaggedForIndicator = chartData.filter((row) => {
    const flag = method === "isolation_forest" ? row.isolationAnomaly : row.isAnomaly;
    return flag === true || flag === "TRUE";
  });
  const mostRecent = anomalies[0];

  return (
    <main className="anomaly-page">
      <header className="anomaly-header">
        <div>
          <p className="eyebrow">RUPEEWATCH · ML MODULE</p>
          <h1>Anomaly Monitor</h1>
          <p className="subtitle">Find unusual movements in India’s key economic indicators.</p>
        </div>
        <button className="refresh" type="button" onClick={loadData} disabled={loading}>
          <RefreshCw size={16} className={loading ? "spin" : ""} /> Refresh
        </button>
      </header>

      <section className="metric-grid" aria-label="Anomaly summary">
        <article className="metric-card">
          <span className="metric-icon"><AlertTriangle size={18} /></span>
          <span className="metric-label">Flagged observations</span>
          <strong>{summary?.totalAnomalies ?? "—"}</strong>
          <small>Across the four core indicators</small>
        </article>
        <article className="metric-card">
          <span className="metric-icon"><Activity size={18} /></span>
          <span className="metric-label">High severity</span>
          <strong>{summary?.highSeverity ?? "—"}</strong>
          <small>Absolute robust score of 5 or more</small>
        </article>
        <article className="metric-card">
          <span className="metric-icon"><CalendarClock size={18} /></span>
          <span className="metric-label">Most recent flag</span>
          <strong className="metric-date">{dateLabel(summary?.latestDate)}</strong>
          <small>{mostRecent?.indicatorLabel || "Latest flagged observation"}</small>
        </article>
        <article className="metric-card">
          <span className="metric-icon"><ShieldCheck size={18} /></span>
          <span className="metric-label">Detection method</span>
          <strong className="method-value">{method === "robust" ? "Robust baseline" : "Isolation Forest"}</strong>
          <small>{method === "robust" ? "Rolling median and MAD" : "Multivariate ML model"}</small>
        </article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Indicator history</h2>
            <p>Compare each monthly observation with its historical baseline.</p>
          </div>
          <div className="controls">
            <label>
              <span>Indicator</span>
              <select value={indicator} onChange={(event) => setIndicator(event.target.value)}>
                {INDICATORS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label>
              <span>Detection method</span>
              <select value={method} onChange={(event) => setMethod(event.target.value)}>
                <option value="robust">Robust statistical baseline</option>
                <option value="isolation_forest">Isolation Forest (ML)</option>
              </select>
            </label>
          </div>
        </div>

        {error && <div className="error" role="alert">{error}</div>}
        {loading ? <div className="empty">Loading anomaly data…</div> : !error && chartData.length === 0 ? (
          <div className="empty">No chart data is available for this indicator.</div>
        ) : !error && (
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={330}>
              <ComposedChart
                key={`${indicator}-${method}`}
                data={chartData}
                margin={{ top: 12, right: 18, left: 0, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="chartDate" minTickGap={30} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={58} />
                <Tooltip labelFormatter={(label) => label} formatter={(value, name) => [number(value), name]} />
                <ReferenceLine y={0} strokeDasharray="4 4" />
                <Line type="monotone" dataKey="upperBound" name="Upper threshold" stroke="#d97706" strokeDasharray="5 4" dot={false} connectNulls />
                <Line type="monotone" dataKey="lowerBound" name="Lower threshold" stroke="#d97706" strokeDasharray="5 4" dot={false} connectNulls />
                <Line type="monotone" dataKey="baseline" name="Historical baseline" stroke="#64748b" strokeDasharray="3 3" dot={false} connectNulls />
                <Line type="monotone" dataKey="value" name={selectedLabel} stroke="#2563eb" strokeWidth={2} dot={false} connectNulls />
                
                <Line
                  type="linear"
                  dataKey="anomalyValue"
                  name="Flagged anomaly"
                  stroke="none"
                  dot={{ r: 4, fill: "#dc2626", stroke: "#dc2626" }}
                  activeDot={{ r: 6 }}
                  connectNulls={false}
                />

              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="chart-note">Red points are flagged observations. Thresholds are based on prior values, not future data.</p>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Recent anomalies</h2>
            <p>{method === "robust" ? "Observations beyond the rolling robust threshold." : "Months identified as unusual across multiple indicators."}</p>
          </div>
          <span className="count-pill">{anomalies.length} shown</span>
        </div>
        <div className="table-scroll">
          <table className="anomaly-table">
            <thead><tr><th>Date</th><th>Indicator</th><th>Observed value</th><th>Baseline</th><th>Score</th><th>Severity</th></tr></thead>
            <tbody>
              {anomalies.slice(0, 100).map((row, index) => (
                <tr key={`${row.Date}-${row.indicator || "combined"}-${index}`}>
                  <td>{dateLabel(row.Date)}</td>
                  <td>{row.indicatorLabel || row.indicator || "Multiple indicators"}</td>
                  <td>{number(row.value)}</td>
                  <td>{number(row.baseline)}</td>
                  <td>{number(row.score ?? row.robustScore, 2)}</td>
                  <td><span className={`severity severity-${row.severity || "moderate"}`}>{row.severity || (row.isAnomaly ? "flagged" : "—")}</span></td>
                </tr>
              ))}
              {!loading && anomalies.length === 0 && <tr><td colSpan="6" className="table-empty">No anomalies found for the selected method.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <p className="disclaimer">An anomaly means a value is statistically unusual; it does not, by itself, prove an economic crisis or explain its cause.</p>
    </main>
  );
}
