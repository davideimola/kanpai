"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { issueAuthorizationCode } from "@/core/verbs/oauth";
import { requireOwner } from "@/lib/auth/owner";
import { judgeAuthorizationRequest, sendBack } from "@/lib/oauth/authorize";
import { originOfHeaders } from "@/lib/oauth/origin";

// The two answers on the consent screen (ADR-0013). Each is a POST anyone can make, so each
// calls the wall and **judges the request again** from the form's hidden fields rather than
// trusting that the page did: the code issued here is the owner's yes, and it goes to whatever
// address the form names unless that address is checked once more, here.

/** *Allow*: a code for the app, sent back to it with its `state` and our `iss`. */
export async function allow(form: FormData): Promise<void> {
  await requireOwner();
  const origin = originOfHeaders(await headers());
  const verdict = await judgeAuthorizationRequest(fieldsOf(form), origin);
  if (verdict.kind === "stop") throw new Error(verdict.message);
  if (verdict.kind === "send-back") redirect(verdict.to);

  const { request } = verdict;
  const code = await issueAuthorizationCode({
    clientId: request.clientId,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
  });
  redirect(sendBack(request.redirectUri, origin, request.state, { code }));
}

/** *Don't allow*: the app is told `access_denied`, and nothing is issued. */
export async function deny(form: FormData): Promise<void> {
  await requireOwner();
  const origin = originOfHeaders(await headers());
  const verdict = await judgeAuthorizationRequest(fieldsOf(form), origin);
  if (verdict.kind === "stop") throw new Error(verdict.message);
  if (verdict.kind === "send-back") redirect(verdict.to);

  const { request } = verdict;
  redirect(
    sendBack(request.redirectUri, origin, request.state, {
      error: "access_denied",
      error_description: "The owner did not allow it.",
    })
  );
}

/** The form's fields as the judge reads them: a string or nothing, and never a file. */
function fieldsOf(form: FormData) {
  return {
    get(name: string): string | null {
      const value = form.get(name);
      return typeof value === "string" && value !== "" ? value : null;
    },
  };
}
