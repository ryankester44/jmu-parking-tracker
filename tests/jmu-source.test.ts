import { describe, expect, it } from "vitest";
import { parseFeedXml, interpretZoneReading } from "../lib/jmu-source";

// A trimmed but structurally faithful sample of the real feed response
// (captured live from https://www.jmu.edu/cgi-bin/parking_sign_data.cgi
// while building this app) — each zone repeats as the feed accumulates,
// and the parser must take only the FIRST occurrence per zone, matching
// JMU's own client-side parser.
const SAMPLE_XML = `<decks>` +
  `<ZoneVacanSpaces><AsOf>2026-08-31T18:33:22</AsOf><ZoneId>22</ZoneId><Result>1298</Result></ZoneVacanSpaces>` +
  `<ZoneVacanSpaces><AsOf>2026-08-31T18:33:22</AsOf><ZoneId>22</ZoneId><Result>1298</Result></ZoneVacanSpaces>` +
  `<ZoneVacanSpaces><AsOf>2026-08-31T18:33:22</AsOf><ZoneId>13</ZoneId><Result>134</Result></ZoneVacanSpaces>` +
  `<ZoneVacanSpaces><AsOf>2026-08-31T18:33:22</AsOf><ZoneId>19</ZoneId><Result>578</Result></ZoneVacanSpaces>` +
  `<ZoneVacanSpaces><AsOf>2026-08-31T18:33:22</AsOf><ZoneId>54</ZoneId><Result>132</Result></ZoneVacanSpaces>` +
  `<ZoneVacanSpaces><AsOf>2026-08-31T18:33:22</AsOf><ZoneId>42</ZoneId><Result>426</Result></ZoneVacanSpaces>` +
  // A later, DIFFERENT value for zone 22 must be ignored — first occurrence wins.
  `<ZoneVacanSpaces><AsOf>2026-08-31T18:34:22</AsOf><ZoneId>22</ZoneId><Result>1301</Result></ZoneVacanSpaces>` +
  `</decks>`;

const ZONE_IDS = {
  ballard: "22",
  charlieObaugh: "13",
  chesapeake: "19",
  mason: "54",
  warsaw: "42",
};

describe("parseFeedXml", () => {
  it("extracts all five tracked zones from a single response", () => {
    const { counts } = parseFeedXml(SAMPLE_XML);
    expect(counts.get(ZONE_IDS.ballard)).toBe("1298");
    expect(counts.get(ZONE_IDS.charlieObaugh)).toBe("134");
    expect(counts.get(ZONE_IDS.chesapeake)).toBe("578");
    expect(counts.get(ZONE_IDS.mason)).toBe("132");
    expect(counts.get(ZONE_IDS.warsaw)).toBe("426");
  });

  it("keeps only the first occurrence of a repeated zone", () => {
    const { counts } = parseFeedXml(SAMPLE_XML);
    expect(counts.get(ZONE_IDS.ballard)).toBe("1298"); // not the later "1301"
  });

  it("extracts the feed's AsOf timestamp", () => {
    const { asOf } = parseFeedXml(SAMPLE_XML);
    expect(asOf).toBe("2026-08-31T18:33:22");
  });

  it("returns an empty map for a response with no zones", () => {
    const { counts, asOf } = parseFeedXml("<decks></decks>");
    expect(counts.size).toBe(0);
    expect(asOf).toBeNull();
  });
});

describe("interpretZoneReading", () => {
  it("parses a clean positive integer as ok", () => {
    expect(interpretZoneReading("134")).toEqual({ value: 134, status: "ok", raw: "134" });
  });

  it("treats a zero reading as ok (a legitimate FULL signal), not missing", () => {
    expect(interpretZoneReading("0")).toEqual({ value: 0, status: "ok", raw: "0" });
  });

  it("clamps a negative reading to 0 rather than discarding it", () => {
    const result = interpretZoneReading("-3");
    expect(result.status).toBe("ok");
    expect(result.value).toBe(0);
  });

  it("never coerces a missing zone to zero", () => {
    const result = interpretZoneReading(undefined);
    expect(result.value).toBeNull();
    expect(result.status).toBe("missing");
  });

  it("never coerces an empty/Errors reading to zero", () => {
    expect(interpretZoneReading("").value).toBeNull();
    expect(interpretZoneReading("Errors").status).toBe("missing");
  });

  it("flags non-numeric text as invalid, not silently accepted", () => {
    const result = interpretZoneReading("FULL");
    expect(result.value).toBeNull();
    expect(result.status).toBe("invalid");
    expect(result.raw).toBe("FULL");
  });

  it("flags implausibly large values as invalid rather than trusting them", () => {
    const result = interpretZoneReading("999999");
    expect(result.value).toBeNull();
    expect(result.status).toBe("invalid");
  });
});
