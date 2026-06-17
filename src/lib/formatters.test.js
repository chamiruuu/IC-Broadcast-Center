import test from "node:test";
import assert from "node:assert/strict";
import {
  insertFormatting,
  insertLinkFormatting,
  stripFormatting,
  toBo82PlainText,
  toSkypebotHtml,
} from "./formatters.js";

test("Skypebot HTML preserves line breaks and auto-links URLs", () => {
  const html = toSkypebotHtml("Hello\nhttps://example.com/path");

  assert.equal(
    html,
    'Hello<br><a href="https://example.com/path">https://example.com/path</a>',
  );
});

test("Skypebot HTML converts formatting marks", () => {
  const html = toSkypebotHtml("**Important**\n*Note*\n- Item");

  assert.equal(html, "<strong>Important</strong><br><em>Note</em><br>&#8226; Item");
});

test("Markdown links become anchors for Skypebot and readable text for BO8.2", () => {
  const message = "Read [policy](https://example.com/policy)";

  assert.equal(toSkypebotHtml(message), 'Read <a href="https://example.com/policy">policy</a>');
  assert.equal(toBo82PlainText(message), "Read policy (https://example.com/policy)");
});

test("BO8.2 strips visual formatting but keeps text", () => {
  assert.equal(toBo82PlainText("**Urgent** and *important*"), "Urgent and important");
});

test("insert formatting wraps selected text", () => {
  const result = insertFormatting("Hello team", 6, 10, "bold");

  assert.equal(result.value, "Hello **team**");
});

test("insert link formatting uses selected text as fallback label", () => {
  const result = insertLinkFormatting("Open portal", 5, 11, "", "https://example.com");

  assert.equal(result.value, "Open [portal](https://example.com)");
});

test("clear formatting removes marks and list prefixes", () => {
  assert.equal(stripFormatting("- **Item**\n1. [Link](https://example.com)"), "Item\nLink");
});
