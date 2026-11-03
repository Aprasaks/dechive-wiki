# DECHIVE.WIKI

**The Infinite Archive of Human Knowledge**  
*One Archive. Infinite Connections.*

DECHIVE.WIKI is an independent, English-first knowledge platform designed to connect concepts, people, books, papers, events, history, science, arts, and other areas of human knowledge.

The goal is not to publish the largest number of pages. It is to build a living archive where knowledge can be **discovered, understood, connected, sourced, corrected, and preserved**.

## Product principles

- **Open discovery:** Core knowledge and search are freely accessible without an account.
- **Meaningful connections:** Follow typed, evidence-backed relationships across disciplines.
- **Verification first:** A citation alone is not proof. Verification belongs to a specific claim and published revision.
- **Enduring identity:** Entities have permanent IDs independent of titles, URLs, taxonomy placement, or language.
- **Transparent history:** Revisions, corrections, uncertainty, and provenance remain inspectable.
- **Rights-aware publishing:** External text, images, scans, and documents are not redistributed without appropriate rights.
- **Automation with controls:** Automated research and draft proposals may assist editors; unverified content must not be automatically published.
- **English at launch:** Public UI and editorial entries launch in English; the data model should support future languages without duplicating knowledge identities.

## Reader experience

The planned experience combines the clarity of an encyclopedia with the daily discovery of an editorial publication:

- A search-first homepage and navigable knowledge domains
- Entity pages with definitions, sources, related ideas, and revision history
- Cross-domain knowledge journeys and guided exploration
- **Today in the Archive**, **Random Discovery**, and **New & Verified**
- Optional personal reading lists and collections, without requiring login to read

These are product goals, **not shipped features**.

## Current status

**Pre-implementation / architecture validation — production NO-GO.**

The initial architecture and automation designs are proposals. No production deployment, database migration, public content catalog, or autonomous publishing system is claimed to exist.

The first engineering milestone is **P0: a reproducible, isolated proof of knowledge integrity and publishing safety**.

See [P0 Foundation & Acceptance Criteria](docs/P0_FOUNDATION.md).

## Technical direction (under evaluation)

- PostgreSQL as a candidate knowledge store and initial search engine
- Wikibase statement model evaluated against a custom PostgreSQL knowledge model
- Payload CMS as a candidate editorial interface
- Next.js as a candidate public web application
- AWS as a candidate infrastructure provider

**No final production stack is approved yet.** Pin versions and evaluate licensing, cost, access controls, and recovery before deployment.

## Business and audience philosophy

Inspired by Russell Brunson's design principles, the reader journey is:

**Discover → Understand → Explore → Trust → Return → Voluntarily share or engage more deeply.**

Useful knowledge comes first. No forced email or direct-message exchanges for access to core information.

## Boundaries

This repository is for **DECHIVE.WIKI only**. It does not include, migrate, or operate any other DECHIVE properties or businesses.

Do not commit credentials, private account data, unlicensed source materials, or unreviewed user information.

---

**Status:** Planning and verification in progress · **Public language:** English · **Repository:** Independent
