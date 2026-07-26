// Validator: EventBus Architecture
// Ensures domain events are only emitted through EventBus, not via direct Socket.IO
// or other side-channel communication.

import { Validator } from './lib/reporter.js';
import { collectFiles, readFile, shortPath, ROOT } from './lib/fs-utils.js';

const BACKEND_SRC = ROOT + '/backend/src';

export async function validate() {
  const v = new Validator('EventBus Architecture');

  // 1. No direct Socket.IO emits outside the realtime module
  const socketFiles = collectFiles(BACKEND_SRC, f => f.endsWith('.ts') && !f.endsWith('.spec.ts'));
  for (const file of socketFiles) {
    const content = readFile(file);
    const relativePath = shortPath(file);
    // Skip the realtime module itself and test files
    if (relativePath.includes('/realtime/') || relativePath.includes('/socket-')) continue;

    // Check for direct Socket.IO usage
    const lines = content.split('\n');
    for (const line of lines) {
      if ((line.includes('socket.io') || line.includes('socketIo') || line.includes('.emit(')) &&
          !line.includes('eventBusV2.emit') && !line.includes('eventBusV2.on') &&
          !line.includes('// socket') && !line.includes('/*') && !line.trim().startsWith('//')) {
        // Only flag if it looks like a direct emit on a socket.io server instance
        if (/(socket\.io|\.to\(|\.emit\()/.test(line) && !line.includes('eventBusV2')) {
          v.warn(`Possible direct Socket.IO usage outside realtime module`, `${relativePath}: ${line.trim().substring(0, 100)}`);
        }
      }
    }
  }

  // 2. Domain events must go through EventBus V2
  for (const file of socketFiles) {
    const content = readFile(file);
    const relativePath = shortPath(file);
    // Check for eventBus.emit (legacy) without eventBusV2
    if (content.includes('eventBus.emit(') && !content.includes('eventBusV2.emit(')) {
      v.fail(`Legacy eventBus.emit() used instead of eventBusV2.emit()`, relativePath);
    }
  }

  // 3. Notification engine must subscribe via eventBusV2.on
  const notificationFiles = collectFiles(
    BACKEND_SRC + '/modules/notifications',
    f => f.endsWith('.ts') && !f.endsWith('.spec.ts')
  );
  let notificationUsesEventBus = false;
  for (const file of notificationFiles) {
    const content = readFile(file);
    if (content.includes('eventBusV2.on(')) {
      notificationUsesEventBus = true;
    }
  }
  if (!notificationUsesEventBus) {
    v.fail('Notification engine does not subscribe via eventBusV2.on()');
  }

  // 4. Check that eventBusV2 is properly imported
  const eventBusImportMissing = [];
  for (const file of socketFiles) {
    const content = readFile(file);
    const relativePath = shortPath(file);
    if (content.includes('eventBusV2.emit(') && !content.includes("from '../../shared/event-bus") && !content.includes("from '../../../shared/event-bus")) {
      // Allow imports from the index barrel
      if (!content.includes('@courtzon/') && !content.includes('/event-bus/index')) {
        eventBusImportMissing.push(relativePath);
      }
    }
  }
  if (eventBusImportMissing.length > 0) {
    for (const f of eventBusImportMissing) {
      v.warn('eventBusV2 used but import path not verified', f);
    }
  }

  return v;
}
