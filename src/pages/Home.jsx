import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaSearch, FaTags, FaStar, FaUser, FaMapMarkerAlt, FaMoon, FaSun,
  FaBolt, FaShieldAlt, FaHeart, FaClock, FaCheckCircle, FaChevronRight,
  FaPaperPlane, FaQuoteLeft, FaShoppingBag, FaBell, FaInfoCircle, FaPercent,
  FaSmile, FaUtensils, FaChartLine
} from "react-icons/fa";
import { useLocationContext } from "../context/LocationContext";
import LocationPicker from "../components/LocationPicker";
import { CartTrigger } from "../components/Cart";

// Premium high-quality food assets for the continuous slider
const DISH_ASSETS = [
  { name: "Truffle Mushroom Pizza", image: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=400&q=80", price: "₹249", oldPrice: "₹499", discount: "50% OFF", platform: "Zomato" },
  { name: "Avocado Smoked Burger", image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80", price: "₹169", oldPrice: "₹299", discount: "43% OFF", platform: "Swiggy" },
  { name: "Hyderabadi Chicken Biryani", image: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=400&q=80", price: "₹289", oldPrice: "₹450", discount: "35% OFF", platform: "Zomato" },
  { name: "Schezwan Hakka Noodles", image: "https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=400&q=80", price: "₹149", oldPrice: "₹249", discount: "40% OFF", platform: "Swiggy" },
  { name: "Premium Chocolate Fudge", image: "https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?auto=format&fit=crop&w=400&q=80", price: "₹189", oldPrice: "₹320", discount: "41% OFF", platform: "Zomato" },
  { name: "Crispy Paneer Tacos", image: "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=400&q=80", price: "₹159", oldPrice: "₹270", discount: "41% OFF", platform: "Swiggy" },
];

const CATEGORIES = [
  { name: "Pizza", icon: "🍕", count: "120+ Deals", query: "pizza" },
  { name: "Burgers", icon: "🍔", count: "85+ Deals", query: "burger wrap sandwich" },
  { name: "Biryani", icon: "🍛", count: "140+ Deals", query: "biryani rice pulao" },
  { name: "Chinese", icon: "🥡", count: "95+ Deals", query: "chinese noodles manchurian momos" },
  { name: "Desserts", icon: "🍰", count: "110+ Deals", query: "ice cream cake brownie dessert waffle" },
  { name: "Healthy Food", icon: "🥗", count: "65+ Deals", query: "healthy salad acai oats" },
  { name: "Drinks", icon: "🥤", count: "50+ Deals", query: "drinks beverage coffee shake juice" },
  { name: "Street Food", icon: "🍟", count: "75+ Deals", query: "chaat samosa kachori pav bhaji street food" }
];

const MOCK_SAVINGS_TOASTS = [
  { name: "Rahul S. from Delhi", action: "saved ₹140 on a Cheese Burst Pizza", time: "Just now" },
  { name: "Aishwarya M. from Mumbai", action: "unlocked a hidden 50% coupon on Biryani", time: "1m ago" },
  { name: "Kiran R. from Bangalore", action: "got Butter Chicken 30% cheaper via Swiggy", time: "2m ago" },
  { name: "Suresh P. from Hyderabad", action: "saved packaging fees using AI Optimizer", time: "3m ago" },
];

export default function Home({ dark, setDark }) {
  const navigate = useNavigate();
  const { locationLabel } = useLocationContext();
  const [activeTab, setActiveTab] = useState("Home");
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [toastNotification, setToastNotification] = useState(null);
  
  // Real-time states
  const [heroIndex, setHeroIndex] = useState(0);
  const [floatingPrice, setFloatingPrice] = useState({ current: 240, old: 320 });
  const [stats, setStats] = useState({ users: "100K+", deals: "50K+", restaurants: "500+", updates: "24/7" });

  const storedUser = localStorage.getItem("user");
  const user = useMemo(() => {
    if (!storedUser) return null;
    try { return JSON.parse(storedUser); } catch { return null; }
  }, [storedUser]);
  const userInitial = user?.name?.trim()?.charAt(0)?.toUpperCase();

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUserDropdownOpen(false);
    navigate("/signin");
  };

  useEffect(() => {
    // 1. Continuous sliding hero dishes
    const heroTimer = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % DISH_ASSETS.length);
    }, 3000);

    // 2. Real-time floating price drops
    const priceTimer = setInterval(() => {
      const oldPrice = 300 + Math.floor(Math.random() * 80);
      const discount = 0.25 + Math.random() * 0.2;
      const currentPrice = Math.round(oldPrice * (1 - discount));
      setFloatingPrice({ current: currentPrice, old: oldPrice });
    }, 4500);

    // 3. Real-time deal toast alerts
    const toastTimer = setInterval(() => {
      const randomIdx = Math.floor(Math.random() * MOCK_SAVINGS_TOASTS.length);
      setToastNotification(MOCK_SAVINGS_TOASTS[randomIdx]);
      setTimeout(() => setToastNotification(null), 4000);
    }, 12000);

    // 4. Subtle Stats ticker fluctuations
    const statsTimer = setInterval(() => {
      const baseNum = 100 + Math.floor(Math.random() * 5);
      setStats((prev) => ({
        ...prev,
        users: `${baseNum}K+`
      }));
    }, 8000);

    return () => {
      clearInterval(heroTimer);
      clearInterval(priceTimer);
      clearInterval(toastTimer);
      clearInterval(statsTimer);
    };
  }, []);

  const handleScrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="hp-root">

      {/* ═══════════════════ HEADER (Sticky Navbar) ═══════════════════ */}
      <header className="hp-header">
        
        {/* LEFT: brand logo */}
        <div className="hp-brand" onClick={() => navigate("/")}>
          <div className="hp-brand-badge">SF</div>
          <div className="hp-brand-text">
            <span className="hp-brand-name">Smart<span className="hp-brand-orange">Food</span></span>
            <span className="hp-brand-sub">Price Optimizer</span>
          </div>
        </div>

        {/* CENTER: clean navigation items */}
        <nav className="hp-nav">
          {[
            { name: "Home", action: () => navigate("/") },
            { name: "Live Deals", action: () => navigate("/recommendations") },
            { name: "Top Picks", action: () => handleScrollToSection("top-picks") },
            { name: "Categories", action: () => handleScrollToSection("categories") },
            { name: "About", action: () => navigate("/about") },
            { name: "Contact", action: () => handleScrollToSection("footer") }
          ].map((item) => (
            <button
              key={item.name}
              className={`hp-nav-item ${activeTab === item.name ? "active" : ""}`}
              onClick={() => {
                setActiveTab(item.name);
                item.action();
              }}
            >
              {item.name}
            </button>
          ))}
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
                <button className="hp-avatar" onClick={() => setUserDropdownOpen(!userDropdownOpen)}>
                  {userInitial}
                </button>
                {userDropdownOpen && (
                  <div className="hp-dropdown">
                    <p className="hp-dd-name">{user.name}</p>
                    <p className="hp-dd-email">{user.email}</p>
                    <button className="hp-dd-item" onClick={() => { setUserDropdownOpen(false); navigate("/history"); }}>
                      <FaShoppingBag className="text-orange" /> Order History
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

      {/* ═══════════════════ HERO SECTION (Original Layout compliant) ═══════════════════ */}
      <section className="hp-hero">
        
        {/* LEFT COLUMN */}
        <div className="hp-hero-left">
          <div className="hp-badge-pill">
            <FaBolt style={{ fontSize: 11 }} /> AI PRICE OPTIMIZER
          </div>

          <h1 className="hp-h1">
            Smarter Food Deals.<br />
            <span className="hp-brand-orange">Better Prices.</span><br />
            Instantly.
          </h1>

          <p className="hp-hero-sub">
            Compare food prices across platforms, discover hidden discounts, and save money in real time. We automatically locate and apply the absolute lowest checkouts.
          </p>

          <div className="hp-cta-row">
            <button className="hp-cta-primary" onClick={() => navigate("/recommendations")}>
              Explore Deals &nbsp;→
            </button>
            <button className="hp-cta-outline" onClick={() => navigate("/PriceTrack")}>
              Live Price Tracking
            </button>
            
            {/* Real-time live pulse activity */}
            <div className="hp-live-indicator">
              <span className="hp-live-dot"></span>
              <span>1,842 users optimizing live</span>
            </div>
          </div>

          <div className="hp-social-proof">
            <div className="hp-avatars">
              <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=80&q=80" alt="" />
              <img src="https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=80&q=80" alt="" />
              <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=80&q=80" alt="" />
            </div>
            <div>
              <p className="hp-stars-label">⭐ Loved by <strong>10K+</strong> smart food shoppers</p>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Center image with warm glow background */}
        <div className="hp-hero-right">
          
          {/* Continuous sliding hero dish with smooth transitions */}
          <div className="hp-food-container">
            <img 
              className="hp-food-img" 
              src={DISH_ASSETS[heroIndex].image} 
              alt={DISH_ASSETS[heroIndex].name} 
            />
          </div>

          {/* Floating Price drop card (updates in real-time) */}
          <div className="hp-float-card">
             <div className="hp-fc-top">
               <FaBolt className="animate-pulse" /> Price Drop Detected
             </div>
             <p style={{ fontSize: '11px', fontWeight: 'bold', margin: '4px 0 0', color: 'var(--text-muted)' }}>
               {DISH_ASSETS[heroIndex].name}
             </p>
             <div className="hp-fc-prices">
               <span className="hp-fc-current">₹{floatingPrice.current}</span>
               <span className="hp-fc-old">₹{floatingPrice.old}</span>
             </div>
             <div className="hp-fc-badge">Live Deal</div>
          </div>

          {/* Stats strip pinned to the bottom of the right column */}
          <div className="hp-stats-strip">
            <div className="hp-stat-chip">
              <div className="hp-stat-icon orange"><FaUser /></div>
              <div>
                <strong>{stats.users}</strong>
                <p>Happy Users</p>
              </div>
            </div>

            <div className="hp-stat-chip">
              <div className="hp-stat-icon green"><FaTags /></div>
              <div>
                <strong>{stats.deals}</strong>
                <p>Deals Tracked</p>
              </div>
            </div>

            <div className="hp-stat-chip">
              <div className="hp-stat-icon blue"><FaUtensils /></div>
              <div>
                <strong>{stats.restaurants}</strong>
                <p>Restaurants</p>
              </div>
            </div>

            <div className="hp-stat-chip">
              <div className="hp-stat-icon purple"><FaClock /></div>
              <div>
                <strong>{stats.updates}</strong>
                <p>Live Updates</p>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ═══════════════════ INFINITE SLIDING FOOD CAROUSEL ═══════════════════ */}
      <section className="hp-carousel-section">
        <div style={{ maxWidth: '1200px', margin: '0 auto 20px', padding: '0 24px', textAlign: 'left' }}>
          <span className="hp-section-tag">POPULAR OPTIMIZED DEALS</span>
          <h2 style={{ fontSize: '24px', fontWeight: '800', margin: '4px 0 0' }}>Trending Price Drops Today</h2>
        </div>

        <div style={{ overflow: 'hidden', width: '100%' }}>
          <div className="hp-carousel-container">
            {/* Render items twice for a seamless infinite horizontal loop */}
            {[...DISH_ASSETS, ...DISH_ASSETS].map((dish, index) => (
              <div 
                key={index}
                className="hp-deal-card"
                onClick={() => navigate("/recommendations")}
              >
                <div className="hp-card-image-wrapper">
                  <img src={dish.image} alt={dish.name} />
                  <span className="hp-card-badge">{dish.discount}</span>
                  <span className="hp-card-platform">{dish.platform} Best Price</span>
                </div>
                <h4>{dish.name}</h4>
                <div className="hp-card-prices">
                  <span className="hp-card-current">{dish.price}</span>
                  <span className="hp-card-old">{dish.oldPrice}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════ SCROLL SECTION: AI PRICE OPTIMIZER ═══════════════════ */}
      <section id="ai-optimizer" className="hp-info-section" style={{ borderTop: '1px solid var(--border-color)' }}>
        <div className="hp-section-header">
          <span className="hp-section-tag">CORE TECHNOLOGY</span>
          <h2 className="hp-section-title">AI Price Optimizer Engine</h2>
        </div>

        <div className="hp-grid-3">
          {[
            {
              icon: <FaSearch />,
              title: "AI Tracks Prices 24/7",
              desc: "Constantly scans menus across food delivery services to index price adjustments immediately."
            },
            {
              icon: <FaTags />,
              title: "Detects Hidden Coupons",
              desc: "Simulates checkout streams to find unadvertised restaurant and bank-tier voucher savings."
            },
            {
              icon: <FaBolt />,
              title: "Compares Platforms Instantly",
              desc: "Calculates delivery taxes and packaging add-ons side-by-side to deliver exact net comparatives."
            },
            {
              icon: <FaCheckCircle />,
              title: "Suggests Cheapest Path",
              desc: "Directs you automatically to the delivery app that yields the lowest checkout cart basket value."
            },
            {
              icon: <FaChartLine />,
              title: "Predicts Massive Drops",
              desc: "Monitors platform trends to notify you exactly when price reductions are about to drop."
            },
            {
              icon: <FaShieldAlt />,
              title: "Verified Secure Outlets",
              desc: "Safeguards ordering paths so you only dine from standard, hygiene-vetted kitchens."
            }
          ].map((card, idx) => (
            <div key={idx} className="hp-info-card">
              <div className="hp-info-icon-box">{card.icon}</div>
              <h3>{card.title}</h3>
              <p>{card.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════ SCROLL SECTION: LIVE OFFERS COMPARISONS ═══════════════════ */}
      <section className="hp-info-section" style={{ borderTop: '1px solid var(--border-color)', backgroundColor: 'rgba(0,0,0,0.01)' }}>
        <div className="hp-section-header">
          <span className="hp-section-tag">REAL-TIME COMPARISON BARS</span>
          <h2 className="hp-section-title">Live side-by-side checkout values</h2>
        </div>

        <div className="hp-comparison-grid">
          {[
            {
              dish: "Double Cheese Margherita Pizza",
              restaurant: "Domino's Pizza",
              zomPrice: "₹249",
              swPrice: "₹349",
              zomCoupon: "DOM50 (Applied)",
              swCoupon: "SWIGGY30 (Applied)",
              savings: "Save ₹100 on Zomato",
              winner: "Zomato"
            },
            {
              dish: "Crispy Double Patty Burger Combo",
              restaurant: "Burger King Express",
              zomPrice: "₹189",
              swPrice: "₹139",
              zomCoupon: "ZOMATO30",
              swCoupon: "BKSAVE (Applied)",
              savings: "Save ₹50 on Swiggy",
              winner: "Swiggy"
            },
            {
              dish: "Mutton Dum Biryani Special",
              restaurant: "Paradise Dine-in",
              zomPrice: "₹399",
              swPrice: "₹450",
              zomCoupon: "BIRYANIFEST (Applied)",
              swCoupon: "NOCOUPON",
              savings: "Save ₹51 on Zomato",
              winner: "Zomato"
            },
            {
              dish: "Schezwan Hakka Noodles Combo",
              restaurant: "Chinatown Special",
              zomPrice: "₹299",
              swPrice: "₹219",
              zomCoupon: "ZOMATOWOW",
              swCoupon: "CHINASAVE (Applied)",
              savings: "Save ₹80 on Swiggy",
              winner: "Swiggy"
            }
          ].map((offer, idx) => (
            <div key={idx} className="hp-comp-card">
              <div className={`hp-comp-winner-pill ${offer.winner === 'Swiggy' ? 'swiggy' : ''}`}>
                🏆 {offer.winner} Win
              </div>
              <p className="hp-comp-res">{offer.restaurant}</p>
              <h3 className="hp-comp-dish">{offer.dish}</h3>
              
              <div className="hp-comp-split">
                <div className={`hp-comp-column ${offer.winner === 'Zomato' ? 'active' : ''}`}>
                  <span className="hp-comp-platform-name">Zomato Price</span>
                  <span className={`hp-comp-price ${offer.winner === 'Zomato' ? 'highlight' : ''}`}>{offer.zomPrice}</span>
                  <span className="hp-comp-coupon">{offer.zomCoupon}</span>
                </div>
                <div className={`hp-comp-column ${offer.winner === 'Swiggy' ? 'active' : ''}`}>
                  <span className="hp-comp-platform-name">Swiggy Price</span>
                  <span className={`hp-comp-price ${offer.winner === 'Swiggy' ? 'highlight' : ''}`}>{offer.swPrice}</span>
                  <span className="hp-comp-coupon">{offer.swCoupon}</span>
                </div>
              </div>

              <div className="hp-comp-savings">
                <FaCheckCircle /> {offer.savings} detected instantly by Optimizer!
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════ SCROLL SECTION: CATEGORIES ═══════════════════ */}
      <section id="categories" className="hp-info-section" style={{ borderTop: '1px solid var(--border-color)' }}>
        <div className="hp-section-header">
          <span className="hp-section-tag">POPULAR CUISINES</span>
          <h2 className="hp-section-title">Explore Smart Offers</h2>
        </div>

        <div className="hp-cat-grid">
          {CATEGORIES.map((cat, idx) => (
            <div 
              key={idx}
              className="hp-cat-card"
              onClick={() => navigate(`/recommendations?cat=${cat.query}`)}
            >
              <span className="hp-cat-icon">{cat.icon}</span>
              <span className="hp-cat-name">{cat.name}</span>
              <span className="hp-cat-count">{cat.count}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════ SCROLL SECTION: TOP PICKS ═══════════════════ */}
      <section id="top-picks" className="hp-info-section" style={{ borderTop: '1px solid var(--border-color)', backgroundColor: 'rgba(0,0,0,0.01)' }}>
        <div className="hp-section-header">
          <span className="hp-section-tag">Smart Picks</span>
          <h2 className="hp-section-title">Smart recommendations today</h2>
        </div>

        <div className="hp-grid-3" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {[
            { title: "Popular Dishes", desc: "Top-ordered food with maximum verified price spread.", icon: "🔥", query: "pizza burger wrap" },
            { title: "Most Ordered", desc: "Fast-moving items currently trending with low price guarantees.", icon: "🍽️", query: "biryani rice" },
            { title: "Best Under Budget", desc: "Premium optimized options compiled under ₹150.", icon: "💰", query: "street food rolls momos" },
            { title: "Healthy Picks", desc: "Acai bowls and clean proteins matched for price-to-nutrition ratio.", icon: "🥗", query: "healthy salad drinks" }
          ].map((item, idx) => (
            <div 
              key={idx} 
              className="hp-info-card text-center" 
              onClick={() => navigate(`/recommendations?cat=${item.query}`)}
              style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyBetween: 'space-between' }}
            >
              <div>
                <span style={{ fontSize: '32px', display: 'block', marginBottom: '16px' }}>{item.icon}</span>
                <h3 style={{ fontSize: '16px', fontWeight: '800' }}>{item.title}</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.6' }}>{item.desc}</p>
              </div>
              <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--primary-orange)', display: 'block', marginTop: '24px' }}>
                Explore Deals &nbsp;→
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════ FEATURE CARDS (4 columns kept same) ═══════════════════ */}
      <section className="hp-features">
        {[
          { icon: <FaTags />, cls: "orange", title: "Best Prices", desc: "Compare prices across top food apps side-by-side." },
          { icon: <FaBolt />, cls: "green", title: "Real-Time Updates", desc: "Menu price drops and vouchers tracked dynamically." },
          { icon: <FaShieldAlt />, cls: "orange", title: "Trusted Outlets", desc: "Only ordering paths from hygiene verified brands." },
          { icon: <FaHeart />, cls: "green", title: "Loved by Many", desc: "Join thousands of smart foodies ordering daily." },
        ].map((f, idx) => (
          <div className="hp-feature-card" key={idx} onClick={() => navigate("/recommendations")}>
            <div className={`hp-fi ${f.cls}`}>{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
            <div className={`hp-fbar ${f.cls}`} />
          </div>
        ))}
      </section>

      {/* ═══════════════════ SCROLL SECTION: TESTIMONIALS ═══════════════════ */}
      <section className="hp-info-section" style={{ borderTop: '1px solid var(--border-color)' }}>
        <div className="hp-section-header">
          <span className="hp-section-tag">TESTIMONIALS</span>
          <h2 className="hp-section-title">Loved by smart diners</h2>
        </div>

        <div className="hp-testimonial-grid">
          {[
            {
              quote: "Checking multiple food apps to compare prices was exhausting. This site handles checking cart additions, coupons, and packaging values instantly. Absolute timesaver!",
              name: "Rahul Sharma",
              role: "Software Developer, Delhi",
              img: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=120&q=80"
            },
            {
              quote: "The price optimization tool saved me over ₹600 in my first week! It found an unadvertised card discount that Zomato didn't display on their home banner. Phenomenal AI utility.",
              name: "Priyanka Patel",
              role: "Creative Analyst, Mumbai",
              img: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80"
            },
            {
              quote: "As a hostel student living on a monthly budget, this platform is a blessing. It helps me choose exactly which app has the lowest delivery price for my late night dinners.",
              name: "Amit Sen",
              role: "Graduate Student, Bangalore",
              img: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=120&q=80"
            }
          ].map((t, idx) => (
            <div key={idx} className="hp-testimonial-card">
              <FaQuoteLeft style={{ fontSize: '24px', color: 'rgba(255, 107, 53, 0.15)', marginBottom: '16px', display: 'block' }} />
              <p className="hp-test-quote">"{t.quote}"</p>
              <div className="hp-test-user">
                <img src={t.img} alt={t.name} className="hp-test-avatar" />
                <div className="hp-test-info">
                  <h4>{t.name}</h4>
                  <p>{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════ CLEAN IMPROVED FOOTER ═══════════════════ */}
      <footer id="footer" className="hp-footer">
        <div className="hp-footer-grid">
          
          <div className="hp-footer-brand">
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <div className="hp-brand-badge">SF</div>
              <span className="hp-footer-logo-name">Smart Food <span>Optimizer</span></span>
            </div>
            <p>Transforming food delivery calculations through real-time pricing intelligence and multi-platform voucher optimization.</p>
          </div>

          <div className="hp-footer-col">
            <h4>NAVIGATE</h4>
            <button onClick={() => navigate("/")}>Home</button>
            <button onClick={() => navigate("/recommendations")}>Live Deals</button>
            <button onClick={() => handleScrollToSection("categories")}>Categories</button>
            <button onClick={() => navigate("/about")}>About Us</button>
          </div>

          <div className="hp-footer-col">
            <h4>LEGAL</h4>
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
            <a href="#">Help Center</a>
            <a href="#">Contact Us</a>
          </div>

          <div className="hp-footer-col">
            <h4>NEWSLETTER</h4>
            <div className="hp-subscribe-box">
              <p style={{ fontSize: '12px', color: '#64748b', margin: '0' }}>Get price drop alerts instantly in your area.</p>
              <form 
                onSubmit={(e) => { e.preventDefault(); alert("Subscribed successfully!"); }}
                className="hp-subscribe-form"
              >
                <input type="email" placeholder="Enter email address" required />
                <button type="submit">
                  <FaPaperPlane style={{ fontSize: '12px' }} />
                </button>
              </form>
            </div>
          </div>

        </div>

        <div className="hp-footer-bottom">
          <p>© 2026 Smart Food Price Optimizer. All rights reserved. Designed for smarter food ordering.</p>
        </div>
      </footer>

      {/* ═══════════════════ REAL-TIME DEAL ALERT TOAST POPUP ═══════════════════ */}
      {toastNotification && (
        <div className="hp-toast">
          <div className="hp-toast-icon">
            <FaPercent />
          </div>
          <div className="hp-toast-body">
            <div className="hp-toast-title">LIVE OPTIMIZATION ALERT</div>
            <h5 className="hp-toast-user">{toastNotification.name}</h5>
            <p className="hp-toast-action">{toastNotification.action}</p>
          </div>
          <span className="hp-toast-time">{toastNotification.time}</span>
        </div>
      )}

    </div>
  );
}
