export interface PhoneCountryFields {
    dialCode: string;
    countryCode: string;
}

/** Reads a string-valued own property from any object, or `undefined`. */
function readStringField(value: unknown, key: string): string | undefined {
    if (typeof value !== 'object' || value === null) return undefined;
    const field = (value as Record<string, unknown>)[key];
    return typeof field === 'string' && field ? field : undefined;
}

/**
 * react-phone-input-2 passes `CountryData | {}` to `onChange`, but at runtime
 * the second argument can be an empty object or null/undefined before a
 * country is selected. Reads `dialCode`/`countryCode` structurally and falls
 * back to the current values (same tolerance as the pre-TypeScript
 * `countryData?.dialCode || phoneDialCode`).
 */
export function resolveCountryFields(
    countryData: unknown,
    fallbackDialCode: string,
    fallbackCountryIso: string,
): PhoneCountryFields {
    return {
        dialCode: readStringField(countryData, 'dialCode') || fallbackDialCode,
        countryCode: readStringField(countryData, 'countryCode') || fallbackCountryIso,
    };
}
