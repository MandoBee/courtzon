import type { WorkflowDefinition } from '../../../shared/workflow/workflow-definition.js';

export const paymentProcessWorkflow: WorkflowDefinition = {
  workflowType: 'PaymentProcess',
  version: 1,
  startStep: 'process_payment',
  steps: [
    { name: 'process_payment', type: 'START_COMMAND', commandType: 'ProcessPayment', next: 'end' },
    { name: 'end', type: 'END' },
  ],
};

export const paymentWorkflows = [paymentProcessWorkflow];
