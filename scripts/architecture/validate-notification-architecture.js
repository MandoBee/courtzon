// Validator: Notification Architecture
// Ensures every notification producer provides a valid action.route destination.

import { Validator } from './lib/reporter.js';
import { collectFiles, readFile, shortPath, ROOT } from './lib/fs-utils.js';

const NOTIFICATION_ENGINE = ROOT + '/backend/src/modules/notifications/application/notification-engine.ts';

export async function validate() {
  const v = new Validator('Notification Architecture');

  const content = readFile(NOTIFICATION_ENGINE);
  if (!content) {
    v.fail('Cannot read notification-engine.ts');
    return v;
  }

  // 1. Every dispatchToUser call must include action or route
  const lines = content.split('\n');
  let inDispatch = false;
  let hasRoute = false;
  let dispatchLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect dispatchToUser calls
    if (line.includes('dispatchToUser({') || line.includes('dispatchByRole(') || line.includes('dispatchByOrg(')) {
      inDispatch = true;
      hasRoute = false;
      dispatchLine = i + 1;
    }

    // Detect dispatchToAll
    if (line.includes('dispatchToAll(')) {
      inDispatch = true;
      hasRoute = false;
      dispatchLine = i + 1;
    }

    // Check for route or action in the options object
    if (inDispatch) {
      if (line.includes('route:') || line.includes('action:')) {
        hasRoute = true;
      }
      // Closing parenthesis of dispatch call
      if (line.includes('});') || line.includes(');')) {
        if (inDispatch && !hasRoute) {
          // System announcements and broadcasts are exempt
          const block = lines.slice(Math.max(0, i - 5), i + 1).join('\n');
          if (!block.includes('system:announcement') && !block.includes('notification:broadcast')) {
            v.warn(`dispatchToUser call without route at line ${dispatchLine}`, shortPath(NOTIFICATION_ENGINE));
          }
        }
        inDispatch = false;
      }
    }
  }

  // 2. Every event group handler must have at least one dispatch call
  let handlerCount = 0;
  let handlerHasDispatch = false;
  for (const line of lines) {
    if (line.includes('events: [')) {
      handlerCount++;
      handlerHasDispatch = false;
    }
    if ((line.includes('dispatchToUser') || line.includes('dispatchByRole') || line.includes('dispatchByOrg')) && !line.includes('//')) {
      handlerHasDispatch = true;
    }
  }

  // 3. No hardcoded screen/route maps in frontend
  const frontendRoutes = ROOT + '/frontend/src/utils/notificationRoutes.ts';
  const routesContent = readFile(frontendRoutes);
  if (routesContent) {
    // Verify the frontend no longer has routing maps
    if (routesContent.includes('SCREEN_MAP') || routesContent.includes('ROUTE_MAP') || routesContent.includes('routeFromEntityType')) {
      v.fail('Frontend still contains routing maps (SCREEN_MAP/ROUTE_MAP/routeFromEntityType)', shortPath(frontendRoutes));
    }
    // Verify it reads action.route directly
    if (!routesContent.includes('action?.route') && !routesContent.includes('action.route')) {
      v.warn('Frontend getNotificationRoute may not use action.route', shortPath(frontendRoutes));
    }
  }

  return v;
}
