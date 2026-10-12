# Anyone runs their own copy, from a published image

kanpai is single-owner **per copy**, and anyone may run a copy. There is no tenancy in the
schema and there is not meant to be: a second person gets a second deployment, never a second
account in someone else's. That is tsundoku's rule (its ADR-0004 and *Running your own copy*);
kanpai goes one step further and **treats the self-hoster as a user**, not as a developer who
forked the repo.

## What it decides

- **A published image.** Every release pushes a multi-arch image to GHCR. Running a copy is
  `docker compose up` with the repo's `compose.yaml` and a filled-in `.env` — **no clone, no
  node, no build**. Postgres, the migrations and the app are the three services, in that order,
  as in tsundoku.
- **Configuration is environment only.** Nothing about the owner's own cluster — domain,
  ingress, sealed secrets, backups — lives in this repo; it lives in `davideimola/cluster`, as
  for the siblings. The repo's deployment is the compose file and a plain Kubernetes example at
  most.
- **The owner gate takes any of a short list of sign-in providers** through Auth.js, chosen by
  environment — Google and GitHub to start — restricted to one address. Creating a Google OAuth
  client is the step most likely to make a non-developer give up, and GitHub's takes a minute.
- **The Vivino fallback is opt-in.** It is off unless `SOURCES_VIVINO=true`
  ([ADR-0006](0006-sources-are-open-food-facts-then-vivino-and-images-are-hotlinked.md)). Using
  an unofficial endpoint is a choice each person running a copy makes for themselves; the
  default copy talks only to Open Food Facts, whose terms invite it. The owner's own copy turns
  it on.
- **The MCP door is documented for each assistant**: Claude with the bearer over the public
  address; ChatGPT through OpenAI's Secure MCP Tunnel, as the owner's cluster does for
  tsundoku — so a copy needs no OAuth server for either. Plus the sommelier prompt to paste in
  the assistant's project.

## Consequences

- **Every cluster-specific convenience becomes a variable or stays out.** That is a cost on
  each slice, and the reason the image has to be built and run by CI from S0, not added at the
  end.
- **Backups remain the self-hoster's job**, and the README says so as plainly as tsundoku's
  does: the volume is where the data lives, not where it is safe.
- **The interface stays in English.** A translation layer is the obvious next request from
  "many users" and it is deliberately not built until someone other than the owner runs a copy.
