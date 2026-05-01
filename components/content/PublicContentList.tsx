import Image from "next/image";
import Link from "next/link";
import { CalendarDays, ArrowRight } from "lucide-react";
import { getSectionLabels, type BlogPostRecord, type ContentSectionType } from "@/lib/blogs";

interface PublicContentListProps {
  section: ContentSectionType;
  posts: BlogPostRecord[];
}

function formatDate(value: string | null) {
  if (!value) return "Draft";
  return new Intl.DateTimeFormat("en-MY", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function PublicContentList({ section, posts }: PublicContentListProps) {
  const labels = getSectionLabels(section);
  const eyebrow = section === "blog" ? "Stories from the grid" : "Latest from Project Play";
  const heading = section === "blog" ? "Blog" : "Updates";
  const description = section === "blog"
    ? "Guides, event recaps, and behind-the-scenes notes for sim racers and console players."
    : "News, announcements, and operational updates from Project Play by CW.";

  return (
    <main className="min-h-screen bg-racing-dark text-white selection:bg-neon selection:text-racing-dark">
      <section className="relative overflow-hidden border-b border-white/10 px-6 py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(185,217,207,0.16),transparent_35%)]" />
        <div className="container relative mx-auto max-w-6xl">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.35em] text-neon">{eyebrow}</p>
          <h1 className="max-w-3xl text-5xl font-black uppercase italic tracking-tighter font-heading md:text-7xl">
            {heading}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-gray-300">{description}</p>
        </div>
      </section>

      <section className="container mx-auto max-w-6xl px-6 py-16">
        {posts.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center">
            <h2 className="text-2xl font-bold">No {labels.plural.toLowerCase()} published yet</h2>
            <p className="mt-3 text-gray-400">Check back soon for new content.</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <Link
                key={post.id}
                href={`${labels.publicPath}/${post.slug}`}
                className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] transition-all hover:-translate-y-1 hover:border-neon/60 hover:bg-white/[0.08]"
              >
                <div className="relative h-48 bg-white/5">
                  {post.cover_image_url ? (
                    <Image
                      src={post.cover_image_url}
                      alt=""
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                      sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-gradient-to-br from-neon/20 via-white/5 to-cyan-500/10 text-sm uppercase tracking-[0.3em] text-neon">
                      {section}
                    </div>
                  )}
                </div>
                <div className="p-6">
                  <div className="mb-4 flex items-center gap-2 text-xs uppercase tracking-wider text-gray-400">
                    <CalendarDays className="h-4 w-4" />
                    {formatDate(post.published_at)}
                  </div>
                  <h2 className="text-2xl font-bold font-heading group-hover:text-neon">{post.title}</h2>
                  {post.excerpt && <p className="mt-3 line-clamp-3 text-sm leading-6 text-gray-300">{post.excerpt}</p>}
                  <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-neon">
                    Read more <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
