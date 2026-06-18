function normalizeWhitespace(value) {
  return value.replace(/\r\n?/g, "\n");
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function extractPlainTextFromHtml(htmlMessage) {
  return normalizeWhitespace(htmlMessage)
    .replace(/<li>\s*<p>/g, "<li>")
    .replace(/<\/p>\s*<\/li>/g, "</li>")
    .replace(/<ul>|<ol>|<\/ul>|<\/ol>/g, "")
    .replace(/<\s*hr\s*\/??\s*>/gi, "\n———————————————————————————————\n")
    .replace(/<\s*li\b[^>]*>/gi, "- ")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/p\s*>/gi, "\n")
    .replace(/<\s*\/tr\s*>/gi, "\n")
    .replace(/<\s*\/t[dh]\s*>/gi, "\t")
    .replace(/<\s*\/li\s*>/gi, "\n")
    .replace(/<\s*\/(?:table|thead|tbody|tfoot|div|section|article|blockquote|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

function extractBo82LinkText(htmlMessage) {
  if (typeof document !== "undefined") {
    const temp = document.createElement("div");
    temp.innerHTML = htmlMessage;

    temp.querySelectorAll("a").forEach((link) => {
      const href = link.getAttribute("href");
      if (href) {
        const text = (link.textContent || "").trim();
        const cleanText = text.replace(/^https?:\/\//, "").replace(/\/$/, "");
        const cleanHref = href.replace(/^https?:\/\//, "").replace(/\/$/, "");

        if (cleanText === cleanHref) {
          link.textContent = text;
        } else {
          link.textContent = `${text} - ${href}`;
        }
      }
    });

    return temp.innerHTML;
  }

  return htmlMessage.replace(
    /<a\b[^>]*href=(['"])(.*?)\1[^>]*>(.*?)<\/a>/gi,
    (_, __, href, label) => {
      const text = label.trim();
      const cleanText = text.replace(/^https?:\/\//, "").replace(/\/$/, "");
      const cleanHref = href.replace(/^https?:\/\//, "").replace(/\/$/, "");

      return cleanText === cleanHref ? text : `${text} - ${href}`;
    },
  );
}

export function toSkypebotHtml(htmlMessage) {
  if (!htmlMessage) {
    return "";
  }

  return normalizeWhitespace(htmlMessage)
    .replace(/<li>\s*<p>/g, "<li>")
    .replace(/<\/p>\s*<\/li>/g, "</li>")
    .replace(/<ul>|<ol>|<\/ul>|<\/ol>/g, "")
    .replace(/<\s*hr\s*\/??\s*>/gi, "———————————————————————————————<br>")
    .replace(/<p\b[^>]*>/g, "")
    .replace(/<\/p>/g, "<br>")
    .replace(/<li>/g, "&#8226; ")
    .replace(/<\/li>/g, "<br>")
    .replace(/(<br>)+$/g, "")
    .trimEnd();
}

export function toBo82PlainText(htmlMessage) {
  if (!htmlMessage) {
    return "";
  }

  return extractPlainTextFromHtml(extractBo82LinkText(htmlMessage));
}

export function stripFormatting(message) {
  return message
    .split("\n")
    .map((line) => line.replace(/^\s*-\s+/, "").replace(/^\s*\d+\.\s+/, ""))
    .join("\n")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1")
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

  return { value: message, cursor: selectionEnd };
}

export function insertLinkFormatting(message, selectionStart, selectionEnd, label, url) {
  const before = message.slice(0, selectionStart);
  const selected = message.slice(selectionStart, selectionEnd);
  const linkLabel = label || selected || "link text";
  const next = `[${linkLabel}](${url})`;

  return { value: `${before}${next}${message.slice(selectionEnd)}`, cursor: before.length + next.length };
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
