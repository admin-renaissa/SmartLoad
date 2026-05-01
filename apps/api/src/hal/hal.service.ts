/**
 * HAL Service — driver registry and dispatcher
 */

import type { FastifyInstance } from 'fastify';
import type { IScannerDriver, ScannerInput } from './hal.interface.js';
import { HIDKeyboardDriver } from './drivers/hid-keyboard.driver.js';
import { SerialDriver } from './drivers/serial.driver.js';
import { ZebraDataWedgeDriver } from './drivers/zebra-datawedge.driver.js';
import { CameraDriver } from './drivers/camera.driver.js';

const DRIVER_REGISTRY: Record<string, IScannerDriver> = {
  'hid-keyboard': new HIDKeyboardDriver(),
  serial: new SerialDriver(),
  'zebra-datawedge': new ZebraDataWedgeDriver(),
  camera: new CameraDriver(),
};

export class HalService {
  private activeDriver: IScannerDriver = DRIVER_REGISTRY['hid-keyboard'];

  constructor(private readonly app: FastifyInstance) {}

  async loadDriverFromConfig(): Promise<void> {
    try {
      const config = await this.app.prisma.systemConfig.findUnique({
        where: { key: 'SCANNER_DRIVER' },
      });
      const driverName = config?.value ?? 'hid-keyboard';
      await this.setDriver(driverName);
    } catch (err) {
      this.app.log.warn({ err }, 'Failed to load scanner driver from config — using hid-keyboard');
      await this.setDriver('hid-keyboard');
    }
  }

  async setDriver(driverName: string): Promise<void> {
    const driver = DRIVER_REGISTRY[driverName];
    if (!driver) {
      throw new Error(`Scanner driver "${driverName}" not found. Available: ${Object.keys(DRIVER_REGISTRY).join(', ')}`);
    }
    if (this.activeDriver.destroy) await this.activeDriver.destroy();
    this.activeDriver = driver;
    if (driver.init) await driver.init();
    this.app.log.info({ driverName }, 'Scanner driver loaded');
  }

  getActiveDriver(): IScannerDriver {
    return this.activeDriver;
  }

  listDrivers(): { name: string; description: string; isActive: boolean }[] {
    return Object.entries(DRIVER_REGISTRY).map(([name, driver]) => ({
      name,
      description: driver.description,
      isActive: this.activeDriver.driverName === name,
    }));
  }

  processRawScan(raw: string, deviceId?: string): ScannerInput {
    try {
      return this.activeDriver.parseRawInput(raw, deviceId);
    } catch {
      return this.activeDriver.parseRawInput(String(raw), deviceId);
    }
  }
}
