import type { ReactNode } from "react";

/** Tiny markdown renderer (no deps — the plugin bundle can only import
 *  @hermes/plugin-sdk and react). Supports: ``` code blocks ```, # ## ###
 *  headings, - list items, **bold**, *italic*, `inline code`. Streaming
 *  tolerant: an unclosed code fence renders as plain pre. */

function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) {
      nodes.push(<strong key={`${keyBase}-b${i}`}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("`")) {
      nodes.push(<code key={`${keyBase}-c${i}`}>{tok.slice(1, -1)}</code>);
    } else {
      nodes.push(<em key={`${keyBase}-i${i}`}>{tok.slice(1, -1)}</em>);
    }
    last = m.index + tok.length;
    i += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function MarkdownText({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  const codeBuf: string[] = [];
  let inCode = false;
  const listItems: ReactNode[] = [];

  const flushList = (key: string) => {
    if (listItems.length === 0) return;
    out.push(
      <div key={key} className="home-md-list">
        {listItems}
      </div>,
    );
    listItems.length = 0;
  };

  lines.forEach((line, idx) => {
    const key = `l${idx}`;

    if (line.trimStart().startsWith("```")) {
      if (inCode) {
        out.push(
          <pre key={key} className="home-md-pre">
            <code>{codeBuf.join("\n")}</code>
          </pre>,
        );
        codeBuf.length = 0;
        inCode = false;
      } else {
        flushList(key);
        inCode = true;
      }
      return;
    }

    if (inCode) {
      codeBuf.push(line);
      return;
    }

    const t = line.trim();
    if (!t) {
      flushList(key);
      out.push(<div key={key} className="home-md-gap" />);
      return;
    }

    const heading = t.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flushList(key);
      out.push(
        <div key={key} className={`home-md-h h${heading[1].length}`}>
          {renderInline(heading[2], key)}
        </div>,
      );
      return;
    }

    const item = t.match(/^[-*]\s+(.*)$/);
    if (item) {
      listItems.push(<div key={key} className="home-md-li">{renderInline(item[1], key)}</div>);
      return;
    }

    flushList(key);
    out.push(<div key={key} className="home-md-p">{renderInline(t, key)}</div>);
  });

  if (inCode) {
    out.push(
      <pre key="open-fence" className="home-md-pre">
        <code>{codeBuf.join("\n")}</code>
      </pre>,
    );
  }
  flushList("list-end");

  return <>{out}</>;
}
