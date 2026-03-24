import { MTNProvider } from './providers/mtn';
import { AirtelProvider } from './providers/airtel';
import { OrangeProvider } from './providers/orange';
import { transactionTotal, transactionErrorsTotal } from '../../utils/metrics';

interface MobileMoneyProvider {
  requestPayment(phoneNumber: string, amount: string): Promise<{ success: boolean; data?: unknown; error?: unknown }>;
  sendPayout(phoneNumber: string, amount: string): Promise<{ success: boolean; data?: unknown; error?: unknown }>;
}

export class MobileMoneyService {
  private providers: Map<string, MobileMoneyProvider>;

  constructor() {
    this.providers = new Map([
      ['mtn', new MTNProvider()],
      ['airtel', new AirtelProvider()],
      ['orange', new OrangeProvider()]
    ]);
  }

  async initiatePayment(provider: string, phoneNumber: string, amount: string) {
    const providerInstance = this.providers.get(provider.toLowerCase());
    
    if (!providerInstance) {
      throw new Error(`Provider ${provider} not supported`);
    }

    try {
      const result = await providerInstance.requestPayment(phoneNumber, amount);
      if (result.success) {
        transactionTotal.inc({ type: 'payment', provider, status: 'success' });
      } else {
        transactionTotal.inc({ type: 'payment', provider, status: 'failure' });
        transactionErrorsTotal.inc({ type: 'payment', provider, error_type: 'provider_error' });
      }
      return result;
    } catch (error) {
      transactionTotal.inc({ type: 'payment', provider, status: 'failure' });
      transactionErrorsTotal.inc({ type: 'payment', provider, error_type: 'exception' });
      throw error;
    }
  }

  async sendPayout(provider: string, phoneNumber: string, amount: string) {
    const providerInstance = this.providers.get(provider.toLowerCase());
    
    if (!providerInstance) {
      throw new Error(`Provider ${provider} not supported`);
    }

    try {
      const result = await providerInstance.sendPayout(phoneNumber, amount);
      if (result.success) {
        transactionTotal.inc({ type: 'payout', provider, status: 'success' });
      } else {
        transactionTotal.inc({ type: 'payout', provider, status: 'failure' });
        transactionErrorsTotal.inc({ type: 'payout', provider, error_type: 'provider_error' });
      }
      return result;
    } catch (error) {
      transactionTotal.inc({ type: 'payout', provider, status: 'failure' });
      transactionErrorsTotal.inc({ type: 'payout', provider, error_type: 'exception' });
      throw error;
    }
  }
}
