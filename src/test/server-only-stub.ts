// `server-only` is a Next.js package whose whole content is a build error, thrown
// when a module that imports it ends up in a client bundle. It exports nothing and
// runs nothing, so standing in for it here loses no behaviour: what it guarantees is
// checked by `next build`, which is the only place it can be checked at all.
export {};
