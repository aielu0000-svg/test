import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

marked.setOptions({ gfm: true, breaks: true });

const allowedTags = [
  "h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "ul", "ol", "li",
  "blockquote", "hr", "pre", "code", "table", "thead", "tbody", "tr", "th", "td",
  "strong", "em", "del", "a", "input",
];

export function renderSafeMarkdown(source: string): string {
const safeSource = (source ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "")
    .replace(/(?:javascript|vbscript|data)\s*:/gi, "");
  const rendered = marked.parse(safeSource) as string;
  return sanitizeHtml(rendered, {
    allowedTags,
    allowedAttributes: {
      a: ["href", "title"],
      input: ["type", "checked", "disabled"],
      code: ["class"],
    },
    allowedSchemes: ["http", "https"],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: "a",
        attribs: { href: attribs.href ?? "", title: attribs.title ?? "", rel: "noopener noreferrer", target: "_blank" },
      }),
      input: (_tagName, attribs) => ({
        tagName: "input",
        attribs: { type: "checkbox", disabled: "", ...(attribs.checked !== undefined ? { checked: "" } : {}) },
      }),
    },
    disallowedTagsMode: "discard",
  });
}
