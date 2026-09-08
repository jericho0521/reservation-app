const storagePrefix = '/storage/v1/object/public/blog-assets/';

export function contentImagePatterns() {
  try {
    const origin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
    if (origin.protocol !== 'https:') return [];
    return [{ protocol: 'https' as const, hostname: origin.hostname, port: origin.port, pathname: `${storagePrefix}**`, search: '' }];
  } catch {
    return [];
  }
}

export function isSupportedCoverImage(value: string | null | undefined): boolean {
  if (!value) return false;
  if (/^\/images\/[\w/.-]+\.(?:png|jpe?g|webp|gif|avif)$/i.test(value) && !value.includes('..')) return true;
  try {
    const url = new URL(value);
    return !url.username && !url.password && !url.search && !url.hash && contentImagePatterns().some(pattern =>
      url.protocol === `${pattern.protocol}:` && url.hostname === pattern.hostname &&
      url.port === pattern.port && url.pathname.startsWith(storagePrefix) && url.pathname.length > storagePrefix.length,
    );
  } catch {
    return false;
  }
}
