"use client";

import { Tabs } from "./Tabs";
import { APPEAL_MEMO_HTML, CASSATION_MEMO_HTML } from "./memoMarkup";
import styles from "./memo.module.css";

/** The two complete, blacked-out memos (owner §12.3). Static markup only. */
function Memo({ html }: { html: string }) {
  return (
    <div data-light-surface className={styles.paper} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

export function SampleMemos() {
  return (
    <Tabs
      label="نماذج المذكرات"
      items={[
        { id: "appeal", label: "صحيفة استئناف", panel: <Memo html={APPEAL_MEMO_HTML} /> },
        { id: "cassation", label: "صحيفة طعن بالنقض", panel: <Memo html={CASSATION_MEMO_HTML} /> },
      ]}
    />
  );
}
