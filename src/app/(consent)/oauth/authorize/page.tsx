import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LOUD, QUIET } from "@/components/controls";
import { Refused } from "@/components/drawer";
import { requireOwner } from "@/lib/auth/owner";
import { judgeAuthorizationRequest } from "@/lib/oauth/authorize";
import { originOfHeaders } from "@/lib/oauth/origin";
import { cn } from "@/lib/utils";
import { allow, deny } from "./actions";

// THE CONSENT SCREEN (ADR-0013): an app — ChatGPT, Claude — asks to read and write the owner's
// record, and the owner says yes or no. The authorization endpoint of kanpai's own OAuth
// server, and the one OAuth step a person sees.
//
// Behind the gate like every screen over the record: a visitor with no session is sent to sign
// in, and comes back here with the same request (`@/lib/auth/return-to`). Without the shell
// (`../../layout.tsx`): one question and two buttons, then back to the app.
//
// The request is judged before anything is drawn (`@/lib/oauth/authorize`). An app or an
// address that cannot be trusted gets a page saying so and is sent nowhere; any other mistake
// goes back to the app as an error it can act on.

type Asked = Record<string, string | string[] | undefined>;

/** The parameters the request carries on, as hidden fields, to the answer the owner gives. */
const CARRIED = [
  "response_type",
  "client_id",
  "redirect_uri",
  "code_challenge",
  "code_challenge_method",
  "state",
  "resource",
  "scope",
] as const;

export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Asked> }) {
  await requireOwner();

  const asked = await searchParams;
  // A parameter given twice is not a parameter (RFC 6749 §3.1), so it reads as absent and the
  // request is refused for missing it rather than read for one of its two values.
  const get = (name: string): string | null => {
    const value = asked[name];
    return typeof value === "string" && value !== "" ? value : null;
  };

  const origin = originOfHeaders(await headers());
  const verdict = await judgeAuthorizationRequest({ get }, origin);
  if (verdict.kind === "send-back") redirect(verdict.to);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-5 py-10 sm:px-8">
      <p className="font-mono text-xs uppercase tracking-[0.22em] text-glass-quiet">kanpai</p>

      {verdict.kind === "stop" ? (
        <div className="flex flex-col gap-4">
          <h1 className="font-serif text-[28px] font-bold leading-tight">
            This link cannot be used
          </h1>
          <Refused>{verdict.message}</Refused>
        </div>
      ) : (
        <div className="flex flex-col gap-6 rounded-2xl bg-paper-raised p-5 sm:p-6">
          <div className="flex flex-col gap-3">
            <h1 className="font-serif text-[26px] font-bold leading-tight">
              Connect {verdict.request.clientName}?
            </h1>
            <p className="text-pretty text-[15px] leading-relaxed">
              {verdict.request.clientName} wants to read and write your kanpai: your diary, cellar,
              wishlist and Palate.
            </p>
            <p className="text-pretty text-[13px] leading-relaxed text-glass-quiet">
              If you allow it, you will go back to{" "}
              <span className="font-medium text-glass">
                {new URL(verdict.request.redirectUri).host}
              </span>
              . It stays connected until you disconnect it in Settings. Only allow an app you just
              asked to connect.
            </p>
          </div>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <form action={deny}>
              <Carried get={get} />
              <button type="submit" className={cn(QUIET, "w-full sm:w-auto")}>
                Don't allow
              </button>
            </form>
            <form action={allow}>
              <Carried get={get} />
              <button type="submit" className={cn(LOUD, "w-full sm:w-auto")}>
                Allow
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

/** The request, as hidden fields: the answer's Server Function judges it again from these. */
function Carried({ get }: { get: (name: string) => string | null }) {
  return (
    <>
      {CARRIED.map((name) => {
        const value = get(name);
        return value === null ? null : <input key={name} type="hidden" name={name} value={value} />;
      })}
    </>
  );
}
