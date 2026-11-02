// Los límites del ruido (S7) que también lee la página (el panel y el certificado). Viven aparte de
// `index.ts` por peso: este archivo no importa nada, así que nombrar el tope no arrastra el motor
// del ruido al bundle de la pantalla.

/** El dominio más grande que la respuesta aleatorizada acepta. */
export const DOMINIO_MAXIMO = 64;
