import { describe, expect, it } from 'vitest';
import { classifyLoginIdentifier, normalizeLoginMobile, normalizeVerifiedNepalMobile } from './login-identifier';

describe('login identifier', () => {
  it('recognizes email addresses without regard to case', () => {
    expect(classifyLoginIdentifier(' Admin@Example.com ')).toEqual({
      type: 'email', value: 'admin@example.com',
    });
  });
  it('accepts a ten-digit Nepal mobile number', () => {
    expect(classifyLoginIdentifier('9812345678')).toEqual({
      type: 'mobile', value: '9812345678',
    });
  });
  it('normalizes Nepal country prefixes and separators', () => {
    expect(normalizeLoginMobile('+977 981-234-5678')).toBe('9812345678');
    expect(normalizeLoginMobile('9779812345678')).toBe('9812345678');
  });
  it('accepts only mobile ranges supported by BizSathi member records', () => {
    expect(normalizeVerifiedNepalMobile('+977 981-234-5678')).toBe('9812345678');
    expect(normalizeVerifiedNepalMobile('8812345678')).toBeNull();
    expect(normalizeVerifiedNepalMobile('981234567')).toBeNull();
  });
  it('rejects incomplete or malformed mobile identifiers', () => {
    expect(normalizeLoginMobile('981234567')).toBeNull();
    expect(normalizeLoginMobile('98abc45678')).toBeNull();
  });
  it('does not classify an invalid identifier', () => {
    expect(classifyLoginIdentifier('not-an-email-or-mobile')).toBeNull();
  });
});
