export interface BookingData {
  service: string;
  date: string;
  time: string;
  seats: number;
  name: string;
  email: string;
  phone: string;
}

export interface BookingConfirmationAction {
  type: "booking_confirmation";
  data: BookingData;
}

export interface BookingSuccessAction {
  type: "booking_success";
  data: BookingData;
}

export type BookingAction = BookingConfirmationAction | BookingSuccessAction;

export interface CustomChatAction<TType extends string = string, TData = unknown> {
  type: TType;
  data: TData;
}

export type ChatAction<TCustomAction extends CustomChatAction = never> =
  | BookingAction
  | TCustomAction;
