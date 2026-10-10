#!/usr/bin/env python3
"""A3D DCO check (A3D-DCO-003; design A3D-DCO-003A).

Verifies that every commit in a pull request carries a real Git
``Signed-off-by:`` trailer whose email matches the commit author email.

Design rules:
- Reads PR data from the GitHub REST API only. Never checks out or runs PR code.
- Fails closed: it fails if it cannot prove every PR commit was examined.
- Trailers are parsed by ``git interpret-trailers`` (Git's own definition), so
  sign-off text outside the final trailer block does not count.
- Bot exemption depends on GitHub-authenticated identity (who opened the PR and
  the account type), never on git author name or email alone.
- Untrusted text (names, emails, messages) is never printed raw to the log.

stdlib only; requires ``git`` on PATH.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import urllib.request
from dataclasses import dataclass, field

# Bots exempt from sign-off. AI coding agents are deliberately NOT listed:
# a human must sign off on what an agent produces.
ALLOWED_BOTS = frozenset({"dependabot[bot]"})

# GitHub's "list commits on a pull request" endpoint returns at most 250 commits.
API_COMMIT_LIMIT = 250

# How merge commits (2+ parents) are treated: "exempt" (still listed in the
# report) or "require" (they need a sign-off like any other commit).
MERGE_POLICY = os.environ.get("DCO_MERGE_POLICY", "exempt")

SHA_RE = re.compile(r"^[0-9a-f]{40}$")
IDENT_RE = re.compile(r"^(?P<name>.*?)\s*<(?P<email>[^<>\s]+)>$")


@dataclass
class Result:
    ok: bool
    passed: list[str] = field(default_factory=list)
    skipped: list[tuple[str, str]] = field(default_factory=list)
    failed: list[tuple[str, str]] = field(default_factory=list)
    fatal: str | None = None


def signoff_emails(message: str) -> list[str]:
    """Return the emails of Signed-off-by trailers in Git's final trailer block."""
    out = subprocess.run(
        ["git", "interpret-trailers", "--parse", "--no-divider"],
        input=message,
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    emails = []
    for line in out.splitlines():
        key, sep, value = line.partition(":")
        if not sep or key.strip().casefold() != "signed-off-by":
            continue
        m = IDENT_RE.match(value.strip())
        if m and m.group("name").strip():
            emails.append(m.group("email").casefold())
    return emails


def is_exempt_bot(pr: dict, c: dict) -> bool:
    """Exempt only commits made by the allowlisted bot that opened the PR.

    The PR opener is authenticated by GitHub and cannot be forged by commit
    metadata. The commit's linked account must be that same bot and the commit
    must carry a GitHub-verified signature.
    """
    opener = pr.get("user") or {}
    author = c.get("author") or {}
    verified = ((c.get("commit") or {}).get("verification") or {}).get("verified") is True
    return (
        opener.get("type") == "Bot"
        and opener.get("login") in ALLOWED_BOTS
        and author.get("type") == "Bot"
        and author.get("login") == opener.get("login")
        and verified
    )


def evaluate(pr: dict, commits: list[dict]) -> Result:
    expected = pr.get("commits")
    head = (pr.get("head") or {}).get("sha")

    # Completeness: prove that every PR commit is in front of us.
    if not isinstance(expected, int) or expected < 1:
        return Result(False, fatal="PR commit count is missing from the API response.")
    if expected > API_COMMIT_LIMIT:
        return Result(False, fatal=f"PR has {expected} commits; the API lists at most "
                                   f"{API_COMMIT_LIMIT}, so not every commit can be verified. "
                                   "Split or squash the PR.")
    shas = [c.get("sha") for c in commits]
    if len(commits) != expected or len(set(shas)) != len(shas):
        return Result(False, fatal=f"API returned {len(commits)} commits "
                                   f"({len(set(shas))} unique); PR reports {expected}.")
    if not all(isinstance(s, str) and SHA_RE.match(s) for s in shas):
        return Result(False, fatal="API returned a malformed commit SHA.")
    if shas[-1] != head:
        return Result(False, fatal="Commit list does not end at the PR head; the PR "
                                   "changed during the check. Re-run.")

    r = Result(True)
    for c in commits:
        sha = c["sha"]
        if len(c.get("parents") or []) > 1 and MERGE_POLICY == "exempt":
            r.skipped.append((sha, "merge commit"))
            continue
        if is_exempt_bot(pr, c):
            r.skipped.append((sha, "allowlisted bot"))
            continue
        author_email = (((c.get("commit") or {}).get("author") or {}).get("email") or "").casefold()
        message = (c.get("commit") or {}).get("message") or ""
        if not author_email:
            r.failed.append((sha, "commit has no author email"))
        elif author_email in signoff_emails(message):
            r.passed.append(sha)
        else:
            r.failed.append((sha, "no Signed-off-by trailer matching the author email"))
    r.ok = not r.failed
    return r


# ---------- I/O layer (not used by tests) ----------

def _get(url: str, token: str):
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        link = resp.headers.get("Link", "")
        return json.load(resp), link


def fetch(api: str, repo: str, number: int, token: str) -> tuple[dict, list[dict]]:
    pr, _ = _get(f"{api}/repos/{repo}/pulls/{number}", token)
    commits, url = [], f"{api}/repos/{repo}/pulls/{number}/commits?per_page=100"
    while url:
        page, link = _get(url, token)
        commits.extend(page)
        m = re.search(r'<([^>]+)>;\s*rel="next"', link)
        url = m.group(1) if m else None
    return pr, commits


def report(r: Result) -> None:
    # Untrusted strings never reach the log. Only SHAs and fixed reason texts are
    # printed, and both are validated or fixed above.
    for sha in r.passed:
        print(f"ok      {sha}")
    for sha, why in r.skipped:
        print(f"skipped {sha} ({why})")
    for sha, why in r.failed:
        print(f"FAILED  {sha} ({why})")
    if r.fatal:
        print(f"FAILED  {r.fatal}")
    if not r.ok:
        print("Fix: git rebase --signoff <base-branch>, then git push --force-with-lease.")
        print("Why: https://developercertificate.org/ (see CONTRIBUTING.md)")


def main() -> int:
    pr, commits = fetch(
        os.environ.get("GITHUB_API_URL", "https://api.github.com"),
        os.environ["REPO"], int(os.environ["PR_NUMBER"]), os.environ["GH_TOKEN"],
    )
    r = evaluate(pr, commits)
    report(r)
    return 0 if r.ok else 1


if __name__ == "__main__":
    sys.exit(main())
