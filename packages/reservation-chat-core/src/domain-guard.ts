export type TopicMatcher =
  | string
  | RegExp
  | ((message: string, normalizedMessage: string) => boolean);

export interface DomainGuardConfig {
  allowedTopics?: readonly TopicMatcher[];
  blockedTopics: readonly TopicMatcher[];
  fallbackResponse: string;
}

function topicMatches(
  matcher: TopicMatcher,
  message: string,
  normalizedMessage: string
): boolean {
  if (typeof matcher === "string") {
    return normalizedMessage.includes(matcher.toLocaleLowerCase());
  }

  if (matcher instanceof RegExp) {
    matcher.lastIndex = 0;
    const matched = matcher.test(message);
    matcher.lastIndex = 0;
    return matched;
  }

  return matcher(message, normalizedMessage);
}

export function getDomainGuardResponse(
  message: string,
  config: DomainGuardConfig
): string | null {
  const normalizedMessage = message.trim();

  if (!normalizedMessage) {
    return null;
  }

  const lowercaseMessage = normalizedMessage.toLocaleLowerCase();
  const allowedTopics = config.allowedTopics ?? [];
  const isAllowedTopic = allowedTopics.some((matcher) =>
    topicMatches(matcher, normalizedMessage, lowercaseMessage)
  );

  if (isAllowedTopic) {
    return null;
  }

  const isBlockedTopic = config.blockedTopics.some((matcher) =>
    topicMatches(matcher, normalizedMessage, lowercaseMessage)
  );

  return isBlockedTopic ? config.fallbackResponse : null;
}

export function createDomainGuard(config: DomainGuardConfig) {
  return (message: string) => getDomainGuardResponse(message, config);
}
