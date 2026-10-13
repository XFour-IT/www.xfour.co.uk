---
title: "Draft: not yet published (test fixture)"
description: "Used only to prove the blog index, RSS feed and sitemap all exclude drafts."
publishDate: 2026-10-09
author: ben-lewis
track: dynamics-365
draft: true
---

This post exists only so the test suite has a draft to exclude. It is not real content and it never gets a page: `getStaticPaths` in `src/pages/blog/[slug].astro` only builds pages for non-draft posts.
