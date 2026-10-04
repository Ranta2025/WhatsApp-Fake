import { describe, it, expect } from 'vitest';
import { resolveCountryFields } from './phoneCountry';

// react-phone-input-2 declares the second onChange argument as
// `CountryData | {}`, but at runtime it can arrive as an empty object or even
// null/undefined before a country is selected. The M6 typing used the `in`
// operator (`'dialCode' in countryData`), which throws a TypeError on null —
// the pre-TypeScript code used `countryData?.dialCode || fallback`.
describe('resolveCountryFields', () => {
    it('reads dialCode/countryCode from CountryData', () => {
        expect(resolveCountryFields({ dialCode: '1', countryCode: 'us' }, '53', 'cu')).toEqual({
            dialCode: '1',
            countryCode: 'us',
        });
    });

    it('falls back for the empty object passed before a selection', () => {
        expect(resolveCountryFields({}, '53', 'cu')).toEqual({ dialCode: '53', countryCode: 'cu' });
    });

    it('falls back instead of throwing when the country argument is null/undefined', () => {
        expect(resolveCountryFields(null, '53', 'cu')).toEqual({ dialCode: '53', countryCode: 'cu' });
        expect(resolveCountryFields(undefined, '53', 'cu')).toEqual({ dialCode: '53', countryCode: 'cu' });
    });

    it('ignores non-string fields', () => {
        expect(resolveCountryFields({ dialCode: 1, countryCode: null }, '53', 'cu')).toEqual({
            dialCode: '53',
            countryCode: 'cu',
        });
    });
});
