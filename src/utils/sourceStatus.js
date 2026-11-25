export const getSourceStatus = (source, diagnostics = null) => {
  if (diagnostics?.mode === "empty" || source === "unavailable") {
    return {
      tone: "danger",
      title: "No live deals found.",
      message: diagnostics?.message || "No verified live deals were found for this search. Make sure the Zomato MCP server is running."
    };
  }

  if (source === "mcp" || source === "mcp-zomato-web" || source === "zomato-native-app") {
    return {
      tone: "success",
      title: "Realtime MCP feed is active.",
      message: "Results are live from the Zomato MCP pipeline."
    };
  }

  if (String(source).toLowerCase().includes("swiggy") || String(source).toLowerCase().includes("zepto") || String(source).toLowerCase().includes("multiple")) {
    return {
      tone: "success",
      title: "Cross-app price comparison active.",
      message: "Live offers are being compared across multiple delivery platforms."
    };
  }

  if (source === "zomato-web") {
    return {
      tone: "info",
      title: "Direct live crawl is active.",
      message: "MCP is unavailable, but the backend is fetching live data directly from Zomato."
    };
  }

  if (source === "blocked" || diagnostics?.code === "EACCES") {
    return {
      tone: "danger",
      title: "Realtime fetch is blocked by the runtime environment.",
      message: "MCP is up, but outbound requests to the live source are being denied."
    };
  }

  return {
    tone: "danger",
    title: "Realtime source is offline.",
    message: "MCP and direct live fetch are currently unavailable."
  };
};
