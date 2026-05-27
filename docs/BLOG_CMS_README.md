# Blog and Updates CMS Guide

This guide explains how to set up and use the custom headless CMS for blog posts and news updates.

The CMS stores both sections in the Supabase `content_posts` table. Blogs and updates use separate public and admin pages, but they share the same schema and editor.

## Routes

- Public blog list: `/blog`
- Public blog detail: `/blog/[slug]`
- Public updates list: `/updates`
- Public update detail: `/updates/[slug]`
- Admin blog manager: `/admin/blogs`
- Admin updates manager: `/admin/updates`

## First-Time Setup

1. Open the Supabase SQL editor.
2. Run `supabase/blogs.sql`.
3. Refresh the Supabase/PostgREST schema cache if the app reports that `content_posts` is missing.
4. Create or use an authenticated Supabase admin user.
5. Start the app:

```bash
pnpm dev
```

6. Sign in at `/admin/login`.

## Add a Blog Post

1. Open `/admin/blogs`.
2. Click `New Blog Post`.
3. Add a title.
4. Leave `Slug` blank to generate one from the title, or enter a custom URL-safe slug.
5. Add an optional excerpt. If left blank, the app creates one from the Markdown content.
6. Write the post body in Markdown. The preview panel renders Markdown with GitHub Flavored Markdown support.
7. Add an optional public cover image URL.
8. Set `Status` to `Published` when the post should appear publicly.
9. Leave `Published At` blank unless you need a specific timestamp. Published posts auto-fill this value when saved.
10. Add optional `SEO Title` and `SEO Description`.
11. Click `Save`.

The published post appears at `/blog/[slug]`.

## Add an Update

1. Open `/admin/updates`.
2. Click `New Update`.
3. Add a title.
4. Leave `Slug` blank to generate one from the title, or enter a custom URL-safe slug.
5. Add an optional excerpt.
6. Write the update body in Markdown.
7. Add an optional public cover image URL.
8. Set `Status` to `Published` when the update should appear publicly.
9. Click `Save`.

The published update appears at `/updates/[slug]`.

## Publishing Rules

- `draft` content is visible in admin only.
- `published` content is visible on public routes.
- `archived` content is hidden from public routes and kept in admin history.
- Slugs must be unique within each section.
- A blog and an update can share the same slug because their public paths are different.
- Raw HTML is not enabled in Markdown rendering. Use Markdown syntax instead.

## Cover Images

- The editor currently accepts a public image URL.
- `supabase/blogs.sql` creates a public `blog-assets` storage bucket for future media management or manual uploads.
- If you manually upload to `blog-assets`, paste the public asset URL into `Cover Image URL`.

## Markdown Support

The editor supports standard Markdown plus GitHub Flavored Markdown through `react-markdown` and `remark-gfm`.

Common syntax:

```markdown
# Heading

Intro paragraph with **bold text** and [a link](https://example.com).

- Bullet point
- Another bullet point

> Highlighted quote
```

## Troubleshooting

If public pages show no posts:

- Confirm the post status is `published`.
- Confirm `published_at` is set.
- Confirm `supabase/blogs.sql` has been applied.
- Refresh the Supabase/PostgREST schema cache if the table was just created.

If saving fails with a duplicate slug error:

- Change the slug in the editor.
- Keep slugs lowercase and URL-safe, such as `sim-racing-tips`.

If images do not load:

- Confirm the cover image URL is publicly accessible.
- If using Supabase Storage, confirm the file is in a public bucket or has a signed URL.
