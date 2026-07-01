# @openclaw/binder — Development Rules

## Repository visibility

This is a **public repository**. Any code, config, comment, or commit message pushed to `main` is visible to everyone on the internet.

## Security: what to never commit

Do not commit the following. The pre-commit hook blocks some of these, but the agent must also check manually:

1. **Staging/internal URLs** — never commit staging endpoint URLs, internal hostnames, or dev-only domains. If a URL is not accessible from public internet, do not write it in docs, code, or commit messages.

2. **API tokens, keys, secrets** — never hardcode `token`, `webhookSecret`, `apiKey`, `password`, or similar values in source files. All such values are user-provided config at runtime.

3. **Placeholder examples of real secrets** — do not write `api.heybinder.com` in a commit message explaining a security fix. Use generic examples like `https://api.example.com`.

4. **Environment-specific config** — do not add `.env`, `.env.local`, `*.pem`, or credential files to version control.

## Before every commit

1. Check `git diff --cached` for any staging URLs, internal hostnames, or placeholder secrets.
2. Verify commit message does not contain internal URLs.
3. Run `bash scripts/setup-hooks.sh` if cloning fresh — enables the pre-commit hook.

## Commit messages

- Describe what changed and why, not how.
- Do not include URLs, hostnames, or tokens in commit messages.
- Use the imperative mood ("fix", "add", "bump", not "fixed", "added").

## Skill docs

- Default API URLs in skill docs must point to production only: `https://api.heybinder.com`.
- When `Binder API URL` comes from the prompt, the agent uses that. The skill doc's default is only a fallback for when the prompt does not provide one.
- Do not document multiple environments in public-facing docs.

## Versioning

- Bump version in both `package.json` and `openclaw.plugin.json` for every release.
- Follow calver: `YYYY.M.D.PATCH`.

## Quick reference

```bash
# Enable hooks after clone
bash scripts/setup-hooks.sh

# Stage and commit
git add -A
git commit -m "fix: description of change"
git push origin main
```
