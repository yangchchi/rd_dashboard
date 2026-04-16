import { shouldTriggerAuthSubmitOnKeyDown } from '../../web/src/lib/auth-form';

describe('shouldTriggerAuthSubmitOnKeyDown', () => {
  it('returns true when Enter is pressed', () => {
    expect(shouldTriggerAuthSubmitOnKeyDown({ key: 'Enter' })).toBe(true);
  });

  it('returns false for non-Enter keys', () => {
    expect(shouldTriggerAuthSubmitOnKeyDown({ key: 'Tab' })).toBe(false);
  });
});
