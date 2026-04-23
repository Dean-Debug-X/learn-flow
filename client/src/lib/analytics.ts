function hasValue(value: string | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

export function initializeAnalytics() {
  if (typeof document === "undefined") return;

  const endpoint = import.meta.env.VITE_ANALYTICS_ENDPOINT;
  const websiteId = import.meta.env.VITE_ANALYTICS_WEBSITE_ID;

  if (!hasValue(endpoint) || !hasValue(websiteId)) {
    return;
  }

  if (document.querySelector('script[data-learnflow-analytics="true"]')) {
    return;
  }

  const script = document.createElement("script");
  script.defer = true;
  script.src = `${endpoint.replace(/\/+$/, "")}/umami`;
  script.dataset.websiteId = websiteId;
  script.dataset.learnflowAnalytics = "true";
  document.body.appendChild(script);
}
