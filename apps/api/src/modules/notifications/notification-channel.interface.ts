export interface NotificationPayload {
  to: string;
  title: string;
  body: string;
}

export interface NotificationChannelHandler {
  readonly channel: 'email' | 'sms' | 'push' | 'in_app';
  send(payload: NotificationPayload): Promise<void>;
}
