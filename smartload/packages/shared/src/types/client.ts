export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
}

export interface Client {
  id: string;
  clientCode: string;
  name: string;
  gstin?: string | null;
  phone: string;
  email?: string | null;
  billingAddress: Address;
  shippingAddress: Address;
  contactPersonName?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
