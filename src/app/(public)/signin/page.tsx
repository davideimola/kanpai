import { Button } from "@/components/ui/button";
import { signInWithGoogle } from "@/lib/auth/actions";

// The only screen a non-owner can reach, so it shows **nothing about what is recorded** —
// not how many Tastings, not a Label's name, not that there is anything in there at all. A
// wordmark, a line saying what this is, and one button.
//
// It carries no chrome either: navigation would name screens a visitor may not open.

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // Auth.js sends its own failures here rather than to its default error page,
  // `AccessDenied` among them — which is what a Google account that is not the
  // owner's gets. Which address *would* work is not a visitor's business.
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-5 py-10 sm:px-8">
      <div>
        <h1 className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">
          kanpai
        </h1>
        <p className="mt-4 border-t border-border pt-4 text-pretty text-sm leading-relaxed">
          A private record of wine and spirits — what was drunk, what is in the house, what is worth
          trying. One Google address gets in.
        </p>
      </div>

      <form action={signInWithGoogle}>
        {/* The one thing anyone taps here, so it is a full touch target rather than
            the primitive's default height. */}
        <Button type="submit" size="lg" className="h-11 w-full">
          Sign in with Google
        </Button>
      </form>

      {error ? (
        <p className="text-xs leading-relaxed text-destructive">
          That Google account cannot sign in. This copy admits one address, and the sign-in reached
          it with another.
        </p>
      ) : null}
    </main>
  );
}
