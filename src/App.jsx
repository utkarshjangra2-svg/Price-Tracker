import React, { useEffect, useMemo, useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import {
  FaMoon, FaSun, FaSearch, FaTags, FaStar, FaUser, FaHome, FaInfoCircle,
  FaBolt, FaShieldAlt, FaHeart, FaMapMarkerAlt, FaClock, FaCheckCircle
} from "react-icons/fa";
import "./App.css";
import "./Home.css";
import SignIn from "./SignIn/SignIn";
import ResetPassword from "./SignIn/ResetPassword";
import PriceTrack from "./PriceTrack";
import AboutUs from "./pages/AboutUs";
import Recommendations from "./pages/Recommendations";
import OrderHistory from "./pages/OrderHistory";
import DishFinder from "./pages/DishFinder";
import { buildApiUrl, parseJsonResponse } from "./utils/api";
import { buildAuthHeaders, buildUserQueryParams } from "./utils/userProfile";
import { LocationProvider, useLocationContext } from "./context/LocationContext";
import { CartProvider } from "./context/CartContext";
import LocationPicker from "./components/LocationPicker";
import Cart, { CartTrigger } from "./components/Cart";
import AuthModal from "./components/AuthModal";
import SwiggyAuthModal from "./components/SwiggyAuthModal";
import RestaurantDetail from "./pages/RestaurantDetail";
import Checkout from "./pages/Checkout";

const getTokenExpiry = (token) => {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp ? payload.exp * 1000 : null;
  } catch { return null; }
};

function App() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      const expiry = getTokenExpiry(token);
      if (expiry && Date.now() > expiry) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
      }
    }
  }, []);

  return (
    <CartProvider>
      <LocationProvider>
        <div className={dark ? "app dark" : "app"}>
          <Routes>
            <Route path="/" element={<HomePage dark={dark} setDark={setDark} />} />
            <Route path="/signin" element={<SignIn dark={dark} />} />
            <Route path="/reset/:token" element={<ResetPassword dark={dark} />} />
            <Route path="/PriceTrack" element={<PriceTrack />} />
            <Route path="/about" element={<AboutUs />} />
            <Route path="/recommendations" element={<Recommendations />} />
            <Route path="/history" element={<OrderHistory />} />
            <Route path="/orders" element={<OrderHistory />} />
            <Route path="/orders/:orderId" element={<OrderHistory />} />
            <Route path="/dish-finder" element={<DishFinder />} />
            <Route path="/restaurant/:restaurantId" element={<RestaurantDetail />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/cart" element={<Cart isPage={true} />} />
          </Routes>
          <Cart />
          <AuthModal />
          <SwiggyAuthModal />
        </div>
      </LocationProvider>
    </CartProvider>
  );
}

function HomePage({ dark, setDark }) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const { locationLabel } = useLocationContext();
  const storedUser = localStorage.getItem("user");
  const user = useMemo(() => {
    if (!storedUser) return null;
    try { return JSON.parse(storedUser); } catch { return null; }
  }, [storedUser]);
  const userInitial = user?.name?.trim()?.charAt(0)?.toUpperCase();
  const cityName = (locationLabel || "").split(",")[0].trim() || "your city";

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setMenuOpen(false);
    navigate("/signin");
  };

  // Redesign interactive states
  const [heroIdx, setHeroIdx] = useState(0);
  const [floatingPrice, setFloatingPrice] = useState({ current: 240, old: 320 });
  const [activeToast, setActiveToast] = useState(null);

  const heroDishes = useMemo(() => [
    { name: "Spicy Pepperoni Pizza", img: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80", price: 240, old: 320 },
    { name: "Smoked Cheese Burger", img: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80", price: 149, old: 210 },
    { name: "Hyderabadi Chicken Biryani", img: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80", price: 279, old: 399 }
  ], []);

  const marqueeDishes = useMemo(() => [
    { name: "Truffle Pizza", img: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=150&q=80", price: "₹240", old: "₹320" },
    { name: "Crispy Burger", img: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=150&q=80", price: "₹149", old: "₹210" },
    { name: "Dum Biryani", img: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=150&q=80", price: "₹299", old: "₹450" },
    { name: "Hakka Noodles", img: "https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=150&q=80", price: "₹169", old: "₹250" },
    { name: "Choco Fudge", img: "https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?auto=format&fit=crop&w=150&q=80", price: "₹189", old: "₹320" },
    { name: "Paneer Tacos", img: "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=150&q=80", price: "₹159", old: "₹270" }
  ], []);

  const mockToastAlerts = useMemo(() => [
    { text: "Rahul S. saved ₹120 on Pizza just now!", icon: <FaBolt /> },
    { text: "Amit K. unlocked a 35% discount on Biryani!", icon: <FaTags /> },
    { text: "Sneha M. compared Burger prices & saved ₹70", icon: <FaStar /> },
    { text: "Priyanka R. scored butter chicken 40% cheaper!", icon: <FaClock /> }
  ], []);

  useEffect(() => {
    // 1. Auto-sliding hero dishes
    const heroTimer = setInterval(() => {
      setHeroIdx(prev => (prev + 1) % heroDishes.length);
    }, 4000);

    // 2. Real-time floating price drop calculator
    const priceTimer = setInterval(() => {
      const oldPrice = 280 + Math.floor(Math.random() * 80);
      const discount = 0.25 + Math.random() * 0.2;
      const currentPrice = Math.round(oldPrice * (1 - discount));
      setFloatingPrice({ current: currentPrice, old: oldPrice });
    }, 5000);

    // 3. Real-time activity toast alert
    const toastTimer = setInterval(() => {
      const randomAlert = mockToastAlerts[Math.floor(Math.random() * mockToastAlerts.length)];
      setActiveToast(randomAlert);
      setTimeout(() => setActiveToast(null), 4000);
    }, 12000);

    return () => {
      clearInterval(heroTimer);
      clearInterval(priceTimer);
      clearInterval(toastTimer);
    };
  }, [heroDishes, mockToastAlerts]);

  return (
    <div className="hp-root">

      {/* ═══════════════════ HEADER / NAVBAR ═══════════════════ */}
      <header className="hp-header">
        
        {/* LEFT: brand logo */}
        <div className="hp-brand" onClick={() => navigate("/")}>
          <div className="hp-brand-badge">SD</div>
          <div className="hp-brand-text">
            <span className="hp-brand-name">Smart<span className="hp-brand-orange">Deal</span></span>
            <span className="hp-brand-sub">Price Optimizer</span>
          </div>
        </div>

        {/* CENTER: clean navigation items */}
        <nav className="hp-nav">
          <button className="hp-nav-btn active" onClick={() => navigate("/")}>Home</button>
          <button className="hp-nav-btn" onClick={() => navigate("/recommendations")}>Deals</button>
          <button className="hp-nav-btn" onClick={() => navigate("/PriceTrack")}>Live Prices</button>
          <button className="hp-nav-btn" onClick={() => navigate("/dish-finder")}>Dish Finder</button>
          <button className="hp-nav-btn" onClick={() => navigate("/about")}>About</button>
        </nav>

        {/* RIGHT: actions */}
        <div className="hp-header-actions">
          <div className="hp-location-pill">
            <FaMapMarkerAlt className="hp-loc-icon" />
            <LocationPicker />
          </div>

          <CartTrigger />

          <button className="hp-icon-btn" onClick={() => setDark(!dark)}>
            {dark ? <FaSun className="text-yellow-400" /> : <FaMoon />}
          </button>

          <div style={{ position: "relative" }}>
            {user ? (
              <>
                <button className="hp-avatar" onClick={() => setMenuOpen(!menuOpen)}>
                  {userInitial}
                </button>
                {menuOpen && (
                  <div className="hp-dropdown">
                    <p className="hp-dd-name">{user.name}</p>
                    <button className="hp-dd-item" onClick={() => { setMenuOpen(false); navigate("/history"); }}>
                      Order History
                    </button>
                    <button className="hp-dd-item hp-dd-danger" onClick={handleLogout}>
                      Logout
                    </button>
                  </div>
                )}
              </>
            ) : (
              <button className="hp-avatar" onClick={() => navigate("/signin")}>
                <FaUser />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ═══════════════════ HERO SECTION ═══════════════════ */}
      <section 
        className="hp-hero"
        style={{ backgroundImage: `url(${heroDishes[heroIdx].img})` }}
      >
        {/* Dark overlay for perfect text legibility */}
        <div className="hp-hero-overlay"></div>

        <div className="hp-hero-grid">
          
          {/* LEFT: typography and smart details */}
          <div className="hp-hero-left">
            <div className="hp-badge-pill">
              <FaBolt /> AI PRICE OPTIMIZER
            </div>

            <h1 className="hp-h1">
              Compare food prices instantly.<br />
              Find <span className="hp-h1-orange">smarter deals</span> in real time.<br />
              Save more on every order.
            </h1>

            <div className="hp-hero-sub-list">
              <div className="hp-hero-sub-item">
                <FaCheckCircle className="hp-sub-icon" />
                <span>Track prices across top delivery platforms side-by-side</span>
              </div>
              <div className="hp-hero-sub-item">
                <FaCheckCircle className="hp-sub-icon" />
                <span>Apply hidden coupons automatically for extreme savings</span>
              </div>
              <div className="hp-hero-sub-item">
                <FaCheckCircle className="hp-sub-icon" />
                <span>Locate the absolute lowest net checkout basket instantly</span>
              </div>
            </div>

            <div className="hp-cta-row">
              <button className="hp-cta-primary" onClick={() => navigate("/PriceTrack")}>
                ✨ Start Saving Now &nbsp;→
              </button>
              <button className="hp-cta-outline" onClick={() => navigate("/recommendations")}>
                Explore Top Deals
              </button>
            </div>

            <div className="hp-social-proof">
              <div className="hp-avatars">
                <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=80&q=80" alt="" />
                <img src="https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=80&q=80" alt="" />
                <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=80&q=80" alt="" />
              </div>
              <div>
                <p className="hp-stars-label">⭐ Join <strong>10K+</strong> smart food lovers saving daily</p>
              </div>
            </div>
          </div>

          {/* RIGHT: food visual and glassmorphism cards */}
          <div className="hp-hero-right">
            
            <div className="hp-food-img-wrapper">
              <img 
                className="hp-food-img" 
                src={heroDishes[heroIdx].img} 
                alt={heroDishes[heroIdx].name} 
              />
            </div>

            {/* Pinned Glassmorphism price drop card */}
            <div className="hp-float-card">
              <div className="hp-fc-top">
                <FaBolt className="animate-pulse" /> Live Deal optimization
              </div>
              <p className="hp-fc-dish">{heroDishes[heroIdx].name}</p>
              <div className="hp-fc-prices">
                <span className="hp-fc-current">₹{floatingPrice.current}</span>
                <span className="hp-fc-old">₹{floatingPrice.old}</span>
              </div>
              <span className="hp-fc-badge">Cheapest checkout</span>
            </div>

          </div>

        </div>
      </section>

      {/* ═══════════════════ EXTRA STATS BAR ═══════════════════ */}
      <section className="hp-stats-bar">
        {[
          { icon: <FaHeart />, count: "10K+", label: "Happy food lovers" },
          { icon: <FaHome />, count: "20+", label: "Platforms tracked" },
          { icon: <FaClock />, count: "1 Minute", label: "Live deals update" },
          { icon: <FaBolt />, count: "Smart AI", label: "Price optimization" }
        ].map((item, index) => (
          <div key={index} className="hp-stat-item">
            <div className="hp-stat-icon-box">{item.icon}</div>
            <div className="hp-stat-info">
              <h3>{item.count}</h3>
              <p>{item.label}</p>
            </div>
          </div>
        ))}
      </section>

      {/* ═══════════════════ CONTINUOUS SLIDING FOOD CARDS MARQUEE ═══════════════════ */}
      <section className="hp-carousel-wrapper">
        <div className="hp-carousel-track">
          {[...marqueeDishes, ...marqueeDishes].map((dish, idx) => (
            <div 
              key={idx} 
              className="hp-dish-card"
              onClick={() => navigate("/recommendations")}
            >
              <img src={dish.img} alt={dish.name} className="hp-dish-card-img" />
              <div className="hp-dish-card-info">
                <h4 className="hp-dish-card-name">{dish.name}</h4>
                <div className="hp-dish-card-price-row">
                  <span className="hp-dish-card-price">{dish.price}</span>
                  <span className="hp-dish-card-old-price">{dish.old}</span>
                </div>
                <span className="hp-dish-card-badge">Instant drop</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════ 6 FEATURES SECTION ═══════════════════ */}
      <section className="hp-features-section">
        <div className="hp-section-header">
          <span className="hp-section-tag">ENGINE UTILITIES</span>
          <h2 className="hp-section-title">Why SmartDeal is your best savings tool</h2>
        </div>

        <div className="hp-features-grid">
          {[
            { icon: <FaSearch />, title: "Live Price Tracking", desc: "Monitors platform menu shifts dynamically so you never pay premium spikes." },
            { icon: <FaBolt />, title: "AI Deal Detection", desc: "Instantly scrapes restaurant directories and checkout layers to expose hidden discounts." },
            { icon: <FaStar />, title: "Best Restaurant Offers", desc: "Aggregates exclusive bank, wallet, and brand promotions from leading food merchants." },
            { icon: <FaTags />, title: "Real-Time Discounts", desc: "Computes packaging, delivery rates, and taxes side-by-side for absolute price accuracy." },
            { icon: <FaHome />, title: "Smart Food Comparison", desc: "Analyzes Swiggy, Zomato, and direct brands side-by-side in under a second." },
            { icon: <FaHeart />, title: "Trending Dishes", desc: "Exposes hyper-local items currently ordered with maximum coupon spreads in your zone." }
          ].map((item, idx) => (
            <div key={idx} className="hp-feature-card" onClick={() => navigate("/recommendations")}>
              <div className="hp-fi">{item.icon}</div>
              <h3>{item.title}</h3>
              <p>{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════ FOOTER (Kept mostly same, but cleaner) ═══════════════════ */}
      <footer className="hp-footer">
        <div className="hp-footer-grid">
          
          <div className="hp-footer-brand">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="hp-brand-badge">SD</div>
              <span className="hp-footer-logo-name">Smart<span>Deal</span></span>
            </div>
            <p>Live price intelligence for faster, smarter food ordering. Helping you track and apply best values across multiple platforms in real time.</p>
          </div>

          <div className="hp-footer-col">
            <h4>Navigate</h4>
            <button onClick={() => navigate("/PriceTrack")}>PriceTrack</button>
            <button onClick={() => navigate("/dish-finder")}>Dish Finder</button>
            <button onClick={() => navigate("/about")}>About Us</button>
          </div>

          <div className="hp-footer-col">
            <h4>Account</h4>
            <button onClick={() => navigate("/history")}>Order History</button>
            <button onClick={() => navigate("/signin")}>{user ? "My Account" : "Sign In"}</button>
            <button onClick={() => navigate("/cart")}>Cart</button>
          </div>

          <div className="hp-footer-col">
            <h4>Platform</h4>
            <p className="hp-footer-note">1000+ deals tracked daily across 20+ platforms in real-time. Smart savings computed in under a second.</p>
          </div>

        </div>

        <div className="hp-footer-bottom">
          <p>© 2026 SmartDeal. Built for better, smarter food decisions.</p>
        </div>
      </footer>

      {/* ═══════════════════ REAL-TIME ACTIVITY TOAST POPUP ═══════════════════ */}
      {activeToast && (
        <div className="hp-toast-alert">
          <div className="hp-toast-icon">
            {activeToast.icon}
          </div>
          <div>
            <div className="hp-toast-title">LIVE SAVINGS ENGINE</div>
            <p className="hp-toast-txt">{activeToast.text}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
