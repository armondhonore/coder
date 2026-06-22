# Coder documentation style guide

This is the canonical style guide for the Coder documentation.
It's the source of truth that the Vale rules in `docs/.style/styles/Coder/` enforce.

Status: scaffold.
Follow-up PRs populate the sections below.
This page starts as a table of contents and grows as those PRs land.

## How to use this guide

This page is a scaffold while follow-up PRs land.
Sections marked "Coming in follow-up PRs" are placeholders.
For anything not yet covered, see the public summary at [`docs/about/contributing/documentation.md`](../about/contributing/documentation.md).

- **Contributors**: read the section that matches what you are writing.
  Each rule notes the Vale rule ID, if any, so you can reproduce the warning locally.
- **Reviewers**: cite the section in a review comment.
  Reviews are easier when the guidance is in one place.
- **AI agents**: read this page in full before editing anything under `docs/`.
  The Coder Agents and Claude Code guides ([`AGENTS.md`](../../AGENTS.md), [`.claude/docs/DOCS_STYLE_GUIDE.md`](../../.claude/docs/DOCS_STYLE_GUIDE.md)) link here.

## Voice and tone

Coming in follow-up PRs:

- Active voice
- Second person
- Plural nouns and pronouns where number is uncertain
- Product voice (`stop` over `kill`, `turn off` over `disable` in user-facing copy)
- Limit `we`

## Word choice

Coming in follow-up PRs:

- Inclusive-language substitutions
- Dev Container terminology
- "Setup" vs "set up" and Quickstart casing
- "Next steps" vs "Learn more"
- Weasel words

### Brand names

Use each brand's canonical casing in prose.
URLs and code references (Terraform provider source addresses, GitHub paths) keep the lowercase form their owner uses.
Vale's `substitution` rule skips inline code and links by default, so those aren't affected.

| Wrong       | Correct     | Notes                             |
|-------------|-------------|-----------------------------------|
| `Hashicorp` | `HashiCorp` | Mixed case: capital H, capital C. |

More brands (GitHub, OpenTofu, Kubernetes, Terraform, JetBrains, VS Code) extend this table as they land in follow-up PRs.

Enforced by `Coder.BrandNames` (level `error`).
To add a brand: append a swap to `docs/.style/styles/Coder/BrandNames.yml`,
run `make lint/prose` to catch existing-content violations,
fix them, then commit.

## Capitalization and punctuation

Coming in follow-up PRs:

- Sentence case in titles and headings
- General capitalization policy
- Em-dash and en-dash ban (use comma, semicolon, or period)

## Formatting

Coming in follow-up PRs:

- Bold for UI elements
- Italics for parameter names and version variables
- Code font for user input, command-line utility names, filenames, environment variables, HTTP verbs and status codes, placeholder variables
- Code blocks with explicit language fences

## Vale enforcement

The repo-root `.vale.ini` configures Vale to read styles from `docs/.style/styles/`.
The starter configuration combines:

- Google's developer-docs base style
- A curated subset of `alex` (inclusive-language)
- A curated subset of `write-good` (wordiness)
- Coder-specific custom rules in `docs/.style/styles/Coder/`

The rationale for the cherry-picked base styles and the severity policy lives in `.vale.ini`'s inline comments.
Run `make lint/prose` to reproduce the baseline locally.

## Editor setup

A follow-up PR adds coverage for VS Code, Cursor, JetBrains, and Neovim.

## Relationship to `docs/about/contributing/documentation.md`

A public-facing prose summary lives today at [`docs/about/contributing/documentation.md`](../about/contributing/documentation.md).
A follow-up PR redirects that page to this guide.
Until then, follow the public summary for anything the scaffolded sections in this guide don't yet cover.
New prose rules land here; the public page is frozen pending the redirect.

## Third-party references

When this guide doesn't cover something, consult:

| Type of guidance    | Reference                                                                               |
|---------------------|-----------------------------------------------------------------------------------------|
| Spelling            | [Merriam-Webster](https://www.merriam-webster.com/)                                     |
| Style, nontechnical | [The Chicago Manual of Style](https://www.chicagomanualofstyle.org/home.html)           |
| Style, technical    | [Microsoft Writing Style Guide](https://learn.microsoft.com/en-us/style-guide/welcome/) |
