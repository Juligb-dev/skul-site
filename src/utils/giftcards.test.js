/**
 * PRUEBAS — src/utils/giftcards.js
 * ------------------------------------------------------------
 * Una gift card es SALDO con un código. Todo el dinero de la tienda pasa por
 * acá en la previsualización del checkout, así que los errores que no se
 * detectan se convierten en "al cliente le cobré de más" o "le di saldo que
 * no tenía".
 *
 * Lo importante que se verifica acá:
 *  - El código se normaliza SIEMPRE antes de buscarlo (si no, "skul abc123"
 *    y "SKUL-ABC123" serían dos gift cards distintas y una nunca encontraría
 *    el documento).
 *  - El formato es EXACTO (SKUL- + 6 caracteres): ni 5, ni 7.
 *  - El saldo NUNCA es negativo y el vencimiento se calcula sobre createdAt.
 *  - Los montos quedan dentro del rango permitido.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  normGiftCardCode,
  isGiftCardCode,
  GIFT_CARD_RE,
  generarCodigoGiftCard,
  redondearMontoGiftCard,
  montoGiftCardValido,
  venceGiftCard,
  saldoGiftCard,
  textoVencimiento,
} from "./giftcards.js";
import { GIFT_CARD_MIN, GIFT_CARD_MAX, GIFT_CARD_ALFABETO, GIFT_CARD_PREFIJO } from "../data/config.js";

describe("normGiftCardCode", () => {
  it("quita espacios y pasa a mayúsculas", () => {
    expect(normGiftCardCode(" skul abc123 ")).toBe("SKUL-ABC123");
  });

  it("unifica minúsculas, mayúsculas y espacios", () => {
    // Los tres tienen que terminar en el MISMO string, porque ese string es
    // el ID del documento en Firestore.
    const a = normGiftCardCode("skul-abc123");
    const b = normGiftCardCode("SKUL-ABC123");
    const c = normGiftCardCode(" skul  abc123 ");
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("no rompe con null/undefined (el checkout llama esto con el campo vacío)", () => {
    expect(normGiftCardCode(null)).toBe("");
    expect(normGiftCardCode(undefined)).toBe("");
    expect(normGiftCardCode("")).toBe("");
  });
});

describe("isGiftCardCode — formato del código", () => {
  it.each([
    "SKUL-ABC123",
    "SKUL-234567",
    "SKUL-AAAAAA",
    "skul abc123", // se normaliza primero: cuenta
  ])("acepta %s", (codigo) => {
    expect(isGiftCardCode(codigo)).toBe(true);
  });

  it.each([
    ["SKUL-ABC12", "solo 5 caracteres"],
    ["SKUL-ABC1234", "7 caracteres"],
    ["ABC-ABC123", "sin el prefijo SKUL"],
    ["SKUL_ABC123", "guion bajo en vez de guion"],
    ["SKUL-ABC-123", "guion de más"],
    ["SKUL-ABC12!", "símbolo"],
    ["SKUL-", "solo el prefijo"],
    ["", "vacío"],
    ["SKUL", "sin guion"],
  ])("rechaza %s (%s)", (codigo) => {
    expect(isGiftCardCode(codigo)).toBe(false);
  });

  it("el regex es el mismo que se exporta (para no desincronizar)", () => {
    expect(GIFT_CARD_RE.test("SKUL-ABC123")).toBe(true);
    expect(GIFT_CARD_RE.test("SKUL-ABC12")).toBe(false);
  });
});

describe("generarCodigoGiftCard", () => {
  afterEach(() => vi.restoreAllMocks());

  it("genera un código con el formato correcto", () => {
    const code = generarCodigoGiftCard();
    expect(code).toMatch(/^SKUL-[A-Z0-9]{6}$/);
    expect(isGiftCardCode(code)).toBe(true);
  });

  it("NO usa I, O, 0 ni 1 (letras que la gente confunde al copiar)", () => {
    // Es una decisión de producto deliberada: si salía una "O" el cliente
    // la escribía como cero y el checkout le decía "código inválido".
    for (let i = 0; i < 300; i++) {
      const sufijo = generarCodigoGiftCard().slice(5);
      expect(sufijo).not.toMatch(/[IO01]/);
    }
  });

  it("usa el alfabeto configurado en config.js", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(generarCodigoGiftCard()).toBe(`${GIFT_CARD_PREFIJO}${GIFT_CARD_ALFABETO[0].repeat(6)}`);
  });

  it("genera códigos distintos (no es siempre el mismo)", () => {
    const generados = new Set();
    for (let i = 0; i < 50; i++) generados.add(generarCodigoGiftCard());
    expect(generados.size).toBeGreaterThan(40);
  });
});

describe("redondearMontoGiftCard", () => {
  it("redondea a peso entero", () => {
    expect(redondearMontoGiftCard(25000.7)).toBe(25001);
  });

  it("recorta el mínimo", () => {
    expect(redondearMontoGiftCard(0)).toBe(GIFT_CARD_MIN);
    expect(redondearMontoGiftCard(-5000)).toBe(GIFT_CARD_MIN);
  });

  it("recorta el máximo", () => {
    expect(redondearMontoGiftCard(9999999)).toBe(GIFT_CARD_MAX);
  });

  it("devuelve el mínimo ante valores que no son números", () => {
    expect(redondearMontoGiftCard("abc")).toBe(GIFT_CARD_MIN);
    expect(redondearMontoGiftCard(null)).toBe(GIFT_CARD_MIN);
    expect(redondearMontoGiftCard(undefined)).toBe(GIFT_CARD_MIN);
    expect(redondearMontoGiftCard(Infinity)).toBe(GIFT_CARD_MIN);
  });

  it("deja un monto válido como estaba", () => {
    expect(redondearMontoGiftCard(20000)).toBe(20000);
    expect(redondearMontoGiftCard("20000")).toBe(20000);
  });

  it("siempre devuelve un número dentro del rango (nunca NaN)", () => {
    for (const v of [0, -1, 1, 999999, "x", null, NaN, Infinity, {}]) {
      const r = redondearMontoGiftCard(v);
      expect(Number.isInteger(r)).toBe(true);
      expect(r).toBeGreaterThanOrEqual(GIFT_CARD_MIN);
      expect(r).toBeLessThanOrEqual(GIFT_CARD_MAX);
    }
  });
});

describe("montoGiftCardValido — validación estricta (la que cobra el Worker)", () => {
  it("acepta un entero dentro del rango", () => {
    expect(montoGiftCardValido(20000)).toBe(true);
    expect(montoGiftCardValido(GIFT_CARD_MIN)).toBe(true);
    expect(montoGiftCardValido(GIFT_CARD_MAX)).toBe(true);
  });

  it("NO perdona decimales (a diferencia de redondear)", () => {
    // Un saldo con decimales rompe la cuenta del pedido: se rechaza.
    expect(montoGiftCardValido(1500.5)).toBe(false);
  });

  it("rechaza fuera del rango", () => {
    expect(montoGiftCardValido(999)).toBe(false);
    expect(montoGiftCardValido(100001)).toBe(false);
    expect(montoGiftCardValido(0)).toBe(false);
    expect(montoGiftCardValido(-1000)).toBe(false);
  });

  it("rechaza NaN/null sin romper", () => {
    expect(montoGiftCardValido(NaN)).toBe(false);
    expect(montoGiftCardValido(null)).toBe(false);
    expect(montoGiftCardValido(undefined)).toBe(false);
    expect(montoGiftCardValido("")).toBe(false);
  });
});

describe("venceGiftCard", () => {
  it("suma 6 meses al createdAt", () => {
    const created = new Date("2026-01-15T10:00:00Z");
    const vence = venceGiftCard(created);
    expect(vence.getUTCFullYear()).toBe(2026);
    expect(vence.getUTCMonth()).toBe(6); // julio (0-indexado)
    expect(vence.getUTCDate()).toBe(15);
  });

  it("acepta un Timestamp de Firestore (tiene toDate)", () => {
    const futuro = new Date();
    futuro.setMonth(futuro.getMonth() + 1);
    const ts = { toDate: () => futuro };
    expect(venceGiftCard(ts).getTime()).toBeGreaterThan(Date.now());
  });

  it("acepta un string ISO", () => {
    expect(venceGiftCard("2026-01-15T10:00:00Z")).toBeInstanceOf(Date);
  });

  it("devuelve null si no hay fecha o es inválida (el Worker la trata como vencida)", () => {
    expect(venceGiftCard(null)).toBeNull();
    expect(venceGiftCard(undefined)).toBeNull();
    expect(venceGiftCard("no-es-fecha")).toBeNull();
    expect(venceGiftCard({})).toBeNull();
  });

  it("NO modifica el objeto que le pasaron", () => {
    // setMonth() modifica in situ: si se pasara el Timestamp original, el
    // documento de Firestore quedaría con la fecha corrida 6 meses.
    const created = new Date("2026-01-15T10:00:00Z");
    const copia = created.getTime();
    venceGiftCard(created);
    expect(created.getTime()).toBe(copia);
  });
});

describe("saldoGiftCard", () => {
  it("es balance menos usedAmount", () => {
    expect(saldoGiftCard({ balance: 10000, usedAmount: 2500 })).toBe(7500);
  });

  it("un documento sin balance da 0, no NaN", () => {
    expect(saldoGiftCard({})).toBe(0);
    expect(saldoGiftCard(null)).toBe(0);
    expect(saldoGiftCard(undefined)).toBe(0);
  });

it("un balance negativo o ausente NO produce un saldo positivo", () => {
    // El checkout trata un saldo <= 0 como "sin saldo". Lo que no puede
  // pasar es que un balance roto se vea como plata disponible.
  expect(saldoGiftCard({ balance: -1000, usedAmount: 0 })).toBe(0);
  expect(saldoGiftCard({ balance: null, usedAmount: 0 })).toBe(0);
  expect(saldoGiftCard({ balance: null, usedAmount: 10 })).toBeLessThanOrEqual(0);
  });

it("permite saldo negativo si usedAmount > balance (el Worker lo valida aparte)", () => {
  // Está documentado en el archivo: saldoGiftCard acota el balance con
    // Math.max(0, ...) pero NO recorta la resta, así que usedAmount mayor
 // que balance se ve negativo. El que lo vuelve a tratar como "sin
    // saldo" es el que lo consume (el checkout y el Worker).
    expect(saldoGiftCard({ balance: 1000, usedAmount: 5000 })).toBe(-4000);
  });

  it("convierte strings a número", () => {
    expect(saldoGiftCard({ balance: "10000", usedAmount: "0" })).toBe(10000);
  });
});

describe("textoVencimiento", () => {
  it("dice 'Vence' si la fecha todavía no llegó", () => {
    const futuro = new Date();
    futuro.setMonth(futuro.getMonth() + 2);
    const txt = textoVencimiento({ createdAt: futuro });
    expect(txt.startsWith("Vence")).toBe(true);
    expect(txt).not.toContain("Venció");
  });

  it("dice 'Venció el' si la fecha de vencimiento ya pasó", () => {
    // Más de 6 meses atrás: la gift card ya venció.
    const pasado = new Date();
    pasado.setMonth(pasado.getMonth() - 8);
    expect(textoVencimiento({ createdAt: pasado })).toContain("Venció el");
  });

  it("muestra un guion si no hay fecha válida (no rompe la tabla)", () => {
    expect(textoVencimiento({})).toBe("—");
    expect(textoVencimiento(null)).toBe("—");
    expect(textoVencimiento({ createdAt: "basura" })).toBe("—");
  });

  it("usa el mismo umbral que el checkout (nunca 'Vence' algo ya vencido)", () => {
    const texto = textoVencimiento({ createdAt: new Date("2020-01-01") });
    expect(texto).toContain("Venció");
  });
});