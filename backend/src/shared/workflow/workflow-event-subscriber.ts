import { createSubscriberWorker } from '../event-bus/subscriber.worker.js';
import { workflowDispatcher } from './workflow-dispatcher.js';
import { createModuleLogger } from '../utils/logger.js';
import type { EventEnvelope } from '../event-bus/event-envelope.js';
import type { Worker } from 'bullmq';

const log = createModuleLogger('workflow');

const WORKFLOW_SUBSCRIBER_ID = 'workflow-engine';
export const WORKFLOW_QUEUE_NAME = 'events.workflow';

export function startWorkflowSubscriber(): Worker {
  const worker = createSubscriberWorker({
    subscriberId: WORKFLOW_SUBSCRIBER_ID,
    queueName: WORKFLOW_QUEUE_NAME,
    concurrency: 3,
    attempts: 6,
    backoffDelay: 2000,
    handler: async (envelope: EventEnvelope) => {
      await workflowDispatcher.dispatchEvent(
        envelope.eventName,
        envelope.aggregateId,
        envelope.payload,
        { correlationId: envelope.correlationId, causationId: envelope.eventId },
      );
    },
  });

  log.info({ queue: WORKFLOW_QUEUE_NAME }, 'workflow.subscriber_started');
  return worker;
}
