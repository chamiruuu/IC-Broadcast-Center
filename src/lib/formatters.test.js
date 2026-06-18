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
  const html = toSkypebotHtml('<p>Hello</p><p><span style="font-family: Georgia; color: #b42318">Update</span></p>');

  assert.equal(
    html,
    'Hello<br><span style="font-family: Georgia; color: #b42318">Update</span>',
  );
});

test("Skypebot HTML keeps tables intact", () => {
  const html = toSkypebotHtml(
    '<p>Team update</p><table><tr><th>Group</th><th>Status</th></tr><tr><td>A</td><td>Ready</td></tr></table>',
  );

  assert.equal(
    html,
    'Team update<br><table><tr><th>Group</th><th>Status</th></tr><tr><td>A</td><td>Ready</td></tr></table>',
  );
});

test("BO8.2 extracts readable text from tables and formatting", () => {
  const message =
    '<p>Team <strong>update</strong></p><table><tr><th>Group</th><th>Status</th></tr><tr><td>A</td><td>Ready</td></tr></table>';

  assert.equal(toBo82PlainText(message), "Team update\nGroup\tStatus\nA\tReady");
});

test("BO8.2 keeps paragraphs spaced and list items hyphenated", () => {
  const message = '<p>First paragraph</p><p>Second paragraph</p><ul><li>One</li><li>Two</li></ul>';

  assert.equal(toBo82PlainText(message), "First paragraph\nSecond paragraph\n- One\n- Two");
});

test("formatters ignore nested paragraphs inside lists", () => {
  const message = '<p>Intro</p><ul><li><p>One</p></li><li><p>Two</p></li></ul><p>Outro</p>';

  assert.equal(toSkypebotHtml(message), 'Intro<br>&#8226; One<br>&#8226; Two<br>Outro');
  assert.equal(toBo82PlainText(message), 'Intro\n- One\n- Two\nOutro');
});

test("formatters keep divider lines intact", () => {
  const message = '<p>Intro</p><hr><p>Outro</p>';

  assert.equal(toSkypebotHtml(message), 'Intro<br>———————————————————————————————<br>Outro');
  assert.equal(toBo82PlainText(message), 'Intro\n\n———————————————————————————————\nOutro');
});

test("BO8.2 expands links into label and URL", () => {
  const message = '<p>Visit <a href="https://example.com">Example</a></p>';

  assert.equal(toBo82PlainText(message), 'Visit Example - https://example.com');
});

test("BO8.2 does not duplicate identical URLs", () => {
  const message = '<p>Visit <a href="https://example.com/">https://example.com</a></p>';

  assert.equal(toBo82PlainText(message), 'Visit https://example.com');
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
