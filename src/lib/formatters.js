const urlPattern = /(https?:\/\/[^\s<>"')]+)/g;
const markdownLinkPattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function autoLink(value) {
  return value.replace(urlPattern, (url) => {
    const safeUrl = escapeHtml(url);
    return `<a href="${safeUrl}">${safeUrl}</a>`;
  });
}

function formatInline(value) {
  const links = [];
  const protectedLinks = value.replace(markdownLinkPattern, (_match, label, url) => {
    const token = `%%LINK_${links.length}%%`;
    links.push(`<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`);
    return token;
  });

  let formatted = autoLink(escapeHtml(protectedLinks))
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");

  links.forEach((link, index) => {
    formatted = formatted.replace(`%%LINK_${index}%%`, link);
  });

  return formatted;
}

function formatLine(line) {
  const trimmed = line.trimStart();

  if (trimmed.startsWith("- ")) {
    return `&#8226; ${formatInline(trimmed.slice(2))}`;
  }

  return formatInline(line);
}

function stripPlainFormatting(value) {
  return value
    .replace(markdownLinkPattern, "$1 ($2)")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2");
}

export function stripFormatting(message) {
  return message
    .split("\n")
    .map((line) => line.replace(/^\s*-\s+/, "").replace(/^\s*\d+\.\s+/, ""))
    .join("\n")
    .replace(markdownLinkPattern, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2");
}

export function insertFormatting(message, selectionStart, selectionEnd, type) {
  const before = message.slice(0, selectionStart);
  const selected = message.slice(selectionStart, selectionEnd);
  const after = message.slice(selectionEnd);
  const fallback = {
    bold: "bold text",
    italic: "italic text",
  };

  if (type === "bold") {
    const next = `**${selected || fallback.bold}**`;
    return { value: `${before}${next}${after}`, cursor: before.length + next.length };
  }

  if (type === "italic") {
    const next = `*${selected || fallback.italic}*`;
    return { value: `${before}${next}${after}`, cursor: before.length + next.length };
  }

  const lineStart = message.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
  const lineEndIndex = message.indexOf("\n", selectionEnd);
  const lineEnd = lineEndIndex === -1 ? message.length : lineEndIndex;
  const target = message.slice(lineStart, lineEnd);
  const lines = target.split("\n");

  if (type === "bullet") {
    const next = lines
      .map((line) => (line.trim() && !line.trimStart().startsWith("- ") ? `- ${line}` : line))
      .join("\n");
    return { value: `${message.slice(0, lineStart)}${next}${message.slice(lineEnd)}`, cursor: lineStart + next.length };
  }

  if (type === "numbered") {
    const next = lines
      .map((line, index) => {
        if (!line.trim()) {
          return line;
        }

        return line.replace(/^\s*\d+\.\s+/, "").replace(/^/, `${index + 1}. `);
      })
      .join("\n");
    return { value: `${message.slice(0, lineStart)}${next}${message.slice(lineEnd)}`, cursor: lineStart + next.length };
  }

  return { value: message, cursor: selectionEnd };
}

export function insertLinkFormatting(message, selectionStart, selectionEnd, label, url) {
  const before = message.slice(0, selectionStart);
  const selected = message.slice(selectionStart, selectionEnd);
  const linkLabel = label || selected || "link text";
  const next = `[${linkLabel}](${url})`;

  return { value: `${before}${next}${message.slice(selectionEnd)}`, cursor: before.length + next.length };
}

export function toSkypebotHtml(message) {
  return message
    .split("\n")
    .map((line) => formatLine(line))
    .join("<br>");
}

export function toBo82PlainText(message) {
  return message
    .split("\n")
    .map((line) => stripPlainFormatting(line))
    .join("\n")
    .trimEnd();
}

export function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function statusLabel(status) {
  const labels = {
    draft: "Draft",
    published: "Published",
    completed: "Completed",
  };

  return labels[status] ?? status;
}
