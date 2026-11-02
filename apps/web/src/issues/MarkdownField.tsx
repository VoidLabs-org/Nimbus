import { Text } from "@mantine/core";
import { useRef, useState } from "react";
import { IssueMarkdown } from "./IssueMarkdown";
import classes from "./MarkdownField.module.css";

/** What each toolbar button puts around the selection (or, for a line start, in front of it). */
const TOOLS: { label: string; title: string; before: string; after?: string; line?: boolean }[] = [
  { label: "B", title: "Bold", before: "**", after: "**" },
  { label: "I", title: "Italic", before: "_", after: "_" },
  { label: "”", title: "Quote", before: "> ", line: true },
  { label: "</>", title: "Code", before: "`", after: "`" },
  { label: "•", title: "List", before: "- ", line: true },
  { label: "☑", title: "Checklist", before: "- [ ] ", line: true },
  { label: "🔗", title: "Link", before: "[", after: "](https://)" },
];

/**
 * A Markdown text box with a small toolbar and a Preview, so the description is written and read the way the Issue
 * page will show it. It is a plain textarea underneath, labelled for screen readers.
 */
export function MarkdownField({
  label,
  value,
  onChange,
  error,
  disabled,
  maxLength,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  disabled?: boolean;
  maxLength?: number;
  autoFocus?: boolean;
}) {
  const [previewing, setPreviewing] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);

  function apply(tool: (typeof TOOLS)[number]) {
    const area = input.current;
    if (!area) return;
    const { selectionStart: from, selectionEnd: to } = area;
    const start = tool.line ? value.lastIndexOf("\n", from - 1) + 1 : from;
    const next = tool.line
      ? value.slice(0, start) + tool.before + value.slice(start)
      : value.slice(0, from) +
        tool.before +
        value.slice(from, to) +
        (tool.after ?? "") +
        value.slice(to);
    onChange(next);
    const caret = tool.line
      ? to + tool.before.length
      : to + tool.before.length + (tool.after?.length ?? 0);
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(caret, caret);
    });
  }

  return (
    <div>
      <div className={classes.box}>
        <div className={classes.bar}>
          {TOOLS.map((tool) => (
            <button
              key={tool.title}
              type="button"
              className={classes.tool}
              title={tool.title}
              aria-label={tool.title}
              disabled={disabled || previewing}
              onClick={() => apply(tool)}
            >
              {tool.label}
            </button>
          ))}
          <span className={classes.spacer} />
          <button
            type="button"
            className={`${classes.tool} ${classes.tab}`}
            aria-pressed={!previewing}
            onClick={() => setPreviewing(false)}
          >
            Write
          </button>
          <button
            type="button"
            className={`${classes.tool} ${classes.tab}`}
            aria-pressed={previewing}
            onClick={() => setPreviewing(true)}
          >
            Preview
          </button>
        </div>
        {previewing ? (
          <div className={classes.preview}>
            {value.trim() ? (
              <IssueMarkdown>{value}</IssueMarkdown>
            ) : (
              <Text c="dimmed">Nothing to preview.</Text>
            )}
          </div>
        ) : (
          <textarea
            ref={input}
            className={classes.text}
            aria-label={label}
            value={value}
            maxLength={maxLength}
            disabled={disabled}
            autoFocus={autoFocus}
            onChange={(event) => onChange(event.currentTarget.value)}
          />
        )}
      </div>
      {error && <div className={classes.error}>{error}</div>}
    </div>
  );
}
