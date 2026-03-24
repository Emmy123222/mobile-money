import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

const register = new Registry();

// Add default metrics (CPU, Memory, etc.)
collectDefaultMetrics({ register });

// HTTP Metrics
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10], // standard buckets
  registers: [register],
});

// Business Logic Metrics
export const transactionTotal = new Counter({
  name: 'transaction_total',
  help: 'Total number of transactions processed',
  labelNames: ['type', 'provider', 'status'], // type: payment/payout
  registers: [register],
});

export const transactionErrorsTotal = new Counter({
  name: 'transaction_errors_total',
  help: 'Total number of transaction errors',
  labelNames: ['type', 'provider', 'error_type'],
  registers: [register],
});

// Connection Metrics
export const activeConnections = new Gauge({
  name: 'active_connections',
  help: 'Number of active HTTP connections',
  registers: [register],
});

export { register };
