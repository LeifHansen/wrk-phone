import { useEffect } from 'react';

// Per-route SEO: sets <title>, <meta name="description">, <link rel="canonical">,
// the OG/Twitter twins, and an optional JSON-LD <script>. Restores the prior
// values on unmount so the next route doesn't inherit stale tags.
//
// Server-side, index.html ships sane defaults so no-JS crawlers still get the
// right signals. Bots that execute JS (Googlebot does) pick up these overrides.
export interface SeoConfig {
  title: string;
  description: string;
  canonical: string;            // absolute URL, e.g. https://wrkphn.com/sms-marketing-app
  ogImage?: string;
  jsonLd?: object | object[];
}

function setOrCreateMeta(selector: string, attr: 'name' | 'property', key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

function setLinkRel(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export function useSeo(cfg: SeoConfig) {
  useEffect(() => {
    const prev = {
      title: document.title,
      desc: document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '',
      ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '',
      ogDesc: document.querySelector('meta[property="og:description"]')?.getAttribute('content') || '',
      ogUrl: document.querySelector('meta[property="og:url"]')?.getAttribute('content') || '',
      ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '',
      twTitle: document.querySelector('meta[name="twitter:title"]')?.getAttribute('content') || '',
      twDesc: document.querySelector('meta[name="twitter:description"]')?.getAttribute('content') || '',
      twImage: document.querySelector('meta[name="twitter:image"]')?.getAttribute('content') || '',
    };
    document.title = cfg.title;
    setOrCreateMeta('meta[name="description"]', 'name', 'description', cfg.description);
    setLinkRel('canonical', cfg.canonical);
    setOrCreateMeta('meta[property="og:title"]', 'property', 'og:title', cfg.title);
    setOrCreateMeta('meta[property="og:description"]', 'property', 'og:description', cfg.description);
    setOrCreateMeta('meta[property="og:url"]', 'property', 'og:url', cfg.canonical);
    if (cfg.ogImage) setOrCreateMeta('meta[property="og:image"]', 'property', 'og:image', cfg.ogImage);
    setOrCreateMeta('meta[name="twitter:title"]', 'name', 'twitter:title', cfg.title);
    setOrCreateMeta('meta[name="twitter:description"]', 'name', 'twitter:description', cfg.description);
    if (cfg.ogImage) setOrCreateMeta('meta[name="twitter:image"]', 'name', 'twitter:image', cfg.ogImage);

    // JSON-LD: a single <script> per route, removed on unmount. Each page
    // emits its own schema (Service / FAQPage / Product) so Google can show
    // rich snippets specific to that landing.
    let jsonScript: HTMLScriptElement | null = null;
    if (cfg.jsonLd) {
      jsonScript = document.createElement('script');
      jsonScript.type = 'application/ld+json';
      jsonScript.setAttribute('data-route', 'true');
      jsonScript.textContent = JSON.stringify(cfg.jsonLd);
      document.head.appendChild(jsonScript);
    }

    return () => {
      document.title = prev.title;
      setOrCreateMeta('meta[name="description"]', 'name', 'description', prev.desc);
      if (prev.canonical) setLinkRel('canonical', prev.canonical);
      setOrCreateMeta('meta[property="og:title"]', 'property', 'og:title', prev.ogTitle);
      setOrCreateMeta('meta[property="og:description"]', 'property', 'og:description', prev.ogDesc);
      setOrCreateMeta('meta[property="og:url"]', 'property', 'og:url', prev.ogUrl);
      if (prev.ogImage) setOrCreateMeta('meta[property="og:image"]', 'property', 'og:image', prev.ogImage);
      setOrCreateMeta('meta[name="twitter:title"]', 'name', 'twitter:title', prev.twTitle);
      setOrCreateMeta('meta[name="twitter:description"]', 'name', 'twitter:description', prev.twDesc);
      if (prev.twImage) setOrCreateMeta('meta[name="twitter:image"]', 'name', 'twitter:image', prev.twImage);
      if (jsonScript) jsonScript.remove();
    };
  }, [cfg.title, cfg.description, cfg.canonical, cfg.ogImage, JSON.stringify(cfg.jsonLd)]);
}
