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

describe('public content validation', () => {
  it('rejects invalid publication dates', () => {
    for (const publishedAt of ['nonsense', '2026-02-30T12:00:00Z']) {
      assert.equal(blogPostInputSchema.safeParse({ title: 'Post', content: 'Text', publishedAt }).success, false);
    }
  });
  it('rejects unsupported remote cover URLs', () => {
    assert.equal(blogPostInputSchema.safeParse({ title: 'Post', content: 'Text', coverImageUrl: 'https://untrusted.test/image.jpg' }).success, false);
  });
});

describe('cover image allowlist', () => {
  it('accepts local images and only the configured public storage bucket', async () => {
    const { isSupportedCoverImage, contentImagePatterns } = await import('./content-images');
    const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://storage.example.test';
    try {
      assert.equal(isSupportedCoverImage('/images/cover.jpg'), true);
      assert.equal(isSupportedCoverImage('https://storage.example.test/storage/v1/object/public/blog-assets/cover.jpg'), true);
      for (const value of ['//evil.test/image.jpg', '/images/../private.jpg', 'https://storage.example.test/storage/v1/object/public/private/cover.jpg', 'https://storage.example.test.evil.test/storage/v1/object/public/blog-assets/a.jpg']) {
        assert.equal(isSupportedCoverImage(value), false);
      }
      assert.equal(contentImagePatterns()[0].hostname, 'storage.example.test');
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = previous;
    }
  });
});
