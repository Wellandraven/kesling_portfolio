// Applies the page title and meta description from content.json → "site".

export function renderContent(c) {
  document.title = c.site.title;
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute('content', c.site.description);
}
