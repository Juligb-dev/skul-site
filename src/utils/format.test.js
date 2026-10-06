/**
 * PRUEBAS — src/utils/format.js
 * ------------------------------------------------------------
 * `fmt` es la función que decide cómo se ve TODA la plata del sitio. Si
 * rompe, el visitante ve "$NaN" en el carrito o dos pantallas distintas
 * muestran el mismo número de forma diferente (que es exactamente lo que
 * el archivo dice que quiere evitar).
 *
 * Casos borde que se testean:
 *  - Valores que NO son números: undefined, null, "", NaN, objetos.
 *  - Números que vienen como texto (el admin puede guardar "45000").
 *  - Números negativos y decimales (no debería haberlos, pero si un
 *    cálculo del Worker queda con decimales, no debe romperse la pantalla).
 *  - Separador de miles en formato argentino (punto, no coma).
 */
import { describe, it, expect } from "vitest";
import { fmt } from "./format.js";

describe("fmt — formato de precios", () => {
  it("antepone el signo peso", () => {
    expect(fmt(1200)).toBe("$1.200");
  });

  it("usa punto como separador de miles (es-AR)", () => {
    expect(fmt(1000000)).toBe("$1.000.000");
  });

  it("deja los ceros pelados sin decimales inútiles", () => {
    expect(fmt(0)).toBe("$0");
  });

  it.each([
    [undefined, "$0"],
    [null, "$0"],
    ["", "$0"],
    [NaN, "$0"],
    [{}, "$0"],
    [[], "$0"],
  ])("no rompe con un valor basura (%p)", (entrada, esperado) => {
    expect(fmt(entrada)).toBe(esperado);
  });

  it("convierte a número los valores que vienen como texto", () => {
    // Los campos editables del panel llegan a veces como "45000" (string).
    expect(fmt("45000")).toBe("$45.000");
  });

it("redondea visualmente a entero cuando el número ya viene redondeado", () => {
    // La tienda maneja pesos enteros: si el total llega 1234.0 debe verse
    // exactamente igual que si llega 1234 (requisito del archivo).
    expect(fmt(1234)).toBe(fmt(1234.0));
    expect(fmt(1200)).toBe("$1.200");
  });

it("un decimal que se cuela se muestra tal cual (no lo oculta)", () => {
    // fmt NO redondea: muestra lo que le dan. Se documenta acá a propósito,
    // porque si algún día el Worker devuelve centavos hay que verlos, en
    // vez de mostrar un total "redondo" que no coincide con lo cobrado.
    expect(fmt(1234.56)).toBe("$1.234,56");
  });

  it("no rompe con negativos", () => {
    expect(fmt(-500)).toContain("500");
    expect(fmt(-500)).toContain("-");
  });

  it("el mismo número se ve siempre igual (requisito del archivo)", () => {
    expect(fmt(1234)).toBe(fmt("1234"));
    expect(fmt(1234)).toBe(fmt(1234.0));
  });
});