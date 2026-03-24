# Metrics Documentation

The following Prometheus metrics are exported by the application at `/metrics`.

## HTTP Metrics
- `http_requests_total`: Total number of HTTP requests.
  - Labels: `method`, `route`, `status_code`
- `http_request_duration_seconds`: Histogram of HTTP request durations.
  - Labels: `method`, `route`, `status_code`
  - Buckets: `0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10`
- `active_connections`: Gauge representing the current number of active HTTP connections.

## Business Logic Metrics
- `transaction_total`: Total number of transactions processed.
  - Labels: `type` (payment, payout, stellar_payment), `provider` (mtn, airtel, orange, stellar), `status` (success, failure)
- `transaction_errors_total`: Total number of transaction errors.
  - Labels: `type`, `provider`, `error_type` (provider_error, exception, stellar_error)

## Default Metrics
Standard Node.js metrics (CPU, Memory, Event Loop, etc.) are also exported via `prom-client`'s `collectDefaultMetrics`.
