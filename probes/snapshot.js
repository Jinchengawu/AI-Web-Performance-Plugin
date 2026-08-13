(function initSnapshotProbe(global) {
  const round = (value) => Number.isFinite(value) ? Math.round(value) : null;
  const text = (selector, attribute) => {
    const node = document.querySelector(selector);
    return (attribute ? node?.getAttribute(attribute) : node?.textContent)?.trim() || "";
  };

  function resourceSnapshot() {
    const entries = performance.getEntriesByType("resource");
    const byType = {};
    const origins = {};
    let transferSize = 0;
    let decodedSize = 0;
    let cachedCount = 0;

    for (const entry of entries) {
      const type = entry.initiatorType || "other";
      const bucket = byType[type] || { count: 0, transferSize: 0, decodedSize: 0, duration: 0 };
      bucket.count += 1;
      bucket.transferSize += entry.transferSize || 0;
      bucket.decodedSize += entry.decodedBodySize || 0;
      bucket.duration += entry.duration || 0;
      byType[type] = bucket;
      transferSize += entry.transferSize || 0;
      decodedSize += entry.decodedBodySize || 0;
      if (entry.transferSize === 0 && entry.decodedBodySize > 0) cachedCount += 1;
      try {
        const origin = new URL(entry.name).origin;
        origins[origin] = (origins[origin] || 0) + 1;
      } catch (_) { /* ignore invalid resource URLs */ }
    }

    const normalized = entries.map((entry) => ({
      name: entry.name.split("?")[0].slice(0, 220),
      type: entry.initiatorType || "other",
      duration: round(entry.duration),
      transferSize: entry.transferSize || 0,
      decodedSize: entry.decodedBodySize || 0,
      startTime: round(entry.startTime),
      protocol: entry.nextHopProtocol || null,
      renderBlockingStatus: entry.renderBlockingStatus || null,
    }));

    return {
      count: entries.length,
      transferSize,
      decodedSize,
      compressionRatio: transferSize ? Number((decodedSize / transferSize).toFixed(2)) : null,
      cachedCount,
      thirdPartyOrigins: Object.entries(origins)
        .filter(([origin]) => origin !== location.origin)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([origin, count]) => ({ origin, count })),
      byType,
      slowest: [...normalized].sort((a, b) => b.duration - a.duration).slice(0, 12),
      largest: [...normalized].sort((a, b) => b.transferSize - a.transferSize).slice(0, 12),
    };
  }

  function documentSnapshot() {
    const all = [...document.querySelectorAll("*")];
    const images = [...document.images];
    const scripts = [...document.scripts];
    const links = [...document.querySelectorAll("a[href]")];
    const forms = [...document.forms];
    const controls = [...document.querySelectorAll("input, select, textarea")];
    let maxDepth = 0;
    for (const node of all) {
      let depth = 0;
      let cursor = node;
      while (cursor?.parentElement) { depth += 1; cursor = cursor.parentElement; }
      maxDepth = Math.max(maxDepth, depth);
    }

    return {
      domNodes: all.length,
      maxDomDepth: maxDepth,
      images: images.length,
      imagesWithoutDimensions: images.filter((image) => !image.getAttribute("width") || !image.getAttribute("height")).length,
      imagesWithoutAlt: images.filter((image) => !image.hasAttribute("alt")).length,
      lazyImages: images.filter((image) => image.loading === "lazy").length,
      scripts: scripts.length,
      asyncScripts: scripts.filter((script) => script.async || script.defer || script.type === "module").length,
      inlineScripts: scripts.filter((script) => !script.src && script.textContent.trim()).length,
      stylesheets: document.styleSheets.length,
      links: links.length,
      forms: forms.length,
      unlabeledControls: controls.filter((control) => {
        if (control.type === "hidden") return false;
        return !control.labels?.length && !control.getAttribute("aria-label") && !control.getAttribute("aria-labelledby");
      }).length,
      buttonsWithoutName: [...document.querySelectorAll("button, [role='button']")]
        .filter((button) => !button.textContent.trim() && !button.getAttribute("aria-label") && !button.getAttribute("title")).length,
    };
  }

  function seoSnapshot() {
    const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((heading) => ({
      level: Number(heading.tagName.slice(1)),
      text: heading.textContent.trim().slice(0, 160),
    }));
    const jsonLd = [...document.querySelectorAll("script[type='application/ld+json']")].map((script) => {
      try {
        const value = JSON.parse(script.textContent);
        return { valid: true, type: value["@type"] || value["@graph"]?.[0]?.["@type"] || "unknown" };
      } catch (error) {
        return { valid: false, error: error.message.slice(0, 120) };
      }
    });

    return {
      title: document.title.trim(),
      description: text("meta[name='description']", "content"),
      canonical: text("link[rel='canonical']", "href"),
      robots: text("meta[name='robots']", "content"),
      lang: document.documentElement.lang || "",
      viewport: text("meta[name='viewport']", "content"),
      charset: document.characterSet || "",
      headings,
      h1Count: headings.filter((heading) => heading.level === 1).length,
      openGraph: {
        title: text("meta[property='og:title']", "content"),
        description: text("meta[property='og:description']", "content"),
        image: text("meta[property='og:image']", "content"),
        url: text("meta[property='og:url']", "content"),
      },
      twitterCard: text("meta[name='twitter:card']", "content"),
      hreflangCount: document.querySelectorAll("link[rel='alternate'][hreflang]").length,
      jsonLd,
    };
  }

  function navigationSnapshot() {
    const nav = performance.getEntriesByType("navigation")[0];
    const paints = Object.fromEntries(performance.getEntriesByType("paint").map((entry) => [entry.name, round(entry.startTime)]));
    if (!nav) return { fcp: paints["first-contentful-paint"] ?? null };
    return {
      redirect: round(nav.redirectEnd - nav.redirectStart),
      dns: round(nav.domainLookupEnd - nav.domainLookupStart),
      tcp: round(nav.connectEnd - nav.connectStart),
      tls: nav.secureConnectionStart > 0 ? round(nav.connectEnd - nav.secureConnectionStart) : null,
      request: round(nav.responseStart - nav.requestStart),
      ttfb: round(nav.responseStart - nav.startTime),
      download: round(nav.responseEnd - nav.responseStart),
      domInteractive: round(nav.domInteractive - nav.startTime),
      domContentLoaded: round(nav.domContentLoadedEventEnd - nav.startTime),
      load: round(nav.loadEventEnd - nav.startTime),
      fcp: paints["first-contentful-paint"] ?? null,
      transferSize: nav.transferSize || 0,
      decodedBodySize: nav.decodedBodySize || 0,
      protocol: nav.nextHopProtocol || null,
    };
  }

  global.PerfLensSnapshot = {
    collect() {
      const runtime = global.PerfLensRuntime.snapshot();
      const timing = navigationSnapshot();
      return {
        page: {
          url: location.href,
          title: document.title,
          viewport: `${innerWidth}×${innerHeight}`,
          userAgent: navigator.userAgent,
          measuredAt: new Date().toISOString(),
        },
        timing: { ...timing, lcp: runtime.lcp, cls: runtime.cls, inp: runtime.inp },
        resources: resourceSnapshot(),
        runtime: {
          ...runtime,
          jsHeapSize: performance.memory?.usedJSHeapSize || null,
          jsHeapLimit: performance.memory?.jsHeapSizeLimit || null,
        },
        document: documentSnapshot(),
        seo: seoSnapshot(),
      };
    },
  };
})(globalThis);
