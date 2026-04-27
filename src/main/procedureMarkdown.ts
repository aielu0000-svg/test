import { createHash } from "node:crypto";
import path from "node:path";

export type ParsedProcedureGroup = {
  level: 1 | 2;
  title: string;
  pathKey: string;
  position: number;
};

export type ParsedProcedureStepBlock = {
  blockType: "paragraph" | "code" | "heading" | "list" | "hr";
  blockOrder: number;
  headingLevel: number | null;
  language: string | null;
  content: string;
  metaJson: string | null;
};

export type ParsedProcedureStep = {
  groupLevel1PathKey: string | null;
  groupLevel2PathKey: string | null;
  pathKey: string;
  heading: string;
  stepNo: number;
  position: number;
  bodyText: string;
  contentHash: string;
  stableKey: string;
  blocks: ParsedProcedureStepBlock[];
};

export type ParsedProcedureDocument = {
  title: string;
  sourceName: string;
  sourceHash: string;
  groups: ParsedProcedureGroup[];
  steps: ParsedProcedureStep[];
};

const hashText = (value: string) => createHash("sha1").update(value).digest("hex");

const normalizeText = (value: string) => value.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();

const toPathKey = (parts: Array<string | null | undefined>) =>
  parts.map((part) => (part ?? "").trim()).filter(Boolean).join(" / ");

const buildStableKey = (pathKey: string, heading: string, bodyText: string) => {
  const seed = `${normalizeText(pathKey)}\n${normalizeText(heading)}\n${normalizeText(bodyText)}`;
  return `${normalizeText(pathKey) || normalizeText(heading) || "step"}:${hashText(seed).slice(0, 16)}`;
};

export const parseProcedureMarkdown = (
  filePath: string,
  content: string
): ParsedProcedureDocument => {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const sourceName = path.basename(filePath);
  const titleFallback = path.basename(filePath, path.extname(filePath));
  const groups: ParsedProcedureGroup[] = [];
  const steps: ParsedProcedureStep[] = [];
  const groupKeys = new Set<string>();
  let level1Title: string | null = null;
  let level2Title: string | null = null;
  let level1PathKey: string | null = null;
  let level2PathKey: string | null = null;
  let groupPosition = 0;
  let stepPosition = 0;
  let title = titleFallback;
  let currentStepHeading = "";
  let currentBlocks: ParsedProcedureStepBlock[] = [];
  let currentStepNo = 0;
  let codeFenceLanguage: string | null = null;
  let codeLines: string[] = [];
  let paragraphLines: string[] = [];
  let listLines: string[] = [];

  const ensureGroup = (level: 1 | 2, heading: string, pathKey: string) => {
    if (!heading || !pathKey || groupKeys.has(`${level}:${pathKey}`)) {
      return;
    }
    groupKeys.add(`${level}:${pathKey}`);
    groupPosition += 1;
    groups.push({
      level,
      title: heading,
      pathKey,
      position: groupPosition
    });
  };

  const pushParagraph = () => {
    const text = paragraphLines.join("\n").trim();
    if (!text) {
      paragraphLines = [];
      return;
    }
    currentBlocks.push({
      blockType: "paragraph",
      blockOrder: currentBlocks.length + 1,
      headingLevel: null,
      language: null,
      content: text,
      metaJson: null
    });
    paragraphLines = [];
  };

  const pushList = () => {
    if (!listLines.length) {
      return;
    }
    currentBlocks.push({
      blockType: "list",
      blockOrder: currentBlocks.length + 1,
      headingLevel: null,
      language: null,
      content: listLines.join("\n"),
      metaJson: null
    });
    listLines = [];
  };

  const pushCode = () => {
    currentBlocks.push({
      blockType: "code",
      blockOrder: currentBlocks.length + 1,
      headingLevel: null,
      language: codeFenceLanguage,
      content: codeLines.join("\n"),
      metaJson: null
    });
    codeLines = [];
    codeFenceLanguage = null;
  };

  const flushTextBlocks = () => {
    pushParagraph();
    pushList();
  };

  const finalizeStep = () => {
    if (!currentStepHeading) {
      currentBlocks = [];
      return;
    }
    flushTextBlocks();
    const bodyText = currentBlocks
      .map((block) => block.content)
      .join("\n\n")
      .trim();
    const pathKey = toPathKey([level1Title, level2Title, currentStepHeading]);
    const contentHash = hashText(`${currentStepHeading}\n${bodyText}`);
    stepPosition += 1;
    steps.push({
      groupLevel1PathKey: level1PathKey,
      groupLevel2PathKey: level2PathKey,
      pathKey,
      heading: currentStepHeading,
      stepNo: currentStepNo,
      position: stepPosition,
      bodyText,
      contentHash,
      stableKey: buildStableKey(pathKey, currentStepHeading, bodyText),
      blocks: currentBlocks.map((block, index) => ({ ...block, blockOrder: index + 1 }))
    });
    currentStepHeading = "";
    currentBlocks = [];
  };

  for (const line of lines) {
    if (codeFenceLanguage !== null) {
      if (/^```/.test(line.trim())) {
        pushCode();
      } else {
        codeLines.push(line);
      }
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const headingLevel = headingMatch[1].length;
      const headingText = headingMatch[2].trim();
      if (headingLevel <= 3) {
        finalizeStep();
      } else {
        flushTextBlocks();
      }

      if (headingLevel === 1) {
        title = headingText || title;
        level1Title = headingText;
        level2Title = null;
        level1PathKey = toPathKey([level1Title]);
        level2PathKey = null;
        currentStepNo = 0;
        ensureGroup(1, headingText, level1PathKey);
        continue;
      }
      if (headingLevel === 2) {
        level2Title = headingText;
        level2PathKey = toPathKey([level1Title, level2Title]);
        currentStepNo = 0;
        ensureGroup(2, headingText, level2PathKey);
        continue;
      }
      if (headingLevel === 3) {
        currentStepNo += 1;
        currentStepHeading = headingText;
        continue;
      }
      if (currentStepHeading) {
        currentBlocks.push({
          blockType: "heading",
          blockOrder: currentBlocks.length + 1,
          headingLevel,
          language: null,
          content: headingText,
          metaJson: null
        });
      }
      continue;
    }

    if (!currentStepHeading) {
      continue;
    }

    const trimmed = line.trim();
    const codeFenceMatch = trimmed.match(/^```([\w-]*)\s*$/);
    if (codeFenceMatch) {
      flushTextBlocks();
      codeFenceLanguage = codeFenceMatch[1] ? codeFenceMatch[1].toLowerCase() : "text";
      codeLines = [];
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      flushTextBlocks();
      currentBlocks.push({
        blockType: "hr",
        blockOrder: currentBlocks.length + 1,
        headingLevel: null,
        language: null,
        content: "---",
        metaJson: null
      });
      continue;
    }

    if (!trimmed) {
      flushTextBlocks();
      continue;
    }

    if (/^([-*]\s+|\d+\.\s+)/.test(trimmed)) {
      pushParagraph();
      listLines.push(trimmed);
      continue;
    }

    pushList();
    paragraphLines.push(line);
  }

  if (codeFenceLanguage !== null) {
    pushCode();
  }
  finalizeStep();

  return {
    title,
    sourceName,
    sourceHash: hashText(normalized),
    groups,
    steps
  };
};
