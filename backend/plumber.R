library(plumber)
library(dplyr)
library(tidyr)
library(lubridate)
library(jsonlite)

# Set RUPEEWATCH_ROOT to your project folder if the working directory is different.
# Example (Windows): Sys.setenv(RUPEEWATCH_ROOT = "C:/Users/YourName/Downloads/RupeeWatch-React")

PROJECT_ROOT <- Sys.getenv("C:/Users/Bizibrain/Downloads/RupeeWatch/RupeeWatch", unset = getwd())
DATA_DIR <- file.path(PROJECT_ROOT, "data")

# Also support running the API from a folder that contains the CSVs directly.
if (!dir.exists(DATA_DIR) &&
    file.exists(file.path(PROJECT_ROOT, "CPI_Rural_Urban_Combined.csv"))) {
  DATA_DIR <- PROJECT_ROOT
}



read_csv_safe <- function(filename, ...) {
  path <- file.path(DATA_DIR, filename)
  
  if (!file.exists(path)) {
    stop("File not found: ", path)
  }
  
  read.csv(
    path,
    check.names = FALSE,
    stringsAsFactors = FALSE,
    na.strings = c("", "NA", "NaN", "-"),
    fileEncoding = "UTF-8-BOM",
    ...
  )
}

num <- function(x) {
  suppressWarnings(
    as.numeric(gsub(",", "", trimws(as.character(x))))
  )
}

build_data <- function() {
  cpi_raw <- read_csv_safe("CPI_Rural_Urban_Combined.csv")

  required_cpi <- c(
    "Commodity Description", "Month", "Combined Inflation",
    "Rural Inflation", "Urban Inflation", "Combined Index"
  )
  missing_cpi <- setdiff(required_cpi, names(cpi_raw))
  if (length(missing_cpi) > 0) {
    stop("CPI file is missing required columns: ", paste(missing_cpi, collapse = ", "))
  }

  cpi <- cpi_raw %>%
    filter(`Commodity Description` == "A) General Index") %>%
    mutate(
      Date = as.Date(paste0("01-", trimws(Month)), format = "%d-%b-%Y"),
      CPI_Inflation = num(`Combined Inflation`),
      Rural_Inflation = num(`Rural Inflation`),
      Urban_Inflation = num(`Urban Inflation`),
      Combined_CPI = num(`Combined Index`)
    ) %>%
    filter(!is.na(Date)) %>%
    select(Date, CPI_Inflation, Rural_Inflation, Urban_Inflation, Combined_CPI) %>%
    distinct(Date, .keep_all = TRUE) %>%
    arrange(Date)

  wpi_raw <- read_csv_safe("wpiEAIND.csv")

  wpi_row <- which(tolower(trimws(wpi_raw$COMM_NAME)) == "all commodities")

  wpi <- wpi_raw[wpi_row[1], , drop = FALSE] %>%
    pivot_longer(
      cols = starts_with("INDX"),
      names_to = "WPI_Column",
      values_to = "WPI_Index"
    ) %>%
    mutate(
      Date = as.Date(
        paste0("01-", substr(WPI_Column, 5, 6), "-", substr(WPI_Column, 7, 10)),
        format = "%d-%m-%Y"
      ),
      WPI_Index = num(WPI_Index)
    ) %>%
    filter(!is.na(Date)) %>%
    arrange(Date) %>%
    mutate(WPI_Inflation = 100 * (WPI_Index / lag(WPI_Index, 12) - 1)) %>%
    select(Date, WPI_Index, WPI_Inflation)

  fx_raw <- read_csv_safe("inr-usd.csv")

  fx <- fx_raw %>%
    mutate(
      Date = as.Date(observation_date),
      FX_Daily = num(`inr-usd`),
      Month = floor_date(Date, "month")
    ) %>%
    filter(!is.na(Month), !is.na(FX_Daily)) %>%
    group_by(Date = Month) %>%
    summarise(INR_per_USD = mean(FX_Daily, na.rm = TRUE), .groups = "drop") %>%
    arrange(Date) %>%
    mutate(
      FX_YoY_Change = 100 * (INR_per_USD / lag(INR_per_USD, 12) - 1),
      FX_MoM_Change = 100 * (INR_per_USD / lag(INR_per_USD) - 1)
    )

  iip_raw <- read_csv_safe("Index_of_Industrial_Production.csv")

  iip <- iip_raw %>%
    filter(!is.na(`Month/Year`), tolower(trimws(`Month/Year`)) != "weight") %>%
    mutate(
      Date = as.Date(
        paste0("01 ", gsub("\\s*-\\s*", "-", trimws(`Month/Year`))),
        format = "%d %b-%Y"
      ),
      IIP_General = num(`General Index`)
    ) %>%
    filter(!is.na(Date), !is.na(IIP_General)) %>%
    arrange(Date) %>%
    mutate(IIP_YoY_Growth = 100 * (IIP_General / lag(IIP_General, 12) - 1)) %>%
    select(Date, IIP_General, IIP_YoY_Growth)

  
  other_raw <- read_csv_safe("exchange_rates.csv")

  other_fx_cols <- c("Date", "USD_Average", "EUR_Average", "GBP_Average", "JPY_Average", "SDR_Average")
  missing_other_fx <- setdiff(other_fx_cols, names(other_raw))
  if (length(missing_other_fx) > 0) {
    stop("Exchange-rates file is missing required columns: ", paste(missing_other_fx, collapse = ", "))
  }

  other_fx <- other_raw %>%
    mutate(
      Date = as.Date(Date, format = "%d/%m/%y"),
      across(c(USD_Average, EUR_Average, GBP_Average, JPY_Average, SDR_Average), num)
    ) %>%
    filter(!is.na(Date)) %>%
    transmute(
      Date = floor_date(Date, "month"),
      USD_Average, EUR_Average, GBP_Average, JPY_Average, SDR_Average
    ) %>%
    distinct(Date, .keep_all = TRUE)

  monthly <- cpi %>%
    full_join(wpi, by = "Date") %>%
    full_join(fx %>% select(Date, INR_per_USD, FX_YoY_Change, FX_MoM_Change), by = "Date") %>%
    full_join(iip, by = "Date") %>%
    full_join(other_fx, by = "Date") %>%
    arrange(Date)

  money_raw <- read_csv_safe("Components_of_Money_StockRBIE.csv", colClasses = "character")

  money <- money_raw %>%
    filter(!is.na(Year), grepl("^[0-9]{4}-[0-9]{2}$", trimws(Year))) %>%
    mutate(across(-Year, num), Financial_Year = Year) %>%
    select(Financial_Year, where(is.numeric))

  res_raw <- read_csv_safe("Foreign Exchange Reserves.csv", colClasses = "character")

  required_res <- c("Year", "Month", "Total")
  missing_res <- setdiff(required_res, names(res_raw))
  if (length(missing_res) > 0) {
    stop("Foreign-exchange-reserves file is missing required columns: ", paste(missing_res, collapse = ", "))
  }

  reserve_usd_col <- if ("Unnamed_12" %in% names(res_raw)) {
    "Unnamed_12"
  } else {
    candidates <- names(res_raw)[grepl("^Unnamed", names(res_raw), ignore.case = TRUE)]
    if (length(candidates) > 0) candidates[length(candidates)] else NA_character_
  }

  if (is.na(reserve_usd_col)) {
    stop("Could not find the USD reserve column (expected Unnamed_12 or another Unnamed column).")
  }

  reserves <- res_raw %>%
    filter(
      !is.na(Year),
      grepl("^[0-9]{4}$", trimws(Year)),
      !is.na(Month)
    ) %>%
    mutate(
      Year_num = as.integer(Year),
      Month_num = match(toupper(trimws(Month)), toupper(month.abb)),
      Date = as.Date(sprintf("%04d-%02d-01", Year_num, Month_num)),
      Total_INR_Crore = num(Total),
      Total_USD_Million = num(.data[[reserve_usd_col]])
    ) %>%
    filter(!is.na(Date)) %>%
    select(Date, Total_INR_Crore, Total_USD_Million) %>%
    arrange(Date)

  monthly <- monthly %>%
    left_join(reserves, by = "Date") %>%
    arrange(Date)

  list(monthly = monthly, money = money, reserves = reserves)
}

DATA <- build_data()
monthly <- DATA$monthly
money <- DATA$money
reserves <- DATA$reserves

#* @filter cors
function(req, res) {
  res$setHeader("Access-Control-Allow-Origin", "*")
  res$setHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
  res$setHeader("Access-Control-Allow-Headers", "Content-Type")

  if (req$REQUEST_METHOD == "OPTIONS") {
    res$status <- 200
    return(list())
  }

  plumber::forward()
}

#* @get /api/health
function() {
  list(
    status = "ok",
    service = "RupeeWatch API",
    latestDate = as.character(max(monthly$Date, na.rm = TRUE))
  )
}

#* @param start Start date in YYYY-MM-DD format
#* @param end End date in YYYY-MM-DD format
#* @get /api/monthly
function(start = NULL, end = NULL) {
  d <- monthly

  if (!is.null(start) && nzchar(start)) {
    start_date <- as.Date(start)
    if (is.na(start_date)) stop("Invalid start date. Use YYYY-MM-DD.")
    d <- d %>% filter(Date >= start_date)
  }

  if (!is.null(end) && nzchar(end)) {
    end_date <- as.Date(end)
    if (is.na(end_date)) stop("Invalid end date. Use YYYY-MM-DD.")
    d <- d %>% filter(Date <= end_date)
  }

  d %>% mutate(Date = as.character(Date))
}

#* @get /api/overview
function() {
  last_value <- function(column) {
    d <- monthly %>%
      filter(!is.na(.data[[column]])) %>%
      arrange(Date) %>%
      slice_tail(n = 1)

    if (nrow(d) == 0) return(list(value = NULL, date = NULL))

    list(value = as.numeric(d[[column]][1]), date = as.character(d$Date[1]))
  }

  list(
    cpi = last_value("CPI_Inflation"),
    fx = last_value("INR_per_USD"),
    wpi = last_value("WPI_Inflation"),
    iip = last_value("IIP_YoY_Growth"),
    reserves = last_value("Total_USD_Million")
  )
}

#* @get /api/correlation
function() {
  columns <- c("CPI_Inflation", "WPI_Inflation", "FX_YoY_Change", "IIP_YoY_Growth")
  d <- monthly %>% select(any_of(columns))
  correlation <- suppressWarnings(cor(d, use = "pairwise.complete.obs"))

  list(
    columns = colnames(correlation),
    rows = lapply(seq_len(nrow(correlation)), function(i) as.list(as.numeric(correlation[i, ])))
  )
}

#* @get /api/money-stock
function() {
  money
}

#* @get /api/reserves
function() {
  reserves %>% mutate(Date = as.character(Date))
}

#* @get /api/regression
function() {
  predictors <- c("WPI_Inflation", "FX_YoY_Change", "IIP_YoY_Growth")

  d <- monthly %>%
    select(CPI_Inflation, any_of(predictors)) %>%
    drop_na()

  if (nrow(d) < length(predictors) + 3) {
    return(list(
      message = "Not enough complete observations for regression",
      observations = nrow(d)
    ))
  }

  model <- lm(CPI_Inflation ~ ., data = d)
  model_summary <- summary(model)
  coefficients <- as.data.frame(model_summary$coefficients)
  coefficients$term <- rownames(coefficients)
  rownames(coefficients) <- NULL

  list(
    observations = nobs(model),
    rSquared = unname(model_summary$r.squared),
    adjustedRSquared = unname(model_summary$adj.r.squared),
    coefficients = coefficients
  )
}


# -----------------------------------------------------------------------------
# RupeeWatch Anomaly Monitor
# Rainfall is intentionally excluded. The initial multivariate model uses four
# monthly economic indicators that are already produced by build_data().
# -----------------------------------------------------------------------------

ANOMALY_FEATURES <- c(
  "CPI_Inflation",
  "WPI_Inflation",
  "FX_MoM_Change",
  "IIP_YoY_Growth"
)

INDICATOR_LABELS <- c(
  CPI_Inflation = "CPI inflation",
  WPI_Inflation = "WPI inflation",
  FX_MoM_Change = "INR–USD monthly change",
  IIP_YoY_Growth = "IIP growth"
)

# Rolling robust score: each observation is compared only with earlier values,
# avoiding look-ahead leakage. At least 12 earlier observations are required.
make_robust_anomalies <- function(data = monthly, window = 36, min_history = 12) {
  available <- intersect(ANOMALY_FEATURES, names(data))
  if (length(available) == 0) return(data.frame())

  out <- lapply(available, function(indicator) {
    x <- data[[indicator]]
    n <- length(x)
    score <- rep(NA_real_, n)
    baseline <- rep(NA_real_, n)
    lower <- rep(NA_real_, n)
    upper <- rep(NA_real_, n)

    for (i in seq_len(n)) {
      left <- max(1, i - window)
      history <- x[left:(i - 1)]
      history <- history[is.finite(history)]
      if (length(history) < min_history || !is.finite(x[i])) next

      med <- stats::median(history)
      scale <- stats::mad(history, center = med, constant = 1.4826, na.rm = TRUE)
      if (!is.finite(scale) || scale < .Machine$double.eps) {
        scale <- stats::sd(history, na.rm = TRUE)
      }
      if (!is.finite(scale) || scale < .Machine$double.eps) next

      baseline[i] <- med
      score[i] <- (x[i] - med) / scale
      lower[i] <- med - 3.5 * scale
      upper[i] <- med + 3.5 * scale
    }

    data.frame(
      Date = as.character(data$Date),
      indicator = indicator,
      indicatorLabel = unname(INDICATOR_LABELS[indicator]),
      value = as.numeric(x),
      baseline = baseline,
      lowerBound = lower,
      upperBound = upper,
      score = score,
      method = "robust",
      stringsAsFactors = FALSE
    )
  })

  result <- dplyr::bind_rows(out) %>%
    filter(is.finite(value), is.finite(score)) %>%
    mutate(
      isAnomaly = abs(score) >= 3.5,
      severity = case_when(
        abs(score) >= 5 ~ "high",
        abs(score) >= 3.5 ~ "moderate",
        TRUE ~ "normal"
      ),
      direction = if_else(score >= 0, "above baseline", "below baseline")
    ) %>%
    arrange(desc(Date), desc(abs(score)))

  result
}

make_isolation_forest <- function(data = monthly, contamination = 0.05) {
  if (!requireNamespace("isotree", quietly = TRUE)) {
    return(list(available = FALSE, message = "Isolation Forest requires the optional R package 'isotree'. Install it with install.packages('isotree')."))
  }

  features <- intersect(ANOMALY_FEATURES, names(data))
  if (length(features) < 2) {
    return(list(available = FALSE, message = "At least two economic indicators are required for Isolation Forest."))
  }

  frame <- data %>% select(Date, all_of(features))
  x <- as.data.frame(frame[, features, drop = FALSE])
  for (nm in names(x)) {
    x[[nm]] <- as.numeric(x[[nm]])
    med <- stats::median(x[[nm]], na.rm = TRUE)
    if (!is.finite(med)) med <- 0
    x[[nm]][!is.finite(x[[nm]])] <- med
  }

  # Robustly standardize features so their units do not dominate the model.
  for (nm in names(x)) {
    med <- stats::median(x[[nm]], na.rm = TRUE)
    scale <- stats::mad(x[[nm]], center = med, constant = 1.4826, na.rm = TRUE)
    if (!is.finite(scale) || scale < .Machine$double.eps) scale <- stats::sd(x[[nm]], na.rm = TRUE)
    if (!is.finite(scale) || scale < .Machine$double.eps) scale <- 1
    x[[nm]] <- (x[[nm]] - med) / scale
  }

  if (nrow(x) < 30) {
    return(list(available = FALSE, message = "Isolation Forest needs at least 30 monthly rows; use the robust method for this dataset."))
  }

  model <- tryCatch(
    isotree::isolation.forest(
      x,
      ntrees = 300,
      sample_size = min(256, nrow(x)),
      ndim = 1,
      nthreads = 1
    ),
    error = function(e) e
  )
  if (inherits(model, "error")) {
    return(list(available = FALSE, message = paste("Isolation Forest could not be trained:", conditionMessage(model))))
  }

  scores <- tryCatch(as.numeric(stats::predict(model, x, type = "score")), error = function(e) NULL)
  if (is.null(scores) || length(scores) != nrow(x)) {
    return(list(available = FALSE, message = "Isolation Forest returned an unexpected score format. The robust method is still available."))
  }

  cutoff <- as.numeric(stats::quantile(scores, probs = 1 - contamination, na.rm = TRUE, names = FALSE))
  score_table <- data.frame(
    Date = as.character(frame$Date),
    score = scores,
    cutoff = cutoff,
    isAnomaly = scores >= cutoff,
    method = "isolation_forest",
    stringsAsFactors = FALSE
  )

  list(available = TRUE, scores = score_table, features = features, cutoff = cutoff)
}

#* @param method Detection method: robust or isolation_forest
#* @param indicator Optional feature name, e.g. CPI_Inflation
#* @param start Optional start date in YYYY-MM-DD format
#* @param end Optional end date in YYYY-MM-DD format
#* @param limit Maximum number of returned anomaly rows (default 100)
#* @get /api/anomalies
function(method = "robust", indicator = NULL, start = NULL, end = NULL, limit = 100) {
  method <- tolower(method)
  if (!method %in% c("robust", "isolation_forest")) {
    return(list(error = "Invalid method. Use robust or isolation_forest."))
  }

  start_supplied <- !is.null(start) && nzchar(start)
  end_supplied <- !is.null(end) && nzchar(end)
  start_date <- if (start_supplied) as.Date(start) else as.Date(NA)
  end_date <- if (end_supplied) as.Date(end) else as.Date(NA)
  if ((start_supplied && is.na(start_date)) || (end_supplied && is.na(end_date))) {
    return(list(error = "Invalid date. Use YYYY-MM-DD."))
  }

  if (method == "robust") {
    result <- make_robust_anomalies(monthly) %>% filter(isAnomaly)
  } else {
    fit <- make_isolation_forest(monthly)
    if (!isTRUE(fit$available)) return(list(error = fit$message, method = method, fallbackMethod = "robust"))

    robust <- make_robust_anomalies(monthly)
    result <- fit$scores %>% filter(isAnomaly) %>%
      left_join(
        robust %>% group_by(Date) %>% slice_max(order_by = abs(score), n = 1, with_ties = FALSE) %>%
          ungroup() %>% select(Date, indicator, indicatorLabel, value, baseline, lowerBound, upperBound, robustScore = score, severity, direction),
        by = "Date"
      ) %>%
      mutate(method = "isolation_forest")
  }

  if (!is.null(indicator) && nzchar(indicator)) {
    result <- result %>% filter(.data$indicator == indicator)
  }
  if (!is.na(start_date)) result <- result %>% filter(as.Date(Date) >= start_date)
  if (!is.na(end_date)) result <- result %>% filter(as.Date(Date) <= end_date)

  limit_num <- suppressWarnings(as.integer(limit))
  if (is.na(limit_num) || limit_num < 1) limit_num <- 100L
  limit_num <- min(limit_num, 1000L)
  result %>% arrange(desc(Date), desc(abs(score))) %>% head(limit_num)
}

#* @get /api/anomalies/summary
function() {
  robust <- make_robust_anomalies(monthly)
  flagged <- robust %>% filter(isAnomaly)
  by_indicator <- flagged %>%
    count(indicator, indicatorLabel, name = "anomalyCount") %>%
    arrange(desc(anomalyCount))

  list(
    method = "robust",
    totalAnomalies = nrow(flagged),
    highSeverity = sum(flagged$severity == "high", na.rm = TRUE),
    moderateSeverity = sum(flagged$severity == "moderate", na.rm = TRUE),
    latestDate = if (nrow(flagged)) as.character(max(as.Date(flagged$Date), na.rm = TRUE)) else NULL,
    indicators = by_indicator,
    note = "An anomaly is a statistically unusual observation, not proof of an economic crisis."
  )
}

#* @param indicator Indicator column name; defaults to CPI inflation
#* @param method robust (default) or isolation_forest
#* @get /api/anomalies/series
function(indicator = "CPI_Inflation", method = "robust") {
  if (!indicator %in% ANOMALY_FEATURES) {
    return(list(error = paste("Unsupported indicator. Choose:", paste(ANOMALY_FEATURES, collapse = ", "))))
  }

  robust <- make_robust_anomalies(monthly) %>% filter(.data$indicator == indicator)
  if (tolower(method) == "isolation_forest") {
    fit <- make_isolation_forest(monthly)
    if (!isTRUE(fit$available)) return(list(error = fit$message))
    robust <- robust %>% left_join(fit$scores %>% select(Date, isolationScore = score, isolationCutoff = cutoff, isolationAnomaly = isAnomaly), by = "Date")
  }
  robust %>% arrange(Date)
}


# ============================================================
# RUPEEWATCH: INFLATION FORECASTING API
# Requires existing `monthly` data from build_data()
# Models: Linear Regression, Random Forest, XGBoost
# Horizons: 1, 3, 6 calendar months
# ============================================================

inflation_predictors <- c(
  "CPI_Inflation",
  "WPI_Inflation",
  "FX_YoY_Change",
  "IIP_YoY_Growth"
)

inflation_model_names <- c(
  "linear" = "Linear Regression",
  "random_forest" = "Random Forest",
  "xgboost" = "XGBoost"
)

# Safely calculate a mean, returning NA when no values exist.
safe_monthly_mean <- function(x) {
  x <- suppressWarnings(as.numeric(x))
  x <- x[is.finite(x)]
  
  if (length(x) == 0) NA_real_ else mean(x)
}


# Prepare one row per calendar month.
prepare_inflation_monthly <- function(data) {
  
  if (!"Date" %in% names(data)) {
    stop("The monthly dataset must contain a Date column.")
  }
  
  data$Date <- as.Date(data$Date)
  
  # Allow missing indicator columns without crashing.
  for (v in inflation_predictors) {
    if (!v %in% names(data)) {
      data[[v]] <- NA_real_
    }
    data[[v]] <- suppressWarnings(as.numeric(data[[v]]))
  }
  
  data <- data %>%
    mutate(
      Date = as.Date(format(Date, "%Y-%m-01"))
    ) %>%
    filter(!is.na(Date))
  
  if (nrow(data) == 0) {
    stop("No valid dates were found in the monthly dataset.")
  }
  
  # Aggregate duplicate rows within each month.
  aggregated <- data %>%
    group_by(Date) %>%
    summarise(
      across(
        all_of(inflation_predictors),
        safe_monthly_mean
      ),
      .groups = "drop"
    ) %>%
    arrange(Date)
  
  # Create a continuous calendar-month sequence.
  all_months <- data.frame(
    Date = seq.Date(
      from = min(aggregated$Date),
      to = max(aggregated$Date),
      by = "month"
    )
  )
  
  # Missing months remain NA; no values are fabricated.
  completed <- all_months %>%
    left_join(aggregated, by = "Date") %>%
    arrange(Date)
  
  completed
}


# Create lagged predictors using only information available
# at each forecast origin.
inflation_features <- function(data) {
  
  d <- data %>%
    arrange(Date) %>%
    select(Date, all_of(inflation_predictors))
  
  for (variable in inflation_predictors) {
    for (lag_n in c(0, 1, 3, 6, 12)) {
      
      feature_name <- paste0(variable, "_lag", lag_n)
      
      d[[feature_name]] <- if (lag_n == 0) {
        as.numeric(d[[variable]])
      } else {
        dplyr::lag(as.numeric(d[[variable]]), lag_n)
      }
    }
  }
  
  d
}


# Train a selected model.
fit_inflation_model <- function(model_name, train, features) {
  
  if (model_name == "linear") {
    formula <- stats::reformulate(
      features,
      response = "target"
    )
    
    return(stats::lm(formula, data = train))
  }
  
  if (model_name == "random_forest") {
    
    if (!requireNamespace("ranger", quietly = TRUE)) {
      stop("Install ranger using install.packages('ranger').")
    }
    
    formula <- stats::reformulate(
      features,
      response = "target"
    )
    
    return(ranger::ranger(
      formula = formula,
      data = train[, c("target", features), drop = FALSE],
      num.trees = 500,
      min.node.size = 5,
      seed = sample(1:1000,1)
    ))
  }
  
  if (model_name == "xgboost") {
    
    if (!requireNamespace("xgboost", quietly = TRUE)) {
      stop("Install xgboost using install.packages('xgboost').")
    }
    
    x <- as.matrix(train[, features, drop = FALSE])
    y <- as.numeric(train$target)
    
    return(xgboost::xgboost(
      x = x,
      y = y,
      nrounds = 150,
      max_depth = 3,
      learning_rate = 0.04,
      objective = "reg:squarederror"
    ))
  }
  
  stop("Unknown model.")
}


# Generate predictions using a trained model.
predict_inflation_model <- function(
    model_name, model, new_data, features) {
  
  if (model_name == "linear") {
    return(as.numeric(stats::predict(
      model,
      newdata = new_data
    )))
  }
  
  if (model_name == "random_forest") {
    return(as.numeric(stats::predict(
      model,
      data = new_data[, features, drop = FALSE]
    )$predictions))
  }
  
  if (model_name == "xgboost") {
    return(as.numeric(stats::predict(
      model,
      newdata = as.matrix(
        new_data[, features, drop = FALSE]
      )
    )))
  }
  
  stop("Unknown model.")
}


# Main forecasting function.
run_inflation_forecast <- function(horizon = 1) {
  
  horizon <- suppressWarnings(as.integer(horizon))
  
  if (length(horizon) != 1 ||
      is.na(horizon) ||
      !horizon %in% c(1L, 3L, 6L)) {
    stop("horizon must be 1, 3, or 6.")
  }
  
  if (!exists("monthly", inherits = TRUE)) {
    stop("The monthly dataset is not available.")
  }
  
  # Normalize duplicates and insert missing calendar months.
  raw <- prepare_inflation_monthly(monthly)
  
  if (sum(is.finite(raw$CPI_Inflation)) < 48) {
    stop("At least 48 observed monthly CPI values are recommended.")
  }
  
  features_data <- inflation_features(raw)
  
  feature_cols <- grep(
    "_lag(0|1|3|6|12)$",
    names(features_data),
    value = TRUE
  )
  
  # Direct target: CPI inflation exactly h calendar months ahead.
  features_data$target <- dplyr::lead(
    raw$CPI_Inflation,
    n = horizon
  )
  
  # Rows with missing-month gaps remain unusable until all required
  # lagged predictors and the target are observed.
  trainable <- features_data %>%
    filter(
      if_all(all_of(feature_cols), ~ is.finite(.x)),
      is.finite(target)
    )
  
  available_origins <- features_data %>%
    filter(
      if_all(all_of(feature_cols), ~ is.finite(.x))
    )
  
  if (nrow(trainable) < 36) {
    stop(
      "Only ", nrow(trainable),
      " complete training rows remain after handling missing months. ",
      "More complete historical data is needed."
    )
  }
  
  if (nrow(available_origins) == 0) {
    stop(
      "No month has all required predictors. ",
      "Check the CPI, WPI, FX and IIP data."
    )
  }
  
  # Latest month with complete predictors.
  origin_row <- available_origins %>%
    slice_tail(n = 1)
  
  origin_date <- as.Date(origin_row$Date[[1]])
  
  forecast_date <- origin_date %m+%
    lubridate::period(horizon, units = "months")
  
  # Chronological validation; never shuffle time-series rows.
  n <- nrow(trainable)
  split_at <- floor(n * 0.80)
  
  if (split_at < 24 || (n - split_at) < 6) {
    stop("Not enough observations for chronological validation.")
  }
  
  training <- trainable[
    seq_len(split_at), , drop = FALSE
  ]
  
  testing <- trainable[
    seq.int(split_at + 1, n), , drop = FALSE
  ]
  
  results <- list()
  
  for (model_name in names(inflation_model_names)) {
    
    result <- tryCatch({
      
      validation_model <- fit_inflation_model(
        model_name, training, feature_cols
      )
      
      predicted <- predict_inflation_model(
        model_name,
        validation_model,
        testing,
        feature_cols
      )
      
      actual_all <- as.numeric(testing$target)
      
      valid <- is.finite(predicted) & is.finite(actual_all)
      
      actual <- actual_all[valid]
      predicted <- predicted[valid]
      
      if (length(actual) == 0) {
        stop("No valid validation predictions.")
      }
      
      mae <- mean(abs(actual - predicted))
      rmse <- sqrt(mean((actual - predicted)^2))
      
      # Refit on every row whose future target is known.
      final_model <- fit_inflation_model(
        model_name, trainable, feature_cols
      )
      
      forecast_value <- predict_inflation_model(
        model_name,
        final_model,
        origin_row,
        feature_cols
      )[[1]]
      
      if (!is.finite(forecast_value)) {
        stop("Model returned an invalid forecast.")
      }
      
      list(
        ok = TRUE,
        model = model_name,
        label = unname(inflation_model_names[[model_name]]),
        forecast = as.numeric(forecast_value),
        mae = as.numeric(mae),
        rmse = as.numeric(rmse),
        validation_n = length(actual)
      )
      
    }, error = function(e) {
      
      list(
        ok = FALSE,
        model = model_name,
        label = unname(inflation_model_names[[model_name]]),
        error = conditionMessage(e)
      )
    })
    
    results[[model_name]] <- result
  }
  
  valid_results <- Filter(
    function(x) isTRUE(x$ok),
    results
  )
  
  if (length(valid_results) == 0) {
    
    error_messages <- vapply(
      results,
      function(x) {
        paste0(x$label, ": ", x$error)
      },
      character(1)
    )
    
    stop(
      "No forecasting model could run. ",
      paste(error_messages, collapse = " | ")
    )
  }
  
  # Persistence benchmark: current CPI as the future estimate.
  baseline_prediction <- as.numeric(testing$CPI_Inflation)
  baseline_actual <- as.numeric(testing$target)
  
  baseline_valid <- is.finite(baseline_prediction) &
    is.finite(baseline_actual)
  
  if (any(baseline_valid)) {
    
    baseline_mae <- mean(abs(
      baseline_actual[baseline_valid] -
        baseline_prediction[baseline_valid]
    ))
    
    baseline_rmse <- sqrt(mean(
      (
        baseline_actual[baseline_valid] -
          baseline_prediction[baseline_valid]
      )^2
    ))
    
  } else {
    baseline_mae <- NA_real_
    baseline_rmse <- NA_real_
  }
  
  best_index <- which.min(vapply(
    valid_results,
    function(x) x$rmse,
    numeric(1)
  ))
  
  best <- valid_results[[best_index]]
  
  list(
    horizon = horizon,
    target = "CPI_Inflation",
    unit = "percent",
    
    originDate = as.character(origin_date),
    forecastDate = as.character(forecast_date),
    
    latestCpi = as.numeric(
      origin_row$CPI_Inflation_lag0[[1]]
    ),
    
    bestModel = best$model,
    bestModelLabel = best$label,
    bestForecast = best$forecast,
    
    forecasts = lapply(
      valid_results,
      function(x) {
        list(
          model = x$model,
          label = x$label,
          forecast = x$forecast,
          mae = x$mae,
          rmse = x$rmse,
          validationObservations = x$validation_n
        )
      }
    ),
    
    unavailableModels = lapply(
      Filter(function(x) !isTRUE(x$ok), results),
      function(x) {
        list(
          model = x$model,
          label = x$label,
          error = x$error
        )
      }
    ),
    
    benchmark = list(
      mae = baseline_mae,
      rmse = baseline_rmse
    ),
    
    note = paste(
      "Forecasts are model estimates, not official CPI releases.",
      "Duplicate months are averaged. Missing months are retained",
      "with NA values; no observations are fabricated.",
      "Model selection uses chronological validation RMSE."
    )
  )
}


#* Forecast CPI inflation for 1, 3, or 6 months ahead
#* @param horizon Forecast horizon: 1, 3, or 6
#* @get /api/inflation/forecast
function(horizon = 1) {
  
  tryCatch(
    run_inflation_forecast(horizon),
    error = function(e) {
      list(error = conditionMessage(e))
    }
  )
}


#* Compare forecast models for a given horizon
#* @param horizon Forecast horizon: 1, 3, or 6
#* @get /api/inflation/metrics
function(horizon = 1) {
  
  result <- tryCatch(
    run_inflation_forecast(horizon),
    error = function(e) {
      list(error = conditionMessage(e))
    }
  )
  
  if (!is.null(result$error)) {
    return(result)
  }
  
  list(
    horizon = result$horizon,
    bestModel = result$bestModel,
    bestModelLabel = result$bestModelLabel,
    forecasts = result$forecasts,
    benchmark = result$benchmark,
    unavailableModels = result$unavailableModels
  )
}
