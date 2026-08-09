import { parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * Valida un número de teléfono completo (con código de país).
 * Usa la librería de Google libphonenumber para validar:
 * - Que sea solo números (después del +)
 * - Que tenga la cantidad correcta de dígitos para el país detectado
 * - Que sea un número posible/válido
 *
 * @param {string} phoneValue - Número en formato E.164 (con +), ej: "+5350123456"
 * @returns {{ valid: boolean, error: string|null, formatted: string|null }}
 */
export function validatePhone(phoneValue) {
    if (!phoneValue || phoneValue.trim() === '' || phoneValue.trim() === '+') {
        return { valid: false, error: 'El número de teléfono es requerido', formatted: null };
    }

    const cleaned = phoneValue.trim();

    // Debe empezar con +
    if (!cleaned.startsWith('+')) {
        return { valid: false, error: 'El número debe incluir el código de país', formatted: null };
    }

    // Solo dígitos después del +
    const afterPlus = cleaned.slice(1);
    if (!/^\d+$/.test(afterPlus)) {
        return { valid: false, error: 'El número solo debe contener dígitos', formatted: null };
    }

    // Parsear con libphonenumber-js
    const phoneNumber = parsePhoneNumberFromString(cleaned);

    if (!phoneNumber) {
        return { valid: false, error: 'Número de teléfono no reconocido. Verifica el código de país.', formatted: null };
    }

    // isPossible() verifica longitud de dígitos para el país
    if (!phoneNumber.isPossible()) {
        const country = phoneNumber.country;
        const nationalNumber = phoneNumber.nationalNumber;
        const expectedExample = phoneNumber.countryCallingCode;
        return {
            valid: false,
            error: `El número no tiene la cantidad correcta de dígitos para ${country ? country : 'el país con código +' + expectedExample}. Dígitos ingresados: ${nationalNumber?.length || afterPlus.length}`,
            formatted: null,
        };
    }

    // isValid() es más estricto: tipo de número, patrones del país
    if (!phoneNumber.isValid()) {
        return {
            valid: false,
            error: `El número no es válido para ${phoneNumber.country || 'el país seleccionado'}. Verifica que sea un número real.`,
            formatted: null,
        };
    }

    // Retorna el número en formato E.164 limpio
    return {
        valid: true,
        error: null,
        formatted: phoneNumber.format('E.164'), // ej: "+5350123456"
    };
}
