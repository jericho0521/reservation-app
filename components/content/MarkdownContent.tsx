import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownContentProps {
  content: string;
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 className="mt-10 mb-4 text-4xl font-bold font-heading">{children}</h1>,
        h2: ({ children }) => <h2 className="mt-10 mb-4 text-3xl font-bold font-heading">{children}</h2>,
        h3: ({ children }) => <h3 className="mt-8 mb-3 text-2xl font-semibold">{children}</h3>,
        p: ({ children }) => <p className="mb-5 leading-8 text-gray-200">{children}</p>,
        a: ({ href, children }) => (
          <a href={href} className="text-neon underline decoration-neon/40 underline-offset-4 hover:text-white">
            {children}
          </a>
        ),
        ul: ({ children }) => <ul className="mb-6 list-disc space-y-2 pl-6 text-gray-200">{children}</ul>,
        ol: ({ children }) => <ol className="mb-6 list-decimal space-y-2 pl-6 text-gray-200">{children}</ol>,
        blockquote: ({ children }) => (
          <blockquote className="my-8 border-l-4 border-neon bg-white/5 px-5 py-4 text-gray-200">
            {children}
          </blockquote>
        ),
        code: ({ children }) => <code className="rounded bg-white/10 px-1.5 py-0.5 text-sm text-neon">{children}</code>,
        pre: ({ children }) => <pre className="mb-6 overflow-x-auto rounded-xl bg-black/40 p-4 text-sm">{children}</pre>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
