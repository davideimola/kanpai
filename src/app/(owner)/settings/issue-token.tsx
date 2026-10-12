"use client";

import { useActionState, useState } from "react";
import { FIELD, HINT, LOUD, NAMED, QUIET } from "@/components/controls";
import { Refused } from "@/components/drawer";
import { cn } from "@/lib/utils";
import { type Issued, issue } from "./actions";

// ISSUING A TOKEN, and the one place on these screens that holds state in the browser.
//
// Everything else answers through the address. A secret cannot: an address is kept by the
// history, the server's log and every referrer, and a token's secret is shown **once** and
// kept nowhere (ADR-0009). So the form posts to its Server Function through `useActionState`,
// the secret comes back to this component alone, and it is gone when the page is left. With
// no script running the form still posts and the token is still issued; the secret is then
// shown by the server-rendered state the action returns.

export function IssueToken() {
  const [issued, action, pending] = useActionState<Issued, FormData>(issue, null);
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      {issued && "secret" in issued ? (
        <div className="flex flex-col gap-3 rounded-2xl bg-paper-raised p-4">
          <p className="text-[15px] font-medium">
            The token for {issued.name}. Copy it now: it is shown only this once.
          </p>
          <code className="block break-all rounded-xl bg-paper-quiet px-3 py-2.5 font-mono text-sm">
            {issued.secret}
          </code>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={QUIET}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(issued.secret);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? "Copied" : "Copy the token"}
            </button>
            <span role="status" className="text-sm text-glass-quiet">
              {copied ? "On the clipboard. Paste it into the assistant's settings." : ""}
            </span>
          </div>
        </div>
      ) : null}
      {issued && "refused" in issued ? <Refused>{issued.refused}</Refused> : null}

      <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className={cn(NAMED, "flex-1")}>
          Name it after where it goes
          <span className={HINT}>Claude, ChatGPT, laptop. You revoke it by this name.</span>
          <input name="name" required maxLength={60} className={FIELD} placeholder="Claude" />
        </label>
        <button type="submit" disabled={pending} className={LOUD}>
          {pending ? "Issuing…" : "Issue a token"}
        </button>
      </form>
    </div>
  );
}
