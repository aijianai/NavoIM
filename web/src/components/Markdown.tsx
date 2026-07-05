import { useMemo, memo } from "react";
import { useChatStore } from "../lib/store";
import { useUI } from "../lib/ui";
import { cn, emojiUrl } from "../lib/utils";
import { openUrl } from "../lib/browser";

interface MarkdownProps {
  text: string;
  className?: string;
  mine?: boolean;
}

const CODE_FENCE_RE = /```(\w*)\n([\s\S]*?)\n```/g;

function parseBlocks(text: string): { type: string; content: string }[] {
  const blocks: { type: string; content: string }[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  CODE_FENCE_RE.lastIndex = 0;
  while ((m = CODE_FENCE_RE.exec(text)) !== null) {
    if (m.index > last) processNonCode(text.slice(last, m.index), blocks);
    blocks.push({ type: "code", content: m[2].replace(/\n$/, "") });
    last = m.index + m[0].length;
  }
  if (last < text.length) processNonCode(text.slice(last), blocks);

  return blocks;
}

function processNonCode(segment: string, blocks: { type: string; content: string }[]) {
  for (const raw of segment.split("\n\n")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    if (/^#{1,6}\s/.test(trimmed)) {
      const level = trimmed.match(/^(#{1,6})/)![1].length;
      blocks.push({ type: `h${level}`, content: trimmed.replace(/^#{1,6}\s+/, "") });
    } else if (/^>\s/.test(trimmed)) {
      blocks.push({ type: "blockquote", content: trimmed.replace(/^>\s?/gm, "") });
    } else if (/^[-*+]\s/.test(trimmed)) {
      const items = trimmed
        .split("\n")
        .filter((l) => /^[-*+]\s/.test(l))
        .map((l) => l.replace(/^[-*+]\s+/, ""));
      blocks.push({ type: "ul", content: JSON.stringify(items) });
    } else {
      blocks.push({ type: "p", content: trimmed });
    }
  }
}

function EmojiImg({ name }: { name: string }) {
  return <img src={emojiUrl(name)} alt={name} loading="lazy" className="mx-0.1 inline-block h-6 w-6 align-middle" />;
}

const INLINE_RE = /\[emoji:([A-Za-z0-9_\-]+\.webp)\]|webp:([A-Za-z0-9_\-]+\.webp)|\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|@(\S+)|https?:\/\/[^\s<>)\]，。！？、；："'）】}]+/g;

function renderInline(text: string, mine?: boolean): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let idx = 0;
  let last = 0;

  INLINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(<span key={idx++}>{text.slice(last, m.index)}</span>);
    }

    if (m[1] || m[2]) {
      parts.push(<EmojiImg key={idx++} name={m[1] ?? m[2]} />);
    } else if (m[3]) {
      parts.push(<strong key={idx++} className="font-semibold text-ink-primary">{m[3]}</strong>);
    } else if (m[4]) {
      parts.push(<em key={idx++} className="italic">{m[4]}</em>);
    } else if (m[5]) {
      parts.push(
        <code key={idx++} className="rounded bg-surface-soft px-1 py-0.5 font-mono text-[13px] text-ocean">
          {m[5]}
        </code>
      );
    } else if (m[6] && m[7]) {
      const href = m[7].trim().toLowerCase().startsWith("javascript:") ? "#" : m[7];
      parts.push(
        <a key={idx++} href={href} rel="noreferrer"
           onClick={(e) => { e.preventDefault(); openUrl(href); }}
           className="text-ocean underline hover:text-aqua">
          {m[6]}
        </a>
      );
    } else if (m[8]) {
      parts.push(<MentionChip key={idx++} raw={m[8]} mine={mine} />);
    } else if (m[0] && m[0].startsWith("http")) {
      const href = m[0].trim().toLowerCase().startsWith("javascript:") ? "#" : m[0];
      parts.push(
        <a key={idx++} href={href} rel="noreferrer"
           onClick={(e) => { e.preventDefault(); openUrl(href); }}
           className={cn("underline hover:text-aqua break-all", mine ? "text-white" : "text-ocean")}>
          {href}
        </a>
      );
    }

    last = INLINE_RE.lastIndex;
  }

  if (last < text.length) {
    parts.push(<span key={idx++}>{text.slice(last)}</span>);
  }

  return parts.length > 0 ? parts : [<span key={0}>{text}</span>];
}

interface BlockContentProps {
  content: string;
  mine?: boolean;
}

const InlineBlock = memo(function InlineBlock({ content, mine }: BlockContentProps) {
  return <>{renderInline(content, mine)}</>;
});

function MentionChip({ raw, mine }: { raw: string; mine?: boolean }) {
  const users = useChatStore((s) => s.users);
  const openUserCard = useUI((s) => s.openUserCard);

  const trimmed = raw.replace(/[，。！？、,.;:!?]+$/, "");

  let target = Object.values(users).find((u) => u.displayName === trimmed);
  if (!target) target = Object.values(users).find((u) => u.username === trimmed);
  if (!target) {
    target = Object.values(users).find(
      (u) => trimmed.startsWith(u.displayName) || trimmed.startsWith(u.username),
    );
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (target) openUserCard(target.id);
  };

  if (!target) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded px-1 font-medium",
          mine ? "bg-white text-ocean" : "bg-ocean/10 text-ocean",
        )}
      >
        @{raw}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={`@${target.username}`}
      className={cn(
        "mx-0.5 inline-flex max-w-full items-center rounded-md px-1.5 py-0.5 align-baseline font-medium transition-colors",
        mine
          ? "bg-white text-ocean hover:bg-white/90 hover:underline"
          : "bg-ocean/15 text-ocean hover:bg-ocean/25 hover:underline",
      )}
    >
      @{target.displayName}
    </button>
  );
}

export function Markdown({ text, className, mine }: MarkdownProps) {
  const blocks = useMemo(() => parseBlocks(text), [text]);

  return (
    <div className={cn("space-y-2", className)}>
      {blocks.map((block, i) => {
        switch (block.type) {
          case "code":
            return (
              <pre key={i} className="overflow-x-auto rounded-xl bg-surface-soft p-3 font-mono text-[13px] leading-relaxed text-ink-secondary">
                <code>{block.content}</code>
              </pre>
            );
          case "h1":
            return <div key={i} className="text-lg font-semibold"><InlineBlock content={block.content} mine={mine} /></div>;
          case "h2":
            return <div key={i} className="text-base font-semibold"><InlineBlock content={block.content} mine={mine} /></div>;
          case "h3":
            return <div key={i} className="text-sm font-semibold"><InlineBlock content={block.content} mine={mine} /></div>;
          case "blockquote":
            return (
              <div key={i} className="border-l-2 border-aqua/40 pl-3 text-sm italic text-ink-secondary">
                <InlineBlock content={block.content} mine={mine} />
              </div>
            );
          case "ul": {
            const items: string[] = JSON.parse(block.content);
            return (
              <ul key={i} className="ml-4 list-disc space-y-1 text-sm">
                {items.map((item, j) => (
                  <li key={j}><InlineBlock content={item} mine={mine} /></li>
                ))}
              </ul>
            );
          }
          default:
            return <div key={i} className="whitespace-pre-wrap text-[15px] leading-relaxed"><InlineBlock content={block.content} mine={mine} /></div>;
        }
      })}
    </div>
  );
}

const MENTION_URL_RE = /\[emoji:([A-Za-z0-9_\-]+\.webp)\]|webp:([A-Za-z0-9_\-]+\.webp)|@(\S+)|https?:\/\/[^\s<>)\]，。！？、；："'）】}]+/g;

function renderMentionsAndUrls(text: string, mine?: boolean): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let idx = 0;
  let last = 0;

  MENTION_URL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MENTION_URL_RE.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(<span key={idx++}>{text.slice(last, m.index)}</span>);
    }

    if (m[1] || m[2]) {
      parts.push(<EmojiImg key={idx++} name={m[1] ?? m[2]} />);
    } else if (m[3]) {
      parts.push(<MentionChip key={idx++} raw={m[3]} mine={mine} />);
    } else if (m[0] && m[0].startsWith("http")) {
      const href = m[0].trim().toLowerCase().startsWith("javascript:") ? "#" : m[0];
      parts.push(
        <a key={idx++} href={href} rel="noreferrer"
           onClick={(e) => { e.preventDefault(); openUrl(href); }}
           className={cn("underline hover:text-aqua break-all", mine ? "text-white" : "text-ocean")}>
          {href}
        </a>
      );
    }

    last = MENTION_URL_RE.lastIndex;
  }

  if (last < text.length) {
    parts.push(<span key={idx++}>{text.slice(last)}</span>);
  }

  return parts;
}

export function RichInline({ text, className, mine }: { text: string; className?: string; mine?: boolean }) {
  const lines = text.split("\n");
  return (
    <span className={cn("whitespace-pre-wrap", className)}>
      {lines.map((line, idx) => (
        <span key={idx}>
          {renderMentionsAndUrls(line, mine)}
          {idx < lines.length - 1 && "\n"}
        </span>
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Plain-text renderer — escapes Markdown special characters so that text is
// displayed verbatim. Still processes emoji tokens and @mentions since those
// are content features, not Markdown formatting.
// ---------------------------------------------------------------------------

const MD_SPECIAL_RE = /([\\*_`#\[\]><~|])/g;

function escapeMarkdownChars(text: string): string {
  return text.replace(MD_SPECIAL_RE, "\\$1");
}

const PLAIN_INLINE_RE = /\[emoji:([A-Za-z0-9_\-]+\.webp)\]|webp:([A-Za-z0-9_\-]+\.webp)|@(\S+)|https?:\/\/[^\s<>)\]，。！？、；："'）】}]+/g;

function renderPlainInline(text: string, mine?: boolean): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let idx = 0;
  let last = 0;

  PLAIN_INLINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PLAIN_INLINE_RE.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(<span key={idx++}>{escapeMarkdownChars(text.slice(last, m.index))}</span>);
    }

    if (m[1] || m[2]) {
      parts.push(<EmojiImg key={idx++} name={m[1] ?? m[2]} />);
    } else if (m[3]) {
      parts.push(<MentionChip key={idx++} raw={m[3]} mine={mine} />);
    } else if (m[0] && m[0].startsWith("http")) {
      const href = m[0].trim().toLowerCase().startsWith("javascript:") ? "#" : m[0];
      parts.push(
        <a key={idx++} href={href} rel="noreferrer"
           onClick={(e) => { e.preventDefault(); openUrl(href); }}
           className={cn("underline hover:text-aqua break-all", mine ? "text-white" : "text-ocean")}>
          {href}
        </a>
      );
    }

    last = PLAIN_INLINE_RE.lastIndex;
  }

  if (last < text.length) {
    parts.push(<span key={idx++}>{escapeMarkdownChars(text.slice(last))}</span>);
  }

  return parts.length > 0 ? parts : [<span key={0}>{escapeMarkdownChars(text)}</span>];
}

export function PlainText({ text, className, mine }: { text: string; className?: string; mine?: boolean }) {
  const lines = text.split("\n");
  return (
    <div className={cn("whitespace-pre-wrap", className)}>
      {lines.map((line, idx) => (
        <span key={idx}>
          {renderPlainInline(line, mine)}
          {idx < lines.length - 1 && "\n"}
        </span>
      ))}
    </div>
  );
}
