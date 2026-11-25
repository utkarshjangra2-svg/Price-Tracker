import { applyBestCoupons } from "./couponOptimizer.js";
import { getImageForCuisine } from "./zomatoSources.js";

const getMealTimeMultiplier = () => {
  const hour = new Date().getHours();

  if ((hour >= 12 && hour <= 14) || (hour >= 19 && hour <= 22)) {
    return 1.12;
  }

  if (hour >= 16 && hour <= 18) {
    return 0.96;
  }

  return 1;
};

const getCuisineAffinity = (restaurantCuisine = "", requestedCuisine = "") => {
  if (!requestedCuisine) {
    return 1;
  }

  return restaurantCuisine.toLowerCase().includes(requestedCuisine.toLowerCase()) ? 0.94 : 1.04;
};

const getDemandScore = (rating = 4, price = 250) => {
  const normalizedRating = Math.min(Math.max(Number(rating) || 4, 1), 5);
  const normalizedPrice = Math.min(Math.max(Number(price) || 250, 100), 1200);

  return 0.55 * (normalizedRating / 5) + 0.45 * (normalizedPrice / 1200);
};

export const optimizePrice = (restaurant, budget, context = {}, liveCoupons = []) => {
  const basePrice = Number(restaurant.basePrice || restaurant.originalPrice || restaurant.price || 250);
  const rating = Number(restaurant.rating || 4);
  const discountHint = Number(restaurant.discount || 0);
  const trendingScore = Number(restaurant.trendingScore || 0);
  const demandScore = getDemandScore(rating, basePrice);
  const timeMultiplier = getMealTimeMultiplier();
  const cuisineMultiplier = getCuisineAffinity(restaurant.cuisine, context.cuisine);
  const predictedPrice = Math.round(basePrice * (1 + demandScore * 0.18) * timeMultiplier * cuisineMultiplier);

  let discount = discountHint;

  if (!discount) {
    if (predictedPrice >= 500) {
      discount = 28;
    } else if (predictedPrice >= 350) {
      discount = 20;
    } else if (predictedPrice >= 220) {
      discount = 14;
    } else {
      discount = 10;
    }
  }

  const finalPrice = Math.round(predictedPrice - (predictedPrice * discount) / 100);

  // Budget check: apply AFTER coupon optimization (computed inline here) so coupon savings count
  // We only hard-reject if the raw finalPrice is already way over budget (>40% over)
  if (budget && finalPrice > Number(budget) * 1.40) {
    return null;
  }

  const confidence = Math.max(62, Math.min(96, Math.round(72 + demandScore * 20 - Math.abs(timeMultiplier - 1) * 10)));

  const couponOptimization = applyBestCoupons(
    {
      restaurant: restaurant.restaurant || restaurant.name,
      dishName: restaurant.dishName || "",
      cuisine: restaurant.cuisine || context.cuisine || "Multiple",
      finalPrice,
      rating
    },
    context.user,
    context,
    liveCoupons
  );

  const sourceLower = String(restaurant.platform || restaurant.source || restaurant.provider || restaurant.orderUrl || "").toLowerCase();
  const platform = sourceLower.includes("swiggy")
    ? "Swiggy"
    : sourceLower.includes("zepto")
      ? "Zepto"
      : "Zomato";

  return {
    restaurant: restaurant.restaurant || restaurant.name,
    res_id: restaurant.res_id || "",
    restaurantId: restaurant.restaurantId || restaurant.res_id || "",
    slug: restaurant.slug || "",
    catalogueId: restaurant.catalogueId || "",
    dishName: restaurant.dishName || context.cuisine || "",
    cuisine: restaurant.cuisine || context.cuisine || "Multiple",
    location: restaurant.location || context.location || "Unknown",
    imageUrl: restaurant.imageUrl || restaurant.cuisineImageUrl || getImageForCuisine(restaurant.dishName || context.cuisine),
    cuisineImageUrl: restaurant.cuisineImageUrl || getImageForCuisine(restaurant.dishName || context.cuisine),
    orderUrl: restaurant.orderUrl || "",
    restaurantUrl: restaurant.restaurantUrl || "",
    eta: restaurant.eta || "",
    offerText: restaurant.offerText || "",
    platform,
    source: restaurant.source || restaurant.provider || "zomato",
    isLive: Boolean(restaurant.isLive),
    isOrderableNow: Boolean(restaurant.isOrderableNow),
    verified: restaurant.verified !== false,
    verificationNote: restaurant.verificationNote || "",
    originalPrice: Math.round(basePrice),
    predictedPrice,
    discount,
    finalPrice,
    rating,
    trendingScore,
    confidence,
    couponAdjustedPrice: couponOptimization.couponAdjustedPrice,
    couponSavings: couponOptimization.couponSavings,
    couponConfidence: couponOptimization.couponConfidence,
    availableCoupons: couponOptimization.availableCoupons,
    bestCouponCombo: couponOptimization.bestCouponCombo,
    userCouponProfile: couponOptimization.userProfile,
    analysis:
      couponOptimization.couponSavings > 0
        ? `${couponOptimization.couponInsight} Estimated checkout drops to Rs${couponOptimization.couponAdjustedPrice}.`
        : finalPrice <= predictedPrice * 0.82
          ? "Strong value deal"
          : "Fair price for current demand"
  };
};

export const summarizeDeals = (deals) => {
  const prices = deals.map((deal) => deal.couponAdjustedPrice || deal.finalPrice);
  const avgPrice = prices.length
    ? Math.round(prices.reduce((sum, value) => sum + value, 0) / prices.length)
    : 0;
  const liveNowCount = deals.filter((deal) => deal.isOrderableNow).length;

  return [
    { label: "Total Deals", value: deals.length },
    { label: "Live Now", value: liveNowCount },
    { label: "Best Price", value: `Rs${prices.length ? Math.min(...prices) : 0}` },
    { label: "Avg Price", value: `Rs${avgPrice}` }
  ];
};
