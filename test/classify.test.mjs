import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { categorize, isRelevant, countryMatchers, detectCountry } from "../scripts/classify.mjs";

const agencies = JSON.parse(readFileSync(new URL("../public/data/agencies.json", import.meta.url)));
const matchers = countryMatchers(agencies);
const country = (t) => detectCountry(t, matchers)?.code ?? null;

test("headline words pick the main topic", () => {
  assert.equal(categorize("FDA adds boxed warning to sleep drug").category, "safety");
  assert.equal(categorize("Company recalls blood pressure tablets over nitrosamine").category, "recall");
  assert.equal(categorize("EMA publishes revised GVP Module XVI guideline").category, "guideline");
  assert.equal(categorize("New medical device regulation comes into force").category, "regulation");
  assert.equal(categorize("Agency opens public consultation on reliance strategy").category, "policy");
  assert.equal(categorize("Firm receives warning letter after inspection").category, "inspection");
  assert.equal(categorize("Quarterly results beat expectations").category, "news");
});

test("feed default topic applies when the headline is silent, and every match is a tag", () => {
  const r = categorize("Examplazole 10 mg tablets", "Lots recalled after adverse reaction reports", "safety");
  assert.equal(r.category, "safety");
  assert.ok(r.tags.includes("recall"));
});

test("word rules don't fire inside other words", () => {
  assert.equal(categorize("Lawsuit over billion-dollar flaw").category, "news");
  assert.equal(categorize("Doctors practice new technique").category, "news");
});

test("relevance keeps medicine news and drops food and unrelated stories", () => {
  assert.ok(isRelevant("CDSCO bans 14 fixed-dose combination drugs"));
  assert.ok(isRelevant("Food and Drug Administration updates vaccine label"));
  assert.ok(!isRelevant("Food recall: undeclared peanut in cookies"));
  assert.ok(!isRelevant("Local bakery wins regional award"));
  assert.ok(!isRelevant("Which team will win?"));
});

test("countries are found from agency names, with the longer name winning", () => {
  assert.equal(country("PMDA revises precautions for anticoagulants"), "JP");
  assert.equal(country("CDSCO and DCGI alert on cough syrups"), "IN");
  assert.equal(country("FDA Philippines advisory on unregistered drugs"), "PH");
  assert.equal(country("FDA approves first gene therapy"), "US");
  assert.equal(country("EMA's PRAC starts review of semaglutide"), "EU");
  assert.equal(country("New ICH E2D(R1) guideline adopted"), "INT");
  assert.equal(country("who knows what us regulators think"), null);
});
