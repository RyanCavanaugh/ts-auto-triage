import type { CurationTrigger } from './types.js';
import { DomainLabelTrigger } from './domain-label.js';
import { MaintainerResponseTrigger } from './maintainer-response.js';

// Re-export types
export type { CurationTrigger, RepositoryMetadata } from './types.js';

/**
 * Main function to get all available triggers
 */
export function getAllTriggers(): CurationTrigger[] {
  return [
    new DomainLabelTrigger(),
    new MaintainerResponseTrigger(),
  ];
}

// Re-export trigger classes
export { DomainLabelTrigger } from './domain-label.js';
export { MaintainerResponseTrigger } from './maintainer-response.js';
