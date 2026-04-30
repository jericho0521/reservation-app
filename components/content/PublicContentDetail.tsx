import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { getSectionLabels, type BlogPostRecord, type ContentSectionType } from "@/lib/blogs";
import { MarkdownContent } from "@/components/content/MarkdownContent";

interface PublicContentDetailProps {
  section: ContentSectionType;
  post: BlogPostRecord;
}

function formatDate(value: string | null) {
  if (!value) return "Unpublished";
  return new Intl.DateTimeFormat("en-MY", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function PublicContentDetail({ section, post }: PublicContentDetailProps) {
  const labels = getSectionLabels(section);

  return (
    <main className="min-h-screen bg-racing-dark text-white selection:bg-neon selection:text-racing-dark">
      <article>
        <header className="border-b border-white/10 px-6 py-16">
          <div className="container mx-auto max-w-4xl">
            <Link href={labels.publicPath} className="mb-8 inline-flex items-center gap-2 text-sm text-gray-400 hover:text-neon">
              <ArrowLeft className="h-4 w-4" /> Back to {labels.plural}
            </Link>
            <div className="mb-5 flex items-center gap-2 text-sm uppercase tracking-wider text-neon">
              <CalendarDays className="h-4 w-4" /> {formatDate(post.published_at)}
            </div>
            <h1 className="text-4xl font-black uppercase italic tracking-tighter font-heading md:text-6xl">{post.title}</h1>
            {post.excerpt && <p className="mt-6 text-lg leading-8 text-gray-300">{post.excerpt}</p>}
          </div>
        </header>

        {post.cover_image_url && (
          <div className="container mx-auto max-w-5xl px-6 pt-10">
            <div className="relative h-[360px] overflow-hidden rounded-2xl border border-white/10 bg-white/5">
              <Image src={post.cover_image_url} alt="" fill className="object-cover" priority sizes="(min-width: 1024px) 960px, 100vw" />
            </div>
          </div>
        )}

        <div className="container mx-auto max-w-3xl px-6 py-12">
          <MarkdownContent content={post.content} />
        </div>
      </article>
    </main>
  );
}
