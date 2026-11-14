// Unit tests for reading and writing numbers in the customer's own format
// (Settings: en-US, en-GB or de-DE). The bug hunt found that with German
// settings the transfer form wrote money as "17.771,30 €" but refused "250,00";
// these pin the readers and the hints that fixed it, and the percentages.

// Vitest's test tools.
import { describe, expect, it } from "vitest";
// The pieces under test.
import {
  amountExample,
  numberExample,
  parseAmount,
  plainNumber,
} from "./bankApi";
import { formatChange } from "./marketApi";
// Adds lines to the [RESULT] block printed after each test.
import { expected, fact } from "../test/resultBlock";

describe("numbers in the customer's own format", () => {
  // de-DE reads money the way the page writes it, and plain "250.00" still
  // works; the cents are exact.
  it("reads a German amount the way the page writes money", () => {
    expected(
      "de-DE: 250,00 -> 25000, 1.250,50 -> 125050, 250.00 -> 25000, 1.250 -> 125000, '250,00 €' -> 25000",
    );
    const read = {
      comma: parseAmount("250,00", false, "de-DE"),
      grouped: parseAmount("1.250,50", false, "de-DE"),
      plainDot: parseAmount("250.00", false, "de-DE"),
      thousands: parseAmount("1.250", false, "de-DE"),
      withSign: parseAmount("250,00 €", false, "de-DE"),
    };
    fact("read", read);
    expect(read).toEqual({
      comma: 25000,
      grouped: 125050,
      plainDot: 25000,
      thousands: 125000,
      withSign: 25000,
    });
  });

  // en-US reads as before, takes a plain "250,00" too, and refuses what is
  // more likely a typo than a thousand ("1.250"), and an ambiguous German
  // "12,500".
  it("keeps en-US as it was, and refuses an ambiguous amount", () => {
    expected(
      "en-US: 250.00, 1,250.50, $25 as before and 250,00 accepted; 1.250 refused; de-DE 12,500 refused; a minus only when allowed",
    );
    const read = {
      plain: parseAmount("250.00"),
      grouped: parseAmount("1,250.50"),
      dollar: parseAmount("$25"),
      comma: parseAmount("250,00"),
      dotThousand: parseAmount("1.250"),
      germanAmbiguous: parseAmount("12,500", false, "de-DE"),
      minusRefused: parseAmount("-25"),
      minusAllowed: parseAmount("-25", true),
    };
    fact("read", read);
    expect(read).toEqual({
      plain: 25000,
      grouped: 125050,
      dollar: 2500,
      comma: 25000,
      dotThousand: null,
      germanAmbiguous: null,
      minusRefused: null,
      minusAllowed: -2500,
    });
  });

  // Hints and placeholders are written the customer's way.
  it("writes hints in the customer's own format", () => {
    expected(
      "250.00 in en-US and en-GB, 250,00 in de-DE; 0,05 for a coin in de-DE",
    );
    const hints = {
      us: amountExample(25000, "en-US"),
      gb: amountExample(25000, "en-GB"),
      de: amountExample(25000, "de-DE"),
      coin: numberExample(0.05, "de-DE"),
    };
    fact("hints", hints);
    expect(hints).toEqual({
      us: "250.00",
      gb: "250.00",
      de: "250,00",
      coin: "0,05",
    });
  });

  // Coin quantities and prices: only a comma-decimal format changes anything.
  it("rewrites a German coin quantity or price the plain way", () => {
    expected(
      "de-DE: 0,05 -> 0.05, 61.234,50 -> 61234.50, 61.234 -> 61234, 61234.50 unchanged; en-US 1,5 unchanged",
    );
    const plain = {
      coin: plainNumber("0,05", "de-DE"),
      price: plainNumber("61.234,50", "de-DE"),
      thousands: plainNumber("61.234", "de-DE"),
      alreadyPlain: plainNumber("61234.50", "de-DE"),
      us: plainNumber("1,5", "en-US"),
    };
    fact("plain", plain);
    expect(plain).toEqual({
      coin: "0.05",
      price: "61234.50",
      thousands: "61234",
      alreadyPlain: "61234.50",
      us: "1,5",
    });
  });

  // Percentages follow the format too; en-US is exactly as before.
  it("writes a percentage in the customer's own format", () => {
    expected("+2.11% in en-US, −2,11 % in de-DE, 0.00% for no change");
    const changes = {
      us: formatChange(211, "en-US"),
      de: formatChange(-211, "de-DE"),
      flat: formatChange(0),
    };
    fact("changes", changes);
    expect(changes.us).toBe("+2.11%");
    expect(changes.de).toMatch(/^−2,11\s%$/);
    expect(changes.flat).toBe("0.00%");
  });
});
