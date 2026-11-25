import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../App.css';

export default function AboutUs() {
  const navigate = useNavigate();

  return (
    <div className="app">
      <header className="header">
        <div className="brand-lockup cursor-pointer" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <span className="brand-badge">SD</span>
          <div>
            <h1 className="logo">SmartDeal</h1>
            <p className="brand-subtitle">Food deals, live and simple</p>
          </div>
        </div>
        <nav className="header-nav">
          <button onClick={() => navigate("/")}>Home</button>
          <button onClick={() => navigate("/recommendations")}>Deals</button>
          <button onClick={() => navigate("/PriceTrack")}>Live Prices</button>
          <button onClick={() => navigate("/dish-finder")}>Dish Finder</button>
          <button className="active-nav">About</button>
        </nav>
      </header>

      <section className="about-hero" style={{ padding: '72px 24px', maxWidth: '1000px', margin: '0 auto', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px', background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '20px' }}>
          ABOUT SMARTDEAL
        </div>
        <h1 style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 800, marginBottom: '20px', letterSpacing: '-0.02em', color: 'var(--text)' }}>
          The Engine Behind the <span style={{ color: 'var(--primary)' }}>Smartest Prices</span>.
        </h1>
        <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', lineHeight: 1.65, maxWidth: '720px', margin: '0 auto 48px auto' }}>
          Food delivery pricing is opaque, scattered, and constantly shifting. SmartDeal was built as an algorithmic intelligence layer to tear down the complexity and deliver raw, un-inflated, and beautifully ranked data straight to your fingertips.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '24px', textAlign: 'left' }}>
          <div style={{ padding: '28px', background: 'var(--surface)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '12px', color: 'var(--primary)' }}>Machine Learning</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: 1.6, margin: 0 }}>
              Our models don't just find discounts; they predict the true market value of an item and flag when a "deal" is just an inflated menu price.
            </p>
          </div>
          <div style={{ padding: '28px', background: 'var(--surface)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '12px', color: 'var(--warning)' }}>Live Coupon Stacking</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: 1.6, margin: 0 }}>
              We simulate hundreds of coupon permutations against your cart before you ever click order, ensuring you get the absolute lowest checkout value.
            </p>
          </div>
          <div style={{ padding: '28px', background: 'var(--surface)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '12px', color: 'var(--success)' }}>Realtime Market Sync</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: 1.6, margin: 0 }}>
              By hooking directly into dynamic MCP streams, our local radar ensures the deal you click is the deal you get. No stale caches. No guessing.
            </p>
          </div>
        </div>

        <button 
          onClick={() => navigate('/PriceTrack')}
          style={{ marginTop: '48px', background: 'var(--primary)', color: 'white', border: 'none', padding: '14px 32px', borderRadius: 'var(--radius-full)', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(234, 88, 12, 0.25)', transition: 'all 0.2s' }}
        >
          Explore Live Intelligence &nbsp;→
        </button>
      </section>
    </div>
  );
}
