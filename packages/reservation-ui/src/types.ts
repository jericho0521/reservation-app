export interface BookingLabels {
  service: string;
  date: string;
  time: string;
  quantity: string;
  resource: string;
  customerName: string;
  customerEmail: string;
  purpose: string;
}

export interface ThemeClasses {
  brandName?: string;
  shell?: string;
  panel?: string;
  button?: string;
  buttonDisabled?: string;
  input?: string;
  selected?: string;
  muted?: string;
  error?: string;
  success?: string;
}

export const defaultBookingLabels: BookingLabels = {
  service: "Service",
  date: "Date",
  time: "Time",
  quantity: "Quantity",
  resource: "Resource",
  customerName: "Name",
  customerEmail: "Email",
  purpose: "Purpose",
};
