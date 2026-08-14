(function initSnapshotProbe(global) {
  if (global.PerfLensSnapshot) return;
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
      } catch (_) { /* Ignore invalid resource URLs. */ }
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
      cacheRate: entries.length ? Number((cachedCount / entries.length).toFixed(2)) : null,
      thirdPartyOrigins: Object.entries(origins).filter(([origin]) => origin !== location.origin)
        .sort((a, b) => b[1] - a[1]).slice(0, 12).map(([origin, count]) => ({ origin, count })),
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
    const controls = [...document.querySelectorAll("input, select, textarea")];
    const ids = all.map((node) => node.id).filter(Boolean);
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
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
      emptyLinks: links.filter((link) => !link.textContent.trim() && !link.getAttribute("aria-label") && !link.querySelector("img[alt]")).length,
      targetBlankWithoutNoopener: links.filter((link) => link.target === "_blank" && !String(link.rel).split(/\s+/).includes("noopener")).length,
      forms: document.forms.length,
      unlabeledControls: controls.filter((control) => control.type !== "hidden" && !control.labels?.length && !control.getAttribute("aria-label") && !control.getAttribute("aria-labelledby")).length,
      buttonsWithoutName: [...document.querySelectorAll("button, [role='button']")]
        .filter((button) => !button.textContent.trim() && !button.getAttribute("aria-label") && !button.getAttribute("title")).length,
      iframesWithoutTitle: [...document.querySelectorAll("iframe")].filter((frame) => !frame.title.trim()).length,
      duplicateIds: [...new Set(duplicateIds)].slice(0, 20),
      mainLandmarks: document.querySelectorAll("main, [role='main']").length,
      mixedContentResources: location.protocol === "https:" ? [...document.querySelectorAll("img[src],script[src],link[href],iframe[src]")]
        .filter((node) => /^(src|href)$/.test(node.hasAttribute("src") ? "src" : "href") && /^http:\/\//i.test(node.getAttribute(node.hasAttribute("src") ? "src" : "href") || "")).length : 0,
    };
  }

  function seoSnapshot() {
    const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((heading) => ({
      level: Number(heading.tagName.slice(1)),
      text: heading.textContent.trim().slice(0, 160),
    }));
    const headingSkips = headings.slice(1).filter((heading, index) => heading.level - headings[index].level > 1);
    const jsonLd = [...document.querySelectorAll("script[type='application/ld+json']")].map((script) => {
      try {
        const value = JSON.parse(script.textContent);
        return { valid: true, type: value["@type"] || value["@graph"]?.[0]?.["@type"] || "unknown" };
      } catch (error) {
        return { valid: false, error: error.message.slice(0, 120) };
      }
    });
    const canonical = text("link[rel='canonical']", "href");
    let canonicalValid = false;
    try { canonicalValid = Boolean(canonical && new URL(canonical, location.href)); } catch (_) { /* Invalid canonical. */ }
    const robots = text("meta[name='robots']", "content");
    const description = text("meta[name='description']", "content");
    const openGraph = {
      title: text("meta[property='og:title']", "content"),
      description: text("meta[property='og:description']", "content"),
      image: text("meta[property='og:image']", "content"),
      url: text("meta[property='og:url']", "content"),
    };
    return {
      title: document.title.trim(),
      description,
      canonical,
      canonicalValid,
      robots,
      noindex: /(?:^|[,\s])noindex(?:$|[,\s])/i.test(robots),
      lang: document.documentElement.lang || "",
      viewport: text("meta[name='viewport']", "content"),
      charset: document.characterSet || "",
      headings,
      headingSkipCount: headingSkips.length,
      h1Count: headings.filter((heading) => heading.level === 1).length,
      openGraph,
      openGraphComplete: Boolean(openGraph.title && openGraph.description && openGraph.image),
      twitterCard: text("meta[name='twitter:card']", "content"),
      hreflangCount: document.querySelectorAll("link[rel='alternate'][hreflang]").length,
      metaRefresh: text("meta[http-equiv='refresh']", "content"),
      jsonLd,
    };
  }

  function navigationSnapshot() {
    const nav = performance.getEntriesByType("navigation")[0];
    const paints = Object.fromEntries(performance.getEntriesByType("paint").map((entry) => [entry.name, round(entry.startTime)]));
    if (!nav) return { fcp: paints["first-contentful-paint"] ?? null };
    return {
      redirect: round(nav.redirectEnd - nav.redirectStart), dns: round(nav.domainLookupEnd - nav.domainLookupStart),
      tcp: round(nav.connectEnd - nav.connectStart), tls: nav.secureConnectionStart > 0 ? round(nav.connectEnd - nav.secureConnectionStart) : null,
      request: round(nav.responseStart - nav.requestStart), ttfb: round(nav.responseStart - nav.startTime),
      download: round(nav.responseEnd - nav.responseStart), domInteractive: round(nav.domInteractive - nav.startTime),
      domContentLoaded: round(nav.domContentLoadedEventEnd - nav.startTime), load: round(nav.loadEventEnd - nav.startTime),
      fcp: paints["first-contentful-paint"] ?? null, transferSize: nav.transferSize || 0,
      decodedBodySize: nav.decodedBodySize || 0, protocol: nav.nextHopProtocol || null,
    };
  }

  async function environmentSnapshot() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    let uaData = null;
    try {
      uaData = navigator.userAgentData ? {
        brands: navigator.userAgentData.brands,
        mobile: navigator.userAgentData.mobile,
        platform: navigator.userAgentData.platform,
        ...(await navigator.userAgentData.getHighEntropyValues(["architecture", "bitness", "model", "platformVersion", "uaFullVersion", "fullVersionList", "wow64"])),
      } : null;
    } catch (_) { /* High entropy UA data may be unavailable. */ }
    let originStorage = null;
    try { originStorage = await navigator.storage?.estimate?.() || null; } catch (_) { /* Storage estimate is optional. */ }
    return {
      browser: { userAgent: navigator.userAgent, uaData, language: navigator.language, languages: navigator.languages, cookiesEnabled: navigator.cookieEnabled, doNotTrack: navigator.doNotTrack },
      operatingSystem: { platform: uaData?.platform || navigator.platform || null, platformVersion: uaData?.platformVersion || null, architecture: uaData?.architecture || null, bitness: uaData?.bitness || null, wow64: uaData?.wow64 ?? null },
      device: { hardwareConcurrency: navigator.hardwareConcurrency || null, deviceMemoryGB: navigator.deviceMemory || null, maxTouchPoints: navigator.maxTouchPoints || 0 },
      display: { viewportWidth: innerWidth, viewportHeight: innerHeight, screenWidth: screen.width, screenHeight: screen.height, devicePixelRatio: devicePixelRatio, colorDepth: screen.colorDepth },
      network: { online: navigator.onLine, effectiveType: connection?.effectiveType || null, downlinkMbps: connection?.downlink ?? null, rttMs: connection?.rtt ?? null, saveData: connection?.saveData ?? null, type: connection?.type || null },
      pageContext: { secureContext: global.isSecureContext, crossOriginIsolated: global.crossOriginIsolated, visibilityState: document.visibilityState, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, originStorage },
    };
  }

  global.PerfLensSnapshot = {
    async collect() {
      const [runtime, environment] = await Promise.all([global.PerfLensRuntime.snapshot(), environmentSnapshot()]);
      const timing = navigationSnapshot();
      return {
        page: { url: location.href, title: document.title, viewport: `${innerWidth}×${innerHeight}`, userAgent: navigator.userAgent, measuredAt: new Date().toISOString() },
        environment,
        timing: { ...timing, lcp: runtime.lcp, cls: runtime.cls, inp: runtime.inp },
        resources: resourceSnapshot(),
        runtime: { ...runtime, jsHeapSize: runtime.memory.usedJSHeapSize, jsHeapLimit: runtime.memory.jsHeapSizeLimit },
        document: documentSnapshot(),
        seo: seoSnapshot(),
      };
    },
  };
})(globalThis);
