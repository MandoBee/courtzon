export { notificationPlatform } from './NotificationPlatformImpl.js';
export type { NotificationPlatform } from '../contracts/NotificationPlatform.js';
export { notificationEngine } from './application/notification-engine.js';
export {
  dispatchToUser, dispatchBulk, dispatchByRole, dispatchByOrg,
  dispatchByBranch, dispatchToAll, dispatchByUserIdsBulk,
} from './application/dispatcher.service.js';
export type { DispatchOptions } from './application/dispatcher.service.js';
export { getTemplate, resolveTemplate, seedTemplates } from './application/template.service.js';
export {
  scheduleBookingReminder, scheduleMembershipReminder,
  scheduleBirthdayGreeting, scheduleReviewReminder,
  processScheduledBroadcasts,
} from './application/scheduler.service.js';
export {
  handleProcessNotification, handleSendNotificationBatch,
  handleProcessNotificationDigest, handleSendScheduledNotification,
  handleProcessDeadLetter, handleRetryFailedDeliveries,
} from './infrastructure/notification.worker.js';
export {
  getProvider, registerProvider, getProvidersForChannel,
  getEnabledProviders, deliverToChannel,
} from './infrastructure/providers/provider.interface.js';
export type { DeliveryChannel, DeliveryResult, NotificationProvider } from './infrastructure/providers/provider.interface.js';
export { InAppProvider } from './infrastructure/providers/in-app.provider.js';
export { NotificationRepository, notificationRepository } from './infrastructure/repositories/notification.repository.js';
export {
  createDelivery, updateDeliveryStatus, getPendingDeliveries,
  getFailedDeliveries, recordAnalytics, sendToDeadLetter,
  retryFromDeadLetter, getDeadLetters, removeDeadLetter,
} from './infrastructure/repositories/delivery.repository.js';
export { registerAllProviders } from './provider-registry.js';
