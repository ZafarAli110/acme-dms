# Evidence

One file per ticket, written by the `verify-ticket` skill: every requirement, the command that checks it in the running
system, what it should return and what it returned. A reviewer re-runs the commands against a reset system
(`bun run reset`) instead of trusting the summary. Each file ends with what its checks don't prove, so the
reviewer knows where to look.
