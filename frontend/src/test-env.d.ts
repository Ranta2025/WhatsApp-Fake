// Declaración ambiental para el flag que React exige para reconocer el
// entorno de test como compatible con act(...) (createRoot no lo detecta
// solo bajo Vitest+jsdom, ver los tests que usan createRoot directamente).
//
// Sin esta declaración, cada test file que hace
// `globalThis.IS_REACT_ACT_ENVIRONMENT = true` obliga a TypeScript a
// sintetizar una declaración global implícita a partir de la propia
// asignación; ese mecanismo es frágil en cuanto hay más de un par de sitios
// haciéndolo (ver M3), así que se declara una única vez aquí.
// Necesita `var` (no let/const): así es como una declaración ambiental
// registra la propiedad en `globalThis`.
// eslint-disable-next-line no-var
declare var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
