import type { OperationsAttentionItem } from "../../lib/operations-view";

export function AttentionList({ items }: { items: OperationsAttentionItem[] }) {
  return <section className="overview-panel attention-panel"><header><div><span className="eyebrow">Act first</span><h2>Needs attention</h2></div></header><ul>{items.map((item) => <li className={`is-${item.severity}`} key={`${item.href}:${item.label}`}><div><strong>{item.label}</strong><p>{item.detail}</p></div><a href={item.href}>Review →</a></li>)}</ul></section>;
}
