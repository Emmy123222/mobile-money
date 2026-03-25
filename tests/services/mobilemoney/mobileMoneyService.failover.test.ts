import { MobileMoneyService } from "../../../src/services/mobilemoney/mobileMoneyService";

class FakeProvider {
  constructor(private succeed: boolean, private name = "fake") {}
  async requestPayment(phoneNumber: string, amount: string) {
    if (this.succeed) return { success: true, data: { reference: `${this.name}-ref` } };
    return { success: false, error: "failed" };
  }
  async sendPayout(phoneNumber: string, amount: string) {
    if (this.succeed) return { success: true, data: { reference: `${this.name}-payout` } };
    return { success: false, error: "failed" };
  }
}

describe("MobileMoneyService failover", () => {
  beforeEach(() => {
    process.env.PROVIDER_FAILOVER_ENABLED = "true";
    delete process.env.PROVIDER_BACKUP_MTN;
  });

  it("should failover to backup when primary fails", async () => {
    process.env.PROVIDER_BACKUP_MTN = "airtel";

    const providers = new Map();
    providers.set("mtn", new FakeProvider(false, "mtn"));
    providers.set("airtel", new FakeProvider(true, "airtel"));

    const svc = new MobileMoneyService(providers as any);

    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    const res = await svc.initiatePayment("mtn", "+111111111", "100");

    expect(res).toBeDefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Failing over from mtn to airtel"));

    warn.mockRestore();
  });

  it("should throw when both primary and backup fail", async () => {
    process.env.PROVIDER_BACKUP_MTN = "airtel";

    const providers = new Map();
    providers.set("mtn", new FakeProvider(false, "mtn"));
    providers.set("airtel", new FakeProvider(false, "airtel"));

    const svc = new MobileMoneyService(providers as any);

    await expect(svc.initiatePayment("mtn", "+111111111", "100")).rejects.toThrow();
  });

  it("notifies on repeated failovers", async () => {
    process.env.PROVIDER_BACKUP_MTN = "airtel";

    const providers = new Map();
    // primary fails, backup succeeds
    providers.set("mtn", new FakeProvider(false, "mtn"));
    providers.set("airtel", new FakeProvider(true, "airtel"));

    const svc = new MobileMoneyService(providers as any);

    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const error = jest.spyOn(console, "error").mockImplementation(() => {});

    // Trigger failover 3 times to hit alert threshold
    await svc.initiatePayment("mtn", "+1", "10");
    await svc.initiatePayment("mtn", "+2", "10");
    await svc.initiatePayment("mtn", "+3", "10");

    expect(error).toHaveBeenCalledWith(expect.stringContaining("Failover alert: provider=mtn"));

    warn.mockRestore();
    error.mockRestore();
  });
});
