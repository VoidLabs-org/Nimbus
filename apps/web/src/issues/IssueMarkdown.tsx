import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import classes from "./IssueMarkdown.module.css";

/**
 * An Issue's description, rendered. Safe by construction: react-markdown builds React elements and does not render raw
 * HTML (it is shown as text, so a pasted `<script>` is just text), and it drops unsafe link addresses such as
 * `javascript:`. GitHub-flavoured Markdown adds checklists (acceptance criteria), tables and strikethrough.
 */
export function IssueMarkdown({ children }: { children: string }) {
  return (
    <div className={classes.markdown}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Links open in a new tab without handing the page to the linked site.
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
        }}
      >
        {children}
      </Markdown>
    </div>
  );
}
