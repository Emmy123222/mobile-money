import request from 'supertest';
import app from '../src/index';
import { TransactionModel } from '../src/models/transaction';

jest.mock('../src/models/transaction', () => {
  return {
    TransactionModel: jest.fn().mockImplementation(() => {
      return {
        list: jest.fn().mockResolvedValue([
          { id: '1', amount: '100', type: 'deposit', created_at: new Date().toISOString() },
          { id: '2', amount: '50', type: 'withdraw', created_at: new Date().toISOString() }
        ]),
        count: jest.fn().mockResolvedValue(2)
      };
    }),
    TransactionStatus: {
      Pending: "pending",
      Completed: "completed",
      Failed: "failed",
      Cancelled: "cancelled",
    }
  };
});

describe('Transaction History Integration Tests', () => {
  
  // Test 1: Validate Date Format
  it('should return 400 for invalid date formats', async () => {
    const res = await request(app)
      .get('/api/transactions?startDate=01-01-2026'); // Wrong format (DD-MM-YYYY)
    
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid date format');
  });

  // Test 2: Validate Date Logic (Start > End)
  it('should return 400 if startDate is after endDate', async () => {
    const res = await request(app)
      .get('/api/transactions?startDate=2026-03-31&endDate=2026-03-01');
    
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('startDate cannot be greater than endDate');
  });

  // Test 3: Successful Filtering & Pagination
  it('should return 200 and paginated data for valid ranges', async () => {
    const res = await request(app)
      .get('/api/transactions?startDate=2026-03-01&endDate=2026-03-31&offset=0&limit=5');
    
    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({
      total: expect.any(Number),
      limit: 5,
      offset: 0,
      hasMore: expect.any(Boolean)
    });
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});