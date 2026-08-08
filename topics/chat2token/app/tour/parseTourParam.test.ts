// topics/chat2token/app/tour/parseTourParam.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isTourId, TOUR_IDS } from "./tourIds.ts";
import { parseTourParam, consumeTourParamFromUrl } from "./parseTourParam.ts";

describe("isTourId", () => {
  it("accepts known ids", () => {
    for (const id of TOUR_IDS) assert.equal(isTourId(id), true);
  });
  it("rejects unknown / empty", () => {
    assert.equal(isTourId("nope"), false);
    assert.equal(isTourId(""), false);
    assert.equal(isTourId(null), false);
  });
});

describe("parseTourParam", () => {
  it("reads ?tour=", () => {
    assert.equal(
      parseTourParam(new URL("https://x.test/chat2token/playground?tour=messages")),
      "messages",
    );
  });
  it("returns null when missing or invalid", () => {
    assert.equal(parseTourParam(new URL("https://x.test/chat2token/playground")), null);
    assert.equal(
      parseTourParam(new URL("https://x.test/chat2token/playground?tour=nope")),
      null,
    );
  });
});

describe("consumeTourParamFromUrl", () => {
  it("returns the id and strips only the tour search param", () => {
    const next = consumeTourParamFromUrl(
      new URL("https://x.test/chat2token/playground/zh?tour=tokens&utm=1#s=abc"),
    );
    assert.equal(next.tourId, "tokens");
    assert.equal(next.url.searchParams.has("tour"), false);
    assert.equal(next.url.searchParams.get("utm"), "1");
    assert.equal(next.url.hash, "#s=abc");
    assert.equal(next.url.pathname, "/chat2token/playground/zh");
  });
});
