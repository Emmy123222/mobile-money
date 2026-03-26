import request from 'supertest';
import app from '../src/index';
import { pool } from '../src/config/database';

describe('Reports Integration Tests', () => {
  const adminApiKey = process.env.ADMIN_API_KEY || 'dev-admin-key';

  beforeAll(async () => {
    // Setup test data
    await pool.query(`
      INSERT INTO transactions (reference_number, type, amount, phone_number, provider, stellar_address, status, created_at) VALUES
      ('TEST001', 'deposit', 1000.00, '+256700000001', 'MTN', 'GD1234567890', 'completed', '2026-03-01 10:00:00'),
      ('TEST002', 'withdraw', 500.00, '+256700000002', 'Airtel', 'GD1234567891', 'completed', '2026-03-01 11:00:00'),
      ('TEST003', 'deposit', 750.00, '+256700000003', 'Orange', 'GD1234567892', 'failed', '2026-03-02 10:00:00'),
      ('TEST004', 'deposit', 2000.00, '+256700000004', 'MTN', 'GD1234567893', 'completed', '2026-03-02 12:00:00'),
      ('TEST005', 'withdraw', 300.00, '+256700000005', 'Airtel', 'GD1234567894', 'failed', '2026-03-03 09:00:00')
      ON CONFLICT (reference_number) DO NOTHING
    `);
  });

  afterAll(async () => {
    // Cleanup test data
    await pool.query("DELETE FROM transactions WHERE reference_number LIKE 'TEST%'");
  });

  describe('GET /api/reports/reconciliation', () => {
    
    // Test 1: Authentication required
    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .get('/api/reports/reconciliation?startDate=2026-03-01&endDate=2026-03-03');
      
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    // Test 2: Invalid API key
    it('should return 401 with invalid API key', async () => {
      const res = await request(app)
        .get('/api/reports/reconciliation?startDate=2026-03-01&endDate=2026-03-03')
        .set('X-API-Key', 'invalid-key');
      
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    // Test 3: Missing required parameters
    it('should return 400 when startDate is missing', async () => {
      const res = await request(app)
        .get('/api/reports/reconciliation?endDate=2026-03-03')
        .set('X-API-Key', adminApiKey);
      
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('startDate and endDate query parameters are required');
    });

    // Test 4: Missing required parameters
    it('should return 400 when endDate is missing', async () => {
      const res = await request(app)
        .get('/api/reports/reconciliation?startDate=2026-03-01')
        .set('X-API-Key', adminApiKey);
      
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('startDate and endDate query parameters are required');
    });

    // Test 5: Invalid date format
    it('should return 400 for invalid date format', async () => {
      const res = await request(app)
        .get('/api/reports/reconciliation?startDate=01-03-2026&endDate=2026-03-03')
        .set('X-API-Key', adminApiKey);
      
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Invalid date format');
    });

    // Test 6: Start date after end date
    it('should return 400 when startDate is after endDate', async () => {
      const res = await request(app)
        .get('/api/reports/reconciliation?startDate=2026-03-05&endDate=2026-03-01')
        .set('X-API-Key', adminApiKey);
      
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('startDate must be before or equal to endDate');
    });

    // Test 7: Successful JSON report generation
    it('should return 200 and generate JSON reconciliation report', async () => {
      const res = await request(app)
        .get('/api/reports/reconciliation?startDate=2026-03-01&endDate=2026-03-03')
        .set('X-API-Key', adminApiKey);
      
      expect(res.status).toBe(200);
      
      const report = res.body;
      expect(report).toHaveProperty('period');
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('byProvider');
      expect(report).toHaveProperty('dailyBreakdown');

      // Check period
      expect(report.period.start).toBe('2026-03-01');
      expect(report.period.end).toBe('2026-03-03');

      // Check summary structure
      expect(report.summary).toHaveProperty('totalTransactions');
      expect(report.summary).toHaveProperty('successfulTransactions');
      expect(report.summary).toHaveProperty('failedTransactions');
      expect(report.summary).toHaveProperty('successRate');
      expect(report.summary).toHaveProperty('totalVolume');
      expect(report.summary).toHaveProperty('totalFees');

      // Check provider breakdown
      expect(report.byProvider).toHaveProperty('MTN');
      expect(report.byProvider).toHaveProperty('Airtel');
      expect(report.byProvider).toHaveProperty('Orange');

      // Verify calculations
      expect(report.summary.totalTransactions).toBe(5);
      expect(report.summary.successfulTransactions).toBe(3);
      expect(report.summary.failedTransactions).toBe(2);
      expect(report.summary.successRate).toBe(60.0);
      expect(report.summary.totalVolume).toBe(4550.00);
      expect(report.summary.totalFees).toBe(91.00);

      // Check provider breakdown
      expect(report.byProvider.MTN.count).toBe(2);
      expect(report.byProvider.MTN.volume).toBe(3000.00);
      expect(report.byProvider.Airtel.count).toBe(2);
      expect(report.byProvider.Airtel.volume).toBe(800.00);
      expect(report.byProvider.Orange.count).toBe(1);
      expect(report.byProvider.Orange.volume).toBe(750.00);
    });

    // Test 8: Successful CSV report generation
    it('should return 200 and generate CSV reconciliation report', async () => {
      const res = await request(app)
        .get('/api/reports/reconciliation?startDate=2026-03-01&endDate=2026-03-03&format=csv')
        .set('X-API-Key', adminApiKey);
      
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(res.headers['content-disposition']).toContain('reconciliation_report_2026-03-01_to_2026-03-03.csv');
      
      const csv = res.text;
      expect(csv).toContain('Date,Provider,Total Transactions,Successful Transactions,Failed Transactions,Success Rate (%),Total Volume,Total Fees');
      expect(csv).toContain('2026-03-01 to 2026-03-03,ALL,5,3,2,60.0,4550,91');
      expect(csv).toContain('MTN');
      expect(csv).toContain('Airtel');
      expect(csv).toContain('Orange');
    });

    // Test 9: Empty date range
    it('should return 200 for date range with no transactions', async () => {
      const res = await request(app)
        .get('/api/reports/reconciliation?startDate=2026-04-01&endDate=2026-04-02')
        .set('X-API-Key', adminApiKey);
      
      expect(res.status).toBe(200);
      
      const report = res.body;
      expect(report.summary.totalTransactions).toBe(0);
      expect(report.summary.successfulTransactions).toBe(0);
      expect(report.summary.failedTransactions).toBe(0);
      expect(report.summary.successRate).toBe(0);
      expect(report.summary.totalVolume).toBe(0);
      expect(report.summary.totalFees).toBe(0);
      expect(Object.keys(report.byProvider)).toHaveLength(0);
    });

    // Test 10: Single day report
    it('should generate report for single day', async () => {
      const res = await request(app)
        .get('/api/reports/reconciliation?startDate=2026-03-01&endDate=2026-03-01')
        .set('X-API-Key', adminApiKey);
      
      expect(res.status).toBe(200);
      
      const report = res.body;
      expect(report.summary.totalTransactions).toBe(2);
      expect(report.summary.successfulTransactions).toBe(2);
      expect(report.summary.failedTransactions).toBe(0);
      expect(report.summary.successRate).toBe(100.0);
    });

    // Test 11: Large date range performance
    it('should handle large date ranges efficiently', async () => {
      const startTime = Date.now();
      
      const res = await request(app)
        .get('/api/reports/reconciliation?startDate=2026-01-01&endDate=2026-12-31')
        .set('X-API-Key', adminApiKey);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(res.status).toBe(200);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    });

    // Test 12: Caching functionality
    it('should cache report results', async () => {
      // First request
      const startTime1 = Date.now();
      const res1 = await request(app)
        .get('/api/reports/reconciliation?startDate=2026-03-01&endDate=2026-03-03')
        .set('X-API-Key', adminApiKey);
      const endTime1 = Date.now();
      const duration1 = endTime1 - startTime1;

      // Second request (should be cached)
      const startTime2 = Date.now();
      const res2 = await request(app)
        .get('/api/reports/reconciliation?startDate=2026-03-01&endDate=2026-03-03')
        .set('X-API-Key', adminApiKey);
      const endTime2 = Date.now();
      const duration2 = endTime2 - startTime2;

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res1.body).toEqual(res2.body);
      
      // Second request should be faster due to caching
      expect(duration2).toBeLessThan(duration1);
    });
  });

  describe('Report Data Validation', () => {
    
    // Test 13: Fee calculation accuracy
    it('should calculate fees correctly (2% of volume)', async () => {
      const res = await request(app)
        .get('/api/reports/reconciliation?startDate=2026-03-01&endDate=2026-03-03')
        .set('X-API-Key', adminApiKey);
      
      expect(res.status).toBe(200);
      
      const report = res.body;
      const expectedFees = report.summary.totalVolume * 0.02;
      expect(report.summary.totalFees).toBeCloseTo(expectedFees, 2);
    });

    // Test 14: Success rate calculation
    it('should calculate success rate correctly', async () => {
      const res = await request(app)
        .get('/api/reports/reconciliation?startDate=2026-03-01&endDate=2026-03-03')
        .set('X-API-Key', adminApiKey);
      
      expect(res.status).toBe(200);
      
      const report = res.body;
      const expectedSuccessRate = (report.summary.successfulTransactions / report.summary.totalTransactions) * 100;
      expect(report.summary.successRate).toBeCloseTo(expectedSuccessRate, 1);
    });

    // Test 15: Daily breakdown accuracy
    it('should provide accurate daily breakdown', async () => {
      const res = await request(app)
        .get('/api/reports/reconciliation?startDate=2026-03-01&endDate=2026-03-03')
        .set('X-API-Key', adminApiKey);
      
      expect(res.status).toBe(200);
      
      const report = res.body;
      expect(report.dailyBreakdown).toHaveLength(3); // 3 days: 2026-03-01, 2026-03-02, 2026-03-03

      // Check March 1st data
      const march1 = report.dailyBreakdown.find((day: any) => day.date === '2026-03-01');
      expect(march1).toBeDefined();
      expect(march1!.totalTransactions).toBe(2);
      expect(march1!.successfulTransactions).toBe(2);
      expect(march1!.failedTransactions).toBe(0);
      expect(march1!.totalVolume).toBe(1500.00);

      // Check March 2nd data
      const march2 = report.dailyBreakdown.find((day: any) => day.date === '2026-03-02');
      expect(march2).toBeDefined();
      expect(march2!.totalTransactions).toBe(2);
      expect(march2!.successfulTransactions).toBe(1);
      expect(march2!.failedTransactions).toBe(1);
      expect(march2!.totalVolume).toBe(2750.00);

      // Check March 3rd data
      const march3 = report.dailyBreakdown.find((day: any) => day.date === '2026-03-03');
      expect(march3).toBeDefined();
      expect(march3!.totalTransactions).toBe(1);
      expect(march3!.successfulTransactions).toBe(0);
      expect(march3!.failedTransactions).toBe(1);
      expect(march3!.totalVolume).toBe(300.00);
    });
  });
});
