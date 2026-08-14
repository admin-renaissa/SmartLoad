import type { VehicleType } from './enums.js'

export interface Vehicle {
  id: string
  registrationNumber: string
  type: VehicleType
  capacityKg: number | null
  driverName: string
  driverPhone: string
  isActive: boolean
  currentSession?: import('./dispatch.js').DispatchSession | null
  createdAt: string
  updatedAt: string
}
