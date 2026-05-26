import { parseThemePreference } from '../../shared/user-settings';

describe('shared user-settings', () => {
  it('parses theme preference values', () => {
    expect(parseThemePreference('light')).toBe('light');
    expect(parseThemePreference('dark')).toBe('dark');
    expect(parseThemePreference('system')).toBe('system');
    expect(parseThemePreference('invalid')).toBeUndefined();
  });
});
