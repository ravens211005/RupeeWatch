# RupeeWatch — React + R API

**RupeeWatch: Exchange Rates, Inflation & Economic Intelligence Dashboard**

This version replaces the old Shiny UI with a React + Vite website. R remains responsible for loading the supplied CSV files, building the monthly indicators, and returning API data through Plumber. The former **Data Quality** tab is not included.

## Project layout

```text
RupeeWatch-React/
├── backend/
│   └── plumber.R
├── data/
│   ├── CPI_Rural_Urban_Combined.csv
│   ├── Components_of_Money_StockRBIE.csv
│   ├── exchange_rates.csv
│   ├── Foreign Exchange Reserves.csv
│   ├── Index_of_Industrial_Production.csv
│   ├── inr-usd.csv
│   ├── monthly_rainfall_by_state.csv
│   └── wpiEAIND.csv
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── App.jsx
        ├── main.jsx
        └── styles.css
```

## 1. Start the R backend in RStudio

Open the **RupeeWatch-React** folder as your working directory in RStudio. Install the backend packages once:

```r
install.packages(c("plumber", "dplyr", "tidyr", "lubridate", "jsonlite"))
```

Then run the API:

```r
api <- plumber::plumb("backend/plumber.R")
api$run(host = "127.0.0.1", port = 8000)
```

Keep this R session running. Test the API in your browser at:

- `http://127.0.0.1:8000/api/health`
- `http://127.0.0.1:8000/api/overview`
- `http://127.0.0.1:8000/api/monthly`

If startup fails, copy the **first complete error message** from the R console. The API loads the CSV files when it starts, so the `data` folder must remain inside the project root.

## 2. Start the React frontend

Install **Node.js LTS** if it is not already installed. Open a separate terminal in the `RupeeWatch-React/frontend` folder and run:

```bash
npm install
npm run dev
```

Open the local URL Vite prints, normally `http://localhost:5173`. Leave both the R API and Vite terminal running while using the dashboard.

The frontend expects the API at `http://localhost:8000`. If you deploy the API to another address, create `frontend/.env` with:

```text
VITE_API_URL=https://your-api-domain.example
```

Restart Vite after changing environment variables.

## Main screens

- **Overview:** headline CPI, INR/USD, WPI and IIP metrics, inflation trend, currency movement and context notes.
- **Exchange & Inflation:** date filtering, exchange-rate measure selection and CPI/WPI/rural/urban comparisons.
- **Statistical Analysis:** exploratory regression summary, coverage indicators and correlation matrix.
- **Economic Indicators:** industrial production, reserves, alternate exchange rates, money-stock data and CSV export.

The dashboard labels results as latest available observations. Source datasets can have different end dates and frequencies. Rainfall is a simple mean across available state-level totals and should not be interpreted as a population- or crop-weighted national rainfall measure. Statistical associations do not establish causation.

## Deployment plan

Develop and verify the two services locally first. For public deployment, the React static frontend can be hosted on a static site host, while the R Plumber API needs an R-capable host/container and the CSV files must be deployed with the backend. Set `VITE_API_URL` to the public API address and configure the API's CORS policy to allow only your frontend domain rather than `*`.

This project scaffold is a starting point; run the backend and frontend and validate the data parsing on your machine before publishing it.
