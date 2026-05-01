import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  blogPostInputSchema,
  buildBlogExcerpt,
  normalizeBlogPostInput,
  slugifyBlogTitle,
} from "./blogs";

describe("slugifyBlogTitle", () => {
  it("creates URL-safe slugs from titles", () => {
    assert.equal(
      slugifyBlogTitle("  Racing Simulator Tips: Beginner's Guide!  "),
      "racing-simulator-tips-beginners-guide"
    );
  });

  it("falls back when a title has no usable characters", () => {
    assert.equal(slugifyBlogTitle("!!!"), "post");
  });
});

describe("normalizeBlogPostInput", () => {
  it("normalizes title, slug, status, and published timestamp", () => {
    const result = normalizeBlogPostInput({
      title: "  New Racing League  ",
      slug: "",
      excerpt: "  Coming soon  ",
      content: "Details",
      status: "published",
      coverImageUrl: "",
      seoTitle: "",
      seoDescription: "  League details  ",
    });

    assert.equal(result.title, "New Racing League");
    assert.equal(result.slug, "new-racing-league");
    assert.equal(result.excerpt, "Coming soon");
    assert.equal(result.coverImageUrl, null);
    assert.equal(result.seoTitle, null);
    assert.equal(result.seoDescription, "League details");
    assert.match(result.publishedAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
  });

  it("keeps drafts unpublished", () => {
    const result = normalizeBlogPostInput({
      title: "Draft Post",
      content: "Draft content",
      status: "draft",
      publishedAt: "2026-01-01T00:00:00.000Z",
    });

    assert.equal(result.status, "draft");
    assert.equal(result.publishedAt, null);
  });
});

describe("buildBlogExcerpt", () => {
  it("strips Markdown and truncates content", () => {
    assert.equal(
      buildBlogExcerpt("# Title\n\nThis is **bold** content with [a link](https://example.com).", 32),
      "Title This is bold content wi..."
    );
  });
});

describe("blogPostInputSchema", () => {
  it("rejects empty content", () => {
    assert.throws(() =>
      blogPostInputSchema.parse({
        title: "Post",
        content: "   ",
      })
    );
  });
});
