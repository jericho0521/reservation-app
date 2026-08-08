export function toPlainChatText(content: string): string {
    return content
        .replace(/```(?:\w+)?\n?([\s\S]*?)```/g, '$1')
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]+)]\(([^)]+)\)/g, '$1 ($2)')
        .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '')
        .replace(/^[ \t]{0,3}>[ \t]?/gm, '')
        .replace(/^[ \t]{0,3}[-*+][ \t]+/gm, '')
        .replace(/(\*\*|__)(.*?)\1/g, '$2')
        .replace(/\*([^*\n]+)\*/g, '$1')
        .replace(/_([^_\n]+)_/g, '$1')
        .replace(/`([^`\n]+)`/g, '$1')
        .replace(/\*/g, '')
        .trim();
}
