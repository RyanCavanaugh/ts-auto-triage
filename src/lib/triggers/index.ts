import { DomainLabelTrigger } from './domain-label.js';
import { MaintainerResponseTrigger } from './maintainer-response.js';
import type { CurationTrigger, RepositoryMetadata } from './types.js';

// Re-export types
export type { CurationTrigger, RepositoryMetadata } from './types.js';

// Re-export trigger classes
export { DomainLabelTrigger } from './domain-label.js';
export { MaintainerResponseTrigger } from './maintainer-response.js';

/**
 * Main function to get all available triggers
 */
export function getAllTriggers(): CurationTrigger[] {
  return [
    new DomainLabelTrigger(),
    new MaintainerResponseTrigger(),
  ];
}
