Waiting for permission to write `reports/codex-plan.md`. Please approve the file write above and I'll proceed.

Once approved, the plan will be written. Here is a summary of what the plan contains:

**Issue validated as:** The `PROGRESS_NOT_IMPLEMENTED = true` constant on line 20 of `progress.tsx` is dead code — it was never wired to anything. The Streak card uses a `<Flame>` icon in `text-warn` (orange) which reads as "active" even though the text says "Unavailable". The page meta description also advertises unimplemented features.

**Three targeted changes, all in `src/routes/progress.tsx`:**
1. **Streak card visual** — replace `text-warn` on the Flame icon with `text-mute`, and bump disclaimer font from `text-[10px]` to `text-[11px]`, gated via the existing `PROGRESS_NOT_IMPLEMENTED` flag.
2. **Meta descriptions** — remove the claim of "milestones and trading streaks" from both the description and OG description meta tags.
3. **Subtitle text** — change `Pulse · streaks · milestones` → `Pulse · equity · drawdown`.

**Explicitly out of scope:** The fib level mock-data parity issue that was appended to the research file — that is a separate bug and gets its own plan.
