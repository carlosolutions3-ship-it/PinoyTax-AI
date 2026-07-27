export const QUEUE_NAMES = {
  COMPLIANCE_SCAN: 'compliance-scan',
  NOTIFICATION_DISPATCH: 'notification-dispatch',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
