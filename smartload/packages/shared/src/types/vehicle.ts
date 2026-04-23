export enum VehicleType {
  TRUCK = 'TRUCK',
  TEMPO = 'TEMPO',
  VAN = 'VAN',
  MINI_TRUCK = 'MINI_TRUCK',
  OTHER = 'OTHER',
}

export interface Vehicle {
  id: string;
  registrationNumber: string;
  type: VehicleType;
  capacityKg?: number | null;
  driverName: string;
  driverPhone: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Trip {
  vehicleId: string;
  sessionId: string;
  startedAt: string;
  completedAt?: string | null;
}
