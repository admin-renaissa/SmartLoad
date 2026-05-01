import type { IScannerDriver, ScannerInput } from './hal.interface.js';
import { HidKeyboardDriver } from './drivers/hid-keyboard.driver.js';

export class HalService {
  private driver: IScannerDriver;

  constructor(driver?: IScannerDriver) {
    this.driver = driver ?? new HidKeyboardDriver();
  }

  getDriver(): IScannerDriver {
    return this.driver;
  }

  setDriver(driver: IScannerDriver): void {
    this.driver = driver;
  }

  async init(config: Record<string, unknown> = {}): Promise<void> {
    await this.driver.init(config);
  }

  parseRawInput(raw: string): ScannerInput {
    return this.driver.parseRawInput(raw);
  }
}
