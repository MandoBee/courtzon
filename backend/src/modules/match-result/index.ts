export { matchResultRoutes } from './presentation/match-result.routes.js';
export { matchResultService } from './application/match-result.service.js';
export { matchResultRepository } from './infrastructure/match-result.repository.js';
export { ratingService } from './application/rating/rating.service.js';
export { validateAndComputeFinal, RulesValidationError } from './application/rules/rules-engine.js';
export { DEFAULT_SPORT_RULES, findDefaultRule } from './application/rules/default-rules.js';
export { processMatchResultDeadlines, scheduleMatchResultDeadlines } from './infrastructure/match-result-deadline.worker.js';
export type * from './domain/match-result.types.js';