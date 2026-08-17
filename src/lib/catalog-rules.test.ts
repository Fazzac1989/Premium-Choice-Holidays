import { describe, expect, it } from 'vitest';

import { MOCK_PROPERTIES } from './suppliers/mock/fixtures';
import { SCENARIO_PROPERTIES } from './suppliers/mock/scenarios';
import { isPublicProperty } from './catalog-rules';

describe('the public catalogue', () => {
  it('admits every real mock property', () => {
    for (const property of MOCK_PROPERTIES) {
      expect(isPublicProperty(property.externalPropertyId)).toBe(true);
    }
  });

  it('never admits a scenario property — customers cannot book a staged failure', () => {
    for (const property of SCENARIO_PROPERTIES) {
      expect(isPublicProperty(property.externalPropertyId)).toBe(false);
    }
  });
});
