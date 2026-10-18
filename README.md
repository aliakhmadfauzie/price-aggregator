# E-Commerce Multi-Marketplace Price Comparison & Aggregator Tool

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![React](https://img.shields.io/badge/React-19.0-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Marketplaces](https://img.shields.io/badge/Supported-Tokopedia%20%7C%20Shopee%20%7C%20TikTok%20%7C%20Blibli-FF5722?style=for-the-badge)]()

**Price Aggregator** is a multi-marketplace e-commerce intelligence and price comparison engine designed to track, compare, and aggregate product pricing, stock availability, and promotional discounts across Southeast Asia's major e-commerce platforms (Tokopedia, Shopee, TikTok Shop, Blibli, Lazada).

---

## 🌟 Key Capabilities

### 1. Cross-Marketplace Price Tracking
- **Multi-Platform Search**: Search by product title, SKU, or barcode (EAN/UPC) across multiple marketplaces simultaneously.
- **True Price Comparison**: Calculates final landing price including shipping subsidies, voucher discounts, and cashbacks.
- **Merchant Price Intelligence**: Benchmark competitor pricing to dynamically optimize profit margins.

### 2. Historical Price Charts & Volatility Index
- Track price fluctuation over time (30d / 90d / 1y) to detect fake discounts during promotional campaigns (11.11, 12.12, Payday Sales).

### 3. Price Drop Alerts & Webhook Notifications
- Automated notifications dispatched via Telegram, Discord, or WhatsApp when target threshold prices are reached.

---

## 🏗️ Architecture Overview

```mermaid
graph TD
    User[User / Merchant Analyst] --> UI[Price Aggregator Dashboard]
    UI --> API[Aggregator Core API]
    API --> Scraping[Scraping & Official API Connector]
    Scraping --> Tokopedia[Tokopedia API/Feed]
    Scraping --> Shopee[Shopee API/Feed]
    Scraping --> TikTok[TikTok Shop API]
    Scraping --> Blibli[Blibli API]
    API --> Cache[(Redis Cache & TimescaleDB)]
```

---

## 🚀 Local Setup

```bash
# Clone the repository
git clone https://github.com/aliakhmadfauzie/price-aggregator.git
cd price-aggregator

# Install dependencies
npm install

# Start development server
npm run dev
```

---

## 📄 License
Developed by **Ali Akhmad Fauzie** ([@aliakhmadfauzie](https://github.com/aliakhmadfauzie)). MIT License.
