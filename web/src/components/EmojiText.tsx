import { EMOJI_TOKEN_RE, emojiUrl } from "../lib/utils";
import { useT } from "../lib/i18n";

export function EmojiText({ text }: { text: string }) {
  const t = useT();
  const out: React.ReactNode[] = [];
  let last = 0;
  let idx = 0;
  EMOJI_TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EMOJI_TOKEN_RE.exec(text)) !== null) {
    if (m.index > last) out.push(<span key={idx++}>{text.slice(last, m.index)}</span>);
    const name = m[1] ?? m[2];
    out.push(<img key={idx++} src={emojiUrl(name)} alt={t("message.emoji")} loading="lazy" className="mx-0.5 inline-block h-4 w-4 align-[-3px]" />);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(<span key={idx++}>{text.slice(last)}</span>);
  return <>{out}</>;
}
