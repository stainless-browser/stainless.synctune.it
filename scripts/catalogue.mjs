// What the website publishes: the Stainless source it vendors and where each page lives.

export const site = {
  name: "Stainless",
  origin: "https://stainless.synctune.it",
  description: "Stainless is a free, Chromium-based browser for Apple Silicon Macs, built without Google's services, ads, tracking or a mandatory account.",
};

export const upstream = {
  repository: "stainless-browser/stainless",
  url: "https://github.com/stainless-browser/stainless",
};

// Upstream files rendered as pages. `source` is the path in the Stainless repository,
// `path` the published directory. Every Markdown file in vendor/stainless must appear here.
export const sections = [
  {
    title: "Start here",
    pages: [
      { source: "docs/README.md", path: "docs/", label: "Docs overview" },
      { source: "docs/status.md", path: "docs/status/", label: "Project status" },
      { source: "docs/install-macos.md", path: "docs/install-macos/", label: "Install, update and remove" },
    ],
  },
  {
    title: "Using Stainless",
    pages: [
      { source: "docs/degoogling.md", path: "docs/degoogling/", label: "Feature availability" },
      { source: "docs/threat-protection.md", path: "docs/threat-protection/", label: "Threat lists and breach checks" },
      { source: "docs/profile-isolation.md", path: "docs/profile-isolation/", label: "Profiles, modes and recovery" },
      { source: "docs/history-privacy.md", path: "docs/history-privacy/", label: "Saved-history privacy" },
      { source: "docs/internal-urls.md", path: "docs/internal-urls/", label: "Internal addresses" },
      { source: "docs/resource-overview.md", path: "docs/resource-overview/", label: "Resource overview" },
      { source: "docs/keymaps.md", path: "docs/keymaps/", label: "Portable keymaps" },
      { source: "docs/web-push-self-hosting.md", path: "docs/web-push-self-hosting/", label: "Self-hosted Web Push" },
    ],
  },
  {
    title: "Contributing",
    pages: [
      { source: "CONTRIBUTING.md", path: "docs/contributing/", label: "Contributing guide" },
      { source: "docs/build-macos.md", path: "docs/build-macos/", label: "Building on macOS" },
      { source: "docs/compile-cache.md", path: "docs/compile-cache/", label: "Compile cache" },
      { source: "docs/local-services.md", path: "docs/local-services/", label: "Local services" },
      { source: "docs/phase-one.md", path: "docs/phase-one/", label: "Phase 1 contract" },
      { source: "docs/update-verification.md", path: "docs/update-verification/", label: "Update verification" },
      { source: "docs/releasing.md", path: "docs/releasing/", label: "Releasing" },
    ],
  },
  {
    title: "Planning",
    pages: [
      { source: "docs/roadmap.md", path: "docs/roadmap/", label: "Roadmap" },
      { source: "docs/decisions-q-and-a.md", path: "docs/decisions-q-and-a/", label: "Decisions Q&A", title: "Decisions Q&A" },
    ],
  },
  {
    title: "Policies",
    pages: [
      { source: "SECURITY.md", path: "docs/security/", label: "Security policy" },
      { source: "ACCESSIBILITY.md", path: "docs/accessibility/", label: "Accessibility" },
      { source: "CODE_OF_CONDUCT.md", path: "docs/code-of-conduct/", label: "Code of Conduct" },
      { source: "LICENSE", path: "docs/license/", label: "License", title: "Apache License 2.0", plain: true },
    ],
  },
];

export const pages = sections.flatMap((section) => section.pages.map((page) => ({ ...page, section: section.title })));

// Upstream files the site copies: every rendered page plus the brand artwork.
export const vendoredDocuments = pages.map((page) => page.source);
export const brandingSources = ["chromium/branding/stainless-icon.png", "chromium/branding/stainless-logo.png"];

// Upstream paths that link to a site page instead of GitHub.
export const pageAliases = { "README.md": "" };
