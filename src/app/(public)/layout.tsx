// The `(public)` group: everything reachable **without** the gate. It exists from the
// day the gate does, so that a page outside the gate can never sit under the same
// layout tree as one behind it.
//
// Route groups do not appear in the URL, so this group is not addressable by the
// proxy's matcher — which is why `/signin` is named there as a path. Putting a page
// here is therefore two deliberate acts, not one: the file goes in this group *and*
// the path is excluded in `src/proxy.ts`.
export default function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
