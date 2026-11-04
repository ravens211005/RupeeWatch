
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import { Activity, RefreshCw, TrendingUp } from "lucide-react";
import "./InflationForecast.css";

const API = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(
  /\/$/,
  ""
);

const MODELS = [
  { value: "best", label: "Best validated model" },
  { value: "linear", label: "Linear Regression" },
  { value: "random_forest", label: "Random Forest" },
  { value: "xgboost", label: "XGBoost" },
];

const first = (value) =>
  Array.isArray(value) ? value[0] : value;

const finiteNumber = (value) => {
  const number = Number(first(value));
  return value == null || first(value) === "" || !Number.isFinite(number)
    ? null
    : number;
};

const fmt = (value) => {
  const number = finiteNumber(value);
  return number == null ? "—" : `${number.toFixed(2)}%`;
};

const monthLabel = (date) => {
  const value = first(date);
  if (!value) return "—";

  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(value);

  return parsed.toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
  });
};

const normalizeForecast = (item, key) => {
  if (!item) return null;

  const model = first(item.model) || key;
  const label =
    first(item.label) ||
    MODELS.find((entry) => entry.value === model)?.label ||
    model;

  return {
    model,
    label,
    forecast: finiteNumber(item.forecast),
    mae: finiteNumber(item.mae),
    rmse: finiteNumber(item.rmse),
    validationObservations: finiteNumber(item.validationObservations),
  };
};

const normalizeForecastResponse = (raw) => {
  const source = raw && typeof raw === "object" ? raw : {};

  let forecasts = [];

  if (Array.isArray(source.forecasts)) {
    forecasts = source.forecasts.map((item) =>
      normalizeForecast(item, first(item?.model))
    );
  } else if (
    source.forecasts &&
    typeof source.forecasts === "object"
  ) {
    forecasts = Object.entries(source.forecasts).map(([key, item]) =>
      normalizeForecast(item, key)
    );
  }

  forecasts = forecasts.filter(Boolean);

  const bestModel = first(source.bestModel) || "";
  const bestForecast = finiteNumber(source.bestForecast);

  // The API may provide a model's forecast in the forecasts object.
  // Keep bestForecast as a fallback for the selected best model.
  forecasts = forecasts.map((item) => {
    if (
      item.model === bestModel &&
      item.forecast == null &&
      bestForecast != null
    ) {
      return { ...item, forecast: bestForecast };
    }
    return item;
  });

  const benchmarkSource = source.benchmark || {};

  return {
    horizon: finiteNumber(source.horizon),
    target: first(source.target) || "CPI_Inflation",
    unit: first(source.unit) || "percent",
    originDate: first(source.originDate) || "",
    forecastDate: first(source.forecastDate) || "",
    latestCpi: finiteNumber(source.latestCpi),
    bestModel,
    bestModelLabel:
      first(source.bestModelLabel) ||
      forecasts.find((item) => item.model === bestModel)?.label ||
      bestModel,
    bestForecast,
    forecasts,
    unavailableModels: Array.isArray(source.unavailableModels)
      ? source.unavailableModels
      : [],
    benchmark: {
      mae: finiteNumber(benchmarkSource.mae),
      rmse: finiteNumber(benchmarkSource.rmse),
    },
    note: first(source.note) || "",
  };
};

const normalizeHistory = (raw) => {
  let rows = [];

  if (Array.isArray(raw)) {
    rows = raw;
  } else if (raw && Array.isArray(raw.data)) {
    rows = raw.data;
  } else if (raw && Array.isArray(raw.monthly)) {
    rows = raw.monthly;
  } else if (raw && typeof raw === "object") {
    rows = Object.values(raw).filter(
      (value) => value && typeof value === "object"
    );
  }

  return rows
    .map((row) => {
      const date = first(row.Date ?? row.date ?? row.month);
      const cpi = finiteNumber(
        row.CPI_Inflation ?? row.cpi_inflation ?? row.CPI
      );

      return {
        Date: date ? String(date).slice(0, 10) : "",
        CPI_Inflation: cpi,
      };
    })
    .filter(
      (row) =>
        /^\d{4}-\d{2}-\d{2}$/.test(row.Date) &&
        row.CPI_Inflation != null
    )
    .sort((a, b) => a.Date.localeCompare(b.Date));
};

export default function InflationForecast() {
  const [horizon, setHorizon] = useState("3");
  const [modelChoice, setModelChoice] = useState("best");
  const [history, setHistory] = useState([]);
  const [forecastData, setForecastData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const forecastUrl =
        `${API}/api/inflation/forecast?horizon=` +
        encodeURIComponent(horizon);

      // Forecasting is the essential request. Historical chart data is
      // optional so a missing /api/monthly route won't blank the page.
      const forecastResponse = await fetch(forecastUrl);

      if (!forecastResponse.ok) {
        throw new Error(
          `Forecast API returned HTTP ${forecastResponse.status}.`
        );
      }

      const forecastJson = await forecastResponse.json();

      if (forecastJson?.error) {
        throw new Error(first(forecastJson.error));
      }

      const normalized = normalizeForecastResponse(forecastJson);

      if (!normalized.forecasts.length && normalized.bestForecast == null) {
        throw new Error("The API returned no usable forecast values.");
      }

      setForecastData(normalized);

      try {
        const historyResponse = await fetch(`${API}/api/monthly`);

        if (historyResponse.ok) {
          const historyJson = await historyResponse.json();
          setHistory(normalizeHistory(historyJson));
        } else {
          setHistory([]);
        }
      } catch {
        // Historical data is optional; forecasts can still be displayed.
        setHistory([]);
      }
    } catch (err) {
      setError(err?.message || "Could not load inflation forecasts.");
      setForecastData(null);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [horizon]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const chosenForecast = useMemo(() => {
    if (!forecastData) return null;

    const model =
      modelChoice === "best" ? forecastData.bestModel : modelChoice;

    const match = forecastData.forecasts.find(
      (item) => item.model === model
    );

    if (match) return match;

    if (
      modelChoice === "best" &&
      forecastData.bestForecast != null
    ) {
      return {
        model: forecastData.bestModel,
        label: forecastData.bestModelLabel,
        forecast: forecastData.bestForecast,
        mae: null,
        rmse: null,
      };
    }

    return null;
  }, [forecastData, modelChoice]);

  const chartData = useMemo(() => {
    const recent = history.slice(-24).map((row) => ({
      Date: row.Date,
      actual: row.CPI_Inflation,
      forecast: null,
    }));

    if (
      chosenForecast?.forecast != null &&
      forecastData?.forecastDate
    ) {
      const previous = recent[recent.length - 1];

      if (previous) {
        previous.forecast = previous.actual;
      }

      recent.push({
        Date: forecastData.forecastDate,
        actual: null,
        forecast: chosenForecast.forecast,
      });
    }

    return recent;
  }, [history, chosenForecast, forecastData]);

  return (
    <section className="if-page">
      <header className="if-header">
        <div>
          <div className="if-eyebrow">RUPEEWATCH · FORECASTING</div>
          <h1>Inflation Prediction</h1>
          <p>
            Forecast India's CPI inflation using historical inflation,
            wholesale prices, exchange rates and industrial production.
          </p>
        </div>

        <button
          className="if-refresh"
          onClick={loadData}
          disabled={loading}
          type="button"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </header>

      <div className="if-controls">
        <label>
          Forecast horizon
          <select
            value={horizon}
            onChange={(event) => setHorizon(event.target.value)}
          >
            <option value="1">Next month</option>
            <option value="3">Next 3 months</option>
            <option value="6">Next 6 months</option>
          </select>
        </label>

        <label>
          Model
          <select
            value={modelChoice}
            onChange={(event) => setModelChoice(event.target.value)}
          >
            {MODELS.map((model) => (
              <option key={model.value} value={model.value}>
                {model.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <div className="if-error">{error}</div>}

      {loading ? (
        <div className="if-empty">Loading forecasts from R…</div>
      ) : forecastData && !error ? (
        <>
          <div className="if-metrics">
            <article className="if-card">
              <span className="if-card-label">
                Predicted CPI inflation
              </span>
              <strong>{fmt(chosenForecast?.forecast)}</strong>
              <small>
                Forecast month: {monthLabel(forecastData.forecastDate)}
              </small>
            </article>

            <article className="if-card">
              <span className="if-card-label">Selected model</span>
              <strong className="if-model-name">
                {chosenForecast?.label || "Unavailable"}
              </strong>
              <small>
                Best validated: {forecastData.bestModelLabel || "—"}
              </small>
            </article>

            <article className="if-card">
              <span className="if-card-label">Validation MAE</span>
              <strong>{fmt(chosenForecast?.mae)}</strong>
              <small>Average absolute error in percentage points</small>
            </article>

            <article className="if-card">
              <span className="if-card-label">Validation RMSE</span>
              <strong>{fmt(chosenForecast?.rmse)}</strong>
              <small>Lower is better</small>
            </article>
          </div>

          {!chosenForecast && (
            <div className="if-error">
              This model is unavailable. Select another model or check
              the API response and installed R packages.
            </div>
          )}

          <section className="if-panel">
            <div className="if-panel-heading">
              <div>
                <h2>Historical CPI and forecast</h2>
                <p>
                  Actual monthly CPI inflation and the selected model's
                  forecast.
                </p>
              </div>
              <span className="if-tag">
                <Activity size={14} />
                {horizon}-month horizon
              </span>
            </div>

            <div className="if-chart">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    key={`${horizon}-${modelChoice}`}
                    data={chartData}
                    margin={{
                      top: 12,
                      right: 18,
                      left: 8,
                      bottom: 8,
                    }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="Date"
                      tickFormatter={monthLabel}
                      minTickGap={28}
                    />
                    <YAxis tickFormatter={(value) => `${value}%`} />
                    <Tooltip
                      labelFormatter={monthLabel}
                      formatter={(value, name) => [fmt(value), name]}
                    />
                    <ReferenceLine y={0} strokeDasharray="4 4" />
                    <Line
                      type="monotone"
                      dataKey="actual"
                      name="Actual CPI inflation"
                      stroke="#2563eb"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                    <Line
                      type="linear"
                      dataKey="forecast"
                      name="Forecast CPI inflation"
                      stroke="#d97706"
                      strokeWidth={2.5}
                      strokeDasharray="6 4"
                      connectNulls
                      dot={{ r: 5 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="if-empty">
                  Historical chart data is unavailable. Forecast results
                  are still shown above.
                </div>
              )}
            </div>
          </section>

          <section className="if-panel">
            <div className="if-panel-heading">
              <div>
                <h2>Model comparison</h2>
                <p>
                  Validation results for the selected forecast horizon.
                </p>
              </div>
              <TrendingUp size={20} />
            </div>

            <div className="if-table-wrap">
              <table className="if-table">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Forecast</th>
                    <th>MAE</th>
                    <th>RMSE</th>
                  </tr>
                </thead>
                <tbody>
                  {forecastData.forecasts.map((item) => (
                    <tr key={item.model}>
                      <td>
                        {item.label}
                        {item.model === forecastData.bestModel && (
                          <span className="if-best">
                            Best validated
                          </span>
                        )}
                      </td>
                      <td>{fmt(item.forecast)}</td>
                      <td>{fmt(item.mae)}</td>
                      <td>{fmt(item.rmse)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {forecastData.unavailableModels.length > 0 && (
              <p className="if-note">
                Unavailable models:{" "}
                {forecastData.unavailableModels
                  .map((item) =>
                    typeof item === "string"
                      ? item
                      : `${item.label || item.model || "Model"}: ${
                          item.error || "unavailable"
                        }`
                  )
                  .join(" · ")}
              </p>
            )}

            {forecastData.note && (
              <p className="if-note">{forecastData.note}</p>
            )}
          </section>

          <p className="if-disclaimer">
            These are statistical estimates, not official CPI releases.
            Historical validation performance does not guarantee future
            accuracy. Model selection uses chronological validation.
          </p>
        </>
      ) : (
        <div className="if-empty">No forecast data is available.</div>
      )}
    </section>
  );
}
