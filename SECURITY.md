# Security policy

## Supported versions

Security fixes are applied to the latest commit on the `main` branch. Zenex has not reached a stable 1.0 release, so older commits and forks are not covered by a support guarantee.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability.

Use GitHub's **Security → Report a vulnerability** flow on the [Zenex CMS repository](https://github.com/dopost-co/doblog/security/advisories/new). Include the affected component, reproduction steps, impact and any suggested mitigation. If private vulnerability reporting is unavailable, contact Dopost through [dopost.co](https://dopost.co) without including exploit details in a public channel.

We will acknowledge a complete report as soon as practical, investigate it privately and coordinate disclosure after a fix is available. Please avoid accessing data that is not yours, disrupting services or publishing details before that coordination is complete.

## Deployment responsibility

Self-hosters are responsible for applying updates, protecting secrets, configuring HTTPS and reverse-proxy limits, restricting database and object-storage credentials, and monitoring their deployment. See the security and operations section in the [README](README.md#security-and-operations).
