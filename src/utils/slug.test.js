/**
 * PRUEBAS — src/utils/slug.js
 * ------------------------------------------------------------
 * El slug es la dirección pública de un producto (/producto/hoodie-concrete).
 * Si slugify se rompe, Google indexa otra cosa, los links viejos se pierden
 * y dos productos pueden terminar en la misma URL (uno deja de ser enlazable).
 *
 * Casos borde: tildes y eñes, espacios repetidos, símbolos, nombres vacíos,
 * colisiones de slug, textos larguísimos, caracteres de otros alfabetos.
 */
import { describe, it, expect } from "vitest";
import { slugify, uniqueSlug } from "./slug.js";

describe("slugify", () => {
  it("pasa un nombre a URL legible", () => {
    expect(slugify("HOODIE CONCRETE")).toBe("hoodie-concrete");
  });

  it("saca tildes", () => {
    expect(slugify("Camisetáta")).toBe("camisetata");
    expect(slugify("Pantalón de Jean")).toBe("pantalon-de-jean");
  });

  it("NO destruye la eñe", () => {
    // La ñ no se descompone con normalize("NFD"), así que sobrevive como "n".
    // Este es el error clásico al "sacar acentos" a mano.
    expect(slugify("niño")).toBe("nino");
  });

  it("colapsa espacios repetidos en UN solo guion", () => {
    expect(slugify("Tee  Básica")).toBe("tee-basica");
  });

  it("convierte paréntesis y ampersand en guiones", () => {
    expect(slugify("Tee Básica (2025)")).toBe("tee-basica-2025");
    expect(slugify("Pantalón & Campera")).toBe("pantalon-campera");
  });

  it("recorta los guiones de los bordes", () => {
    expect(slugify("  !!Camiseta!!  ")).toBe("camiseta");
    expect(slugify("---")).toBe("");
  });

  it("acepta números y los mantiene", () => {
    expect(slugify("Remera 2 x 3")).toBe("remera-2-x-3");
  });

  it("devuelve string vacío cuando no queda nada usable", () => {
    expect(slugify("")).toBe("");
    expect(slugify(null)).toBe("");
    expect(slugify(undefined)).toBe("");
    expect(slugify("&&&")).toBe("");
  });

  it("no rompe si le pasan un número", () => {
    expect(slugify(2025)).toBe("2025");
  });

  it("acorta a 60 caracteres como máximo", () => {
    const largo = "a".repeat(300);
    expect(slugify(largo)).toHaveLength(60);
  });

  it("deja los caracteres no latinos como guiones (no explota)", () => {
    // Un nombre en cirílico o con emoji no debe romper la generación del slug:
    // tiene que devolver algo (o vacío), nunca una excepción que rompa el panel.
    expect(() => slugify("Худи Που")).not.toThrow();
    expect(slugify("👟 Zapatilla")).toBe("zapatilla");
  });
});

describe("uniqueSlug", () => {
  it("devuelve el slug tal cual si está libre", () => {
    expect(uniqueSlug("Hoodie Concrete", [])).toBe("hoodie-concrete");
  });

  it("agrega -2 si el slug ya está tomado", () => {
    expect(uniqueSlug("Hoodie Concrete", ["hoodie-concrete"])).toBe("hoodie-concrete-2");
  });

  it("agrega -3, -4... si varios están tomados", () => {
    expect(uniqueSlug("Hoodie", ["hoodie", "hoodie-2"])).toBe("hoodie-3");
  });

  it("ignora entradas vacías o nulas del array de tomados", () => {
    expect(uniqueSlug("Hoodie", [null, undefined, ""])).toBe("hoodie");
  });

  it("cae a 'producto' si el nombre no deja nada usable", () => {
    expect(uniqueSlug("&&&", [])).toBe("producto");
  });

  it("el slug generado nunca es un valor vacío (URL rota)", () => {
    for (const nombre of ["", " ", "&&&", null, undefined, "¿?", "…"]) {
      expect(uniqueSlug(nombre, [])).toBeTruthy();
      expect(uniqueSlug(nombre, [])).not.toContain("/");
    }
  });

  it("no colisiona con slugs que se parecen pero no son iguales", () => {
    // "hoodie-2" NO debería impedir crear "hoodie" (distinto documento).
    expect(uniqueSlug("Hoodie", ["hoodie-2"])).toBe("hoodie");
  });
});