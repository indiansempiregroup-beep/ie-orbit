export function externalLinkProps(href: string): { target?: string; rel?: string } {
  if (/^https?:\/\//i.test(href)) {
    return { target: '_blank', rel: 'noopener noreferrer' };
  }
  return {};
}
