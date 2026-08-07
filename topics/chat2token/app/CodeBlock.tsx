import { useEffect, useRef, useState } from "react";
import { Copy, Check, WrapText } from "lucide-react";
import { useLang } from "./i18n";

const codeCopy = {
  en: {
    wrap: "Toggle line wrap",
    copy: "Copy code",
  },
  zh: {
    wrap: "切换自动换行",
    copy: "复制代码",
  },
} as const;

/**
 * Runtime twin of `src/components/CodeBlock.astro`, for React islands that need
 * to highlight dynamic strings (the Astro one is build-time only).
 *
 * Fully aligned with the Astro version: identical `.code-block` card markup,
 * the same Shiki `github-light` theme, and the same `stripLineNewlines`
 * transformer. Card chrome + line-number gutter come from the shared
 * `.code-block` CSS in design.css, so both render pixel-identically.
 */

// Shiki emits a literal `\n` text node between each `.line`; with `.line` set
// to display:block those newlines double the spacing. Drop them. (shikijs#552)
const stripLineNewlines = {
  name: "tt:strip-line-newlines",
  code(node: { children: Array<{ type?: string; value?: string }> }) {
    node.children = node.children.filter(
      (c) => !(c.type === "text" && c.value === "\n"),
    );
  },
};

export default function CodeBlock({
  code,
  lang = "ts",
  title,
  className = "",
}: {
  code: string;
  lang?: string;
  title?: string;
  className?: string;
}) {
  const uiLang = useLang();
  const copyText = codeCopy[uiLang];
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [wrapped, setWrapped] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Highlight lazily — `shiki` is code-split into its own chunk and only
  // fetched the first time a CodeBlock actually renders.
  useEffect(() => {
    let cancelled = false;
    import("shiki")
      .then(({ codeToHtml }) =>
        codeToHtml(code, {
          lang,
          theme: "github-light",
          transformers: [stripLineNewlines],
        }),
      )
      .then((out) => {
        if (!cancelled) setHtml(out);
      })
      .catch(() => {
        if (!cancelled) setHtml(null);
      });
    return () => {
      cancelled = true;
    };
  }, [code, lang]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Fallback for insecure contexts where the Clipboard API is gated.
      const ta = document.createElement("textarea");
      ta.value = code;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), 1600);
  };

  return (
    <figure
      className={
        "code-block flex min-h-0 flex-col " + (wrapped ? "is-wrapped " : "") + className
      }
    >
      <figcaption className="code-block__bar">
        <span className="code-block__dots" aria-hidden="true">
          <i></i>
          <i></i>
          <i></i>
        </span>
        <span className="code-block__title">{title ?? lang}</span>
        <span className="code-block__actions">
          <button
            type="button"
            className={"code-block__btn code-block__wrap" + (wrapped ? " is-on" : "")}
            onClick={() => setWrapped((w) => !w)}
            aria-label={copyText.wrap}
            aria-pressed={wrapped}
          >
            <WrapText className="code-block__icon" size={15} strokeWidth={2} />
          </button>
          <button
            type="button"
            className={"code-block__btn code-block__copy" + (copied ? " is-copied" : "")}
            onClick={copy}
            aria-label={copyText.copy}
          >
            <Copy className="code-block__icon code-block__icon--copy" size={15} strokeWidth={2} />
            <Check
              className="code-block__icon code-block__icon--check"
              size={15}
              strokeWidth={2.4}
            />
          </button>
        </span>
      </figcaption>
      {html ? (
        // display:contents so the Shiki <pre> becomes a direct flex child of
        // the figure and acts as the single scroller (matches the Astro card).
        <div style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre>
          <code>{code}</code>
        </pre>
      )}
    </figure>
  );
}
