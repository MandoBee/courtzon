import type { WorkflowDefinition } from '../../../shared/workflow/workflow-definition.js';

export const bookingConfirmWorkflow: WorkflowDefinition = {
  workflowType: 'BookingConfirm',
  version: 1,
  startStep: 'confirm_booking',
  steps: [
    { name: 'confirm_booking', type: 'START_COMMAND', commandType: 'ConfirmBooking', next: 'end' },
    { name: 'end', type: 'END' },
  ],
};

export const bookingCancelWorkflow: WorkflowDefinition = {
  workflowType: 'BookingCancel',
  version: 1,
  startStep: 'cancel_booking',
  steps: [
    { name: 'cancel_booking', type: 'START_COMMAND', commandType: 'CancelBooking', next: 'end' },
    { name: 'end', type: 'END' },
  ],
};

export const bookingExpireWorkflow: WorkflowDefinition = {
  workflowType: 'BookingExpire',
  version: 1,
  startStep: 'expire_booking',
  steps: [
    { name: 'expire_booking', type: 'START_COMMAND', commandType: 'ExpireBooking', next: 'end' },
    { name: 'end', type: 'END' },
  ],
};

export const bookingCompleteWorkflow: WorkflowDefinition = {
  workflowType: 'BookingComplete',
  version: 1,
  startStep: 'complete_booking',
  steps: [
    { name: 'complete_booking', type: 'START_COMMAND', commandType: 'CompleteBooking', next: 'end' },
    { name: 'end', type: 'END' },
  ],
};

export const bookingWorkflows = [
  bookingConfirmWorkflow,
  bookingCancelWorkflow,
  bookingExpireWorkflow,
  bookingCompleteWorkflow,
];
