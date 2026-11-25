const STOP_WORDS = new Set(["and", "&", "food", "foods", "cuisine", "style", "best", "near", "me"]);

const QUERY_ALIASES = new Map([
  ["briyani", "biryani"],
  ["biriyani", "biryani"],
  ["biryiani", "biryani"],
  ["chicken biriyani", "chicken biryani"],
  ["chicken briyani", "chicken biryani"],
  ["mutton biriyani", "mutton biryani"],
  ["paneer tikkaa", "paneer tikka"],
  ["panner tikka", "paneer tikka"],
  ["pannir tikka", "paneer tikka"],
  ["paneer butter masla", "paneer butter masala"],
  ["butter panner", "butter paneer"],
  ["chiken", "chicken"],
  ["chikn", "chicken"],
  ["chickn", "chicken"],
  ["paneerr", "paneer"],
  ["panner", "paneer"],
  ["pannir", "paneer"],
  ["shawarama", "shawarma"],
  ["schawarma", "shawarma"],
  ["manchurain", "manchurian"],
  ["momoss", "momos"],
  ["nudles", "noodles"],
  ["noodls", "noodles"],
  ["choclate", "chocolate"],
  ["chocalate", "chocolate"],
  ["chochlate", "chocolate"],
  ["icecream", "ice cream"],
  ["icecreams", "ice cream"],
  ["choclate icecream", "chocolate ice cream"],
  ["choclate ice cream", "chocolate ice cream"],
  ["chocolate icecream", "chocolate ice cream"],
  ["choclate cake", "chocolate cake"],
  ["chocalate cake", "chocolate cake"],
  ["chochlate cake", "chocolate cake"],
  ["fride rice", "fried rice"],
  ["frid rice", "fried rice"],
  ["burgers", "burger"],
  ["pizzza", "pizza"],
  ["sandwhich", "sandwich"],
  ["sandwitch", "sandwich"],
  ["dosaa", "dosa"],
  ["masala dosa", "masala dosa"],
  ["idlii", "idli"]
]);

const CANONICAL_TERMS = [
  "biryani",
  "chicken biryani",
  "mutton biryani",
  "paneer tikka",
  "paneer butter masala",
  "butter paneer",
  "shawarma",
  "manchurian",
  "momos",
  "noodles",
  "fried rice",
  "burger",
  "pizza",
  "sandwich",
  "dosa",
  "masala dosa",
  "idli",
  "paneer",
  "chicken",
  "rolls",
  "south indian",
  "chinese",
  "fast food",
  "desserts",
  "chocolate",
  "cake",
  "chocolate cake",
  "ice cream",
  "chocolate ice cream",
  "ladoo",
  "sweets",
  "rasgulla",
  "gulab jamun",
  "jalebi"
];

const DISH_TO_CUISINE_MAP = new Map([
  ["halwa", ["mithai", "sweets", "north indian"]],
  ["ladoo", ["mithai", "sweets"]],
  ["rasgulla", ["mithai", "sweets", "bengali"]],
  ["gulab jamun", ["mithai", "sweets"]],
  ["jalebi", ["mithai", "sweets", "street food"]],
  ["chocolate ice cream", ["ice cream", "icecream", "gelato", "sundae", "scoop", "frozen dessert"]],
  ["ice cream", ["ice cream", "icecream", "gelato", "sundae", "scoop", "frozen dessert"]],
  ["chocolate cake", ["cake", "bakery", "pastry", "patisserie"]],
  ["cake", ["cake", "bakery", "desserts", "pastry", "patisserie"]],
  ["chocolate", ["desserts", "bakery", "ice cream", "sweet", "waffle"]],
  ["biryani", ["biryani", "mughlai", "north indian", "hyderabadi", "lucknowi"]],
  ["paneer", ["north indian", "mughlai", "punjabi"]],
  ["pizza", ["pizza", "italian", "fast food"]],
  ["burger", ["burger", "fast food", "american"]],
  ["dosa", ["south indian"]],
  ["idli", ["south indian"]],
  ["chicken", ["north indian", "mughlai", "biryani", "fast food"]],
  ["rolls", ["rolls", "fast food", "street food", "lebanese"]],
  ["shawarma", ["lebanese", "arabian", "middle eastern", "rolls"]],
  ["momos", ["chinese", "tibetan", "asian", "fast food"]],
  ["noodles", ["chinese", "asian", "pan asian"]],
  ["fried rice", ["chinese", "asian"]],
  ["manchurian", ["chinese", "asian"]],
  ["south indian", ["south indian", "kerala", "andhra", "chettinad", "udupi"]],
  ["north indian", ["north indian", "mughlai", "punjabi", "awadhi"]],
  ["chinese", ["chinese", "asian", "pan asian", "tibetan", "thai"]],
  ["italian", ["italian", "pizza", "pasta"]],
  ["fast food", ["fast food", "burger", "street food", "cafe", "snack"]],
  ["desserts", ["desserts", "bakery", "ice cream", "sweet", "mithai", "waffle", "crepe"]],
  ["mithai", ["mithai", "sweet", "sweets", "bengali", "halwai"]],
  ["beverages", ["beverages", "juices", "tea", "coffee", "shakes"]],
  ["street food", ["street food", "chaat", "snack", "fast food"]],
  ["healthy", ["healthy food", "salads", "diet", "vegan"]],
  ["cafe", ["cafe", "coffee", "tea", "fast food", "continental", "italian"]]
]);

export const getRelatedCuisines = (dish = "") => {
  const normalized = dish.toLowerCase().trim();
  for (const [key, cuisines] of DISH_TO_CUISINE_MAP.entries()) {
    if (normalized.includes(key)) return cuisines;
  }
  return [];
};

const normalizeWhitespace = (value = "") => value.toLowerCase().trim().replace(/\s+/g, " ");

export const tokenizeSearchText = (value = "") =>
  normalizeWhitespace(value)
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token && !STOP_WORDS.has(token));

const getEditDistance = (a = "", b = "") => {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let row = 0; row < rows; row += 1) {
    table[row][0] = row;
  }

  for (let col = 0; col < cols; col += 1) {
    table[0][col] = col;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = a[row - 1] === b[col - 1] ? 0 : 1;
      table[row][col] = Math.min(
        table[row - 1][col] + 1,
        table[row][col - 1] + 1,
        table[row - 1][col - 1] + cost
      );

      if (
        row > 1 &&
        col > 1 &&
        a[row - 1] === b[col - 2] &&
        a[row - 2] === b[col - 1]
      ) {
        table[row][col] = Math.min(table[row][col], table[row - 2][col - 2] + 1);
      }
    }
  }

  return table[a.length][b.length];
};

const getAllowedTokenDistance = (token = "") => {
  if (token.length >= 8) return 3;
  if (token.length >= 5) return 2;
  if (token.length >= 4) return 1;
  return 0;
};

const resolveTokenAlias = (token = "") => {
  if (!token) {
    return "";
  }

  if (QUERY_ALIASES.has(token)) {
    return QUERY_ALIASES.get(token);
  }

  let bestMatch = token;
  let bestDistance = Infinity;

  for (const candidate of CANONICAL_TERMS) {
    if (candidate.includes(" ")) {
      continue;
    }

    const distance = getEditDistance(token, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = candidate;
    }
  }

  return bestDistance <= getAllowedTokenDistance(token) ? bestMatch : token;
};

export const resolveDishQuery = (query = "") => {
  const normalizedQuery = normalizeWhitespace(query);

  if (!normalizedQuery) {
    return "";
  }

  if (QUERY_ALIASES.has(normalizedQuery)) {
    return QUERY_ALIASES.get(normalizedQuery);
  }

  const resolvedTokens = tokenizeSearchText(normalizedQuery).map(resolveTokenAlias);
  const resolvedQuery = resolvedTokens.join(" ").trim();

  if (QUERY_ALIASES.has(resolvedQuery)) {
    return QUERY_ALIASES.get(resolvedQuery);
  }

  let bestPhrase = resolvedQuery;
  let bestDistance = Infinity;

  for (const candidate of CANONICAL_TERMS) {
    const distance = getEditDistance(resolvedQuery, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestPhrase = candidate;
    }
  }

  const maxAllowedDistance = resolvedQuery.length >= 12 ? 4 : resolvedQuery.length >= 8 ? 3 : 1;
  return bestDistance <= maxAllowedDistance && resolvedQuery.length >= 5 ? bestPhrase : resolvedQuery;
};

const getFuzzyTokenScore = (token, haystackTokens) => {
  if (haystackTokens.includes(token)) {
    return 1;
  }

  let bestScore = 0;

  for (const candidate of haystackTokens) {
    const distance = getEditDistance(token, candidate);

    if (distance === 1 && token.length >= 4) {
      bestScore = Math.max(bestScore, 0.88);
    } else if (distance === 2 && token.length >= 7) {
      bestScore = Math.max(bestScore, 0.72);
    }
  }

  return bestScore;
};

export const getDishMatchScore = (query = "", restaurant = {}) => {
  const resolvedQuery = resolveDishQuery(query);
  const queryTokens = tokenizeSearchText(resolvedQuery);

  if (!queryTokens.length) {
    return 1;
  }

  const haystackText = normalizeWhitespace(
    `${restaurant.name || ""} ${restaurant.cuisine || ""} ${restaurant.dishName || ""}`
  );
  const haystackTokens = tokenizeSearchText(haystackText);

  if (!haystackTokens.length) {
    return 0;
  }

  const tokenScore =
    queryTokens.reduce((sum, token) => sum + getFuzzyTokenScore(token, haystackTokens), 0) / queryTokens.length;
  const phraseBoost = haystackText.includes(resolvedQuery) ? 0.25 : 0;

  return Math.min(1.2, tokenScore + phraseBoost);
};

const flattenSearchValue = (value = "") => {
  if (!value) {
    return "";
  }

  if (Array.isArray(value)) {
    return value.map(flattenSearchValue).filter(Boolean).join(" ");
  }

  if (typeof value === "object") {
    return Object.values(value).map(flattenSearchValue).filter(Boolean).join(" ");
  }

  return String(value);
};

const getTokenMatchScore = (token = "", haystackTokens = []) => {
  if (!token || !haystackTokens.length) {
    return 0;
  }

  if (haystackTokens.includes(token)) {
    return 1;
  }

  return getFuzzyTokenScore(token, haystackTokens);
};

const hasPhraseOrTokens = (phrase = "", haystackText = "", haystackTokens = []) => {
  const normalizedPhrase = resolveDishQuery(phrase);
  const phraseTokens = tokenizeSearchText(normalizedPhrase);

  if (!phraseTokens.length) {
    return false;
  }

  if (haystackText.includes(normalizedPhrase)) {
    return true;
  }

  return phraseTokens.every((token) => getTokenMatchScore(token, haystackTokens) >= 0.88);
};

export const inferDishIntent = (query = "") => {
  const resolvedQuery = resolveDishQuery(query);
  const queryTokens = tokenizeSearchText(resolvedQuery);
  const relatedTerms = getRelatedCuisines(resolvedQuery);
  const relatedTokenSet = new Set(relatedTerms.flatMap((term) => tokenizeSearchText(term)));
  const distinguishingTokens = queryTokens.filter((token) => !relatedTokenSet.has(token));

  return {
    originalQuery: query,
    resolvedQuery,
    queryTokens,
    relatedTerms,
    distinguishingTokens
  };
};

export const buildRelevanceText = (source = {}) =>
  normalizeWhitespace(
    [
      source.restaurant,
      source.name,
      source.cuisine,
      source.cuisines,
      source.servesCuisine,
      source.dishName,
      source.itemName,
      source.itemSearchText,
      source.category,
      source.categories,
      source.section,
      source.menu,
      source.tags,
      source.description,
      source.desc
    ]
      .map(flattenSearchValue)
      .filter(Boolean)
      .join(" ")
  );

export const scoreDishRelevance = (query = "", source = {}) => {
  const intent = inferDishIntent(query);

  if (!intent.queryTokens.length) {
    return { score: 1, passed: true, intent, reason: "empty-query" };
  }

  const haystackText = buildRelevanceText(source);
  const haystackTokens = tokenizeSearchText(haystackText);

  if (!haystackTokens.length) {
    return { score: 0, passed: false, intent, reason: "empty-source" };
  }

  const tokenScores = intent.queryTokens.map((token) => getTokenMatchScore(token, haystackTokens));
  const tokenScore = tokenScores.reduce((sum, score) => sum + score, 0) / intent.queryTokens.length;
  const phraseMatch = haystackText.includes(intent.resolvedQuery);
  const relatedMatches = intent.relatedTerms.filter((term) => hasPhraseOrTokens(term, haystackText, haystackTokens));
  const relatedScore = intent.relatedTerms.length ? Math.min(1, relatedMatches.length / Math.min(2, intent.relatedTerms.length)) : 0;
  const distinguishingScores = intent.distinguishingTokens.map((token) => getTokenMatchScore(token, haystackTokens));
  const distinguishingScore = distinguishingScores.length
    ? distinguishingScores.reduce((sum, score) => sum + score, 0) / distinguishingScores.length
    : 1;

  const requiresDistinguishingMatch = intent.relatedTerms.length > 0 && intent.distinguishingTokens.length > 0;
  const hasDistinguishingMatch = distinguishingScore >= 0.88;
  const hasCategoryMatch = relatedScore >= 0.5;
  const score = Math.min(
    1.25,
    tokenScore * 0.55 +
      relatedScore * 0.3 +
      distinguishingScore * 0.1 +
      (phraseMatch ? 0.2 : 0)
  );
  const passed = phraseMatch || (
    hasCategoryMatch &&
    (!requiresDistinguishingMatch || hasDistinguishingMatch) &&
    score >= 0.48
  ) || (
    !intent.relatedTerms.length &&
    tokenScore >= (intent.queryTokens.length > 1 ? 0.72 : 0.88)
  );

  return {
    score,
    passed,
    intent,
    reason: passed ? "matched-real-text" : "no-real-text-match",
    tokenScore,
    relatedScore,
    distinguishingScore,
    matchedRelatedTerms: relatedMatches
  };
};
