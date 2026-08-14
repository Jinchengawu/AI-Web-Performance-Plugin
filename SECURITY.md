# Security policy

## Reporting a vulnerability

Please do not disclose security issues in a public GitHub issue. Use GitHub's private vulnerability reporting for this repository, or contact the repository owner privately.

Include the affected version, reproduction steps, impact, and any suggested mitigation. Do not include live API keys, private source code, or third-party personal data.

## Credential handling

- The Chrome extension stores provider credentials in `chrome.storage.local` for local-development convenience.
- The editor extension stores credentials in VS Code SecretStorage.
- Exported Audit Packages and Fix Sessions must never contain provider credentials.
- Persisted page history strips URL query strings and fragments, keeps only bounded report evidence, and remains in `chrome.storage.local`.
- Renderer private-memory collection is optional and requested only after an explicit user action; the extension never exposes process termination controls.
- Revoke and replace any credential accidentally included in a screenshot, report, issue, or commit.

For public distribution, deploy a backend token broker instead of shipping long-lived provider credentials to browser clients.
