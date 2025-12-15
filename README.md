# stocky-ahh 📈 🚀

**stocky-ahh** is a modern, interactive Stock Trend Analyzer and Currency Converter application built with Next.js 16. It helps you figure out if you're going to the moon 🌕 or if you're holding the bag 🎒.

*Stocks only go up, right?* (Disclaimer: They don't.)

![Project Banner](public/window.svg)

## ✨ Features (The Good Stuff)

*   **Stonk Analysis**: Visualize price movements with charts that look professional enough to impress your friends. 📉📈
*   **Trend Indicators**: Instant vibes check on the market. Bullish? Bearish? Or just crickets? 🐂🐻
*   **Market Overview**: Watch the global economy do its thing while you sip coffee.
*   **Tendies Converter**: Seamlessly convert your USD gains to THB. (Currency Converter). 💰
*   **Watchlist**: Keep an eye on your favorite tickers (and cry when you miss the dip).
*   **AI Insights**: Robot powered analysis to tell you what's happening (because we sure don't know). 🤖

## 🛠️ Tech Stack (How we built this beast)

*   **Framework**: [Next.js 16](https://nextjs.org/) (The bleeding edge, baby)
*   **Language**: [TypeScript](https://www.typescriptlang.org/) (Because we hate runtime errors)
*   **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) (Make it pretty, fast)
*   **Animation**: [Framer Motion](https://www.framer.com/motion/) (Smooth operator)
*   **Icons**: [Lucide React](https://lucide.dev/)
*   **UI Components**: [Radix UI](https://www.radix-ui.com/)

## 🚀 Getting Started

Follow these steps to get the project running before the market closes.

### Prerequisites

*   Node.js 18+ installed (You know the drill)
*   npm or yarn package manager

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/lynchzdev/stockify-clone.git
    cd stockify-clone
    ```

2.  **Install dependencies** (This might take a while, go touch some grass)
    ```bash
    npm install
    # or
    yarn install
    ```

3.  **Run the development server**
    ```bash
    npm run dev
    # or
    yarn dev
    ```

4.  **Open the application**
    Open [http://localhost:3000](http://localhost:3000) and witness greatness.

## 📂 Project Structure

```
stockify-clone/
├── src/
│   ├── app/                 # Next.js App Router (The brain)
│   │   ├── api/             # Backend API endpoints (Where the magic happens)
│   │   └── page.tsx         # Main entry point
│   ├── components/
│   │   ├── features/        # The heavy lifters (Charts, Converters)
│   │   └── ui/              # The pretty things (Buttons, Cards)
│   ├── hooks/               # Custom hooks (Because DRY)
│   └── lib/                 # Types & Utils (The boring but necessary stuff)
├── public/                  # Assets
└── ...config files          # Don't touch these unless you know what you're doing
```

## 🔌 API Endpoints

The application includes several internal API routes:

*   `GET /api/stock/[symbol]`: Get the deets on a specific stock.
*   `GET /api/exchange`: How much is a Dollar worth in Baht today?
*   `GET /api/market`: General market vibes.
*   `POST /api/ai`: Ask the AI oracle.

## 🤝 Contributing

Found a bug? Want to add more memes? PRs are welcome!

1.  Fork it.
2.  Branch it (`git checkout -b feature/DiamondHands`).
3.  Commit it (`git commit -m 'Added more rockets'`).
4.  Push it (`git push origin feature/DiamondHands`).
5.  PR it.

## 📄 License

This project is open source and available under the [MIT License](LICENSE). Do whatever you want with it, just don't blame me for your portfolio performance.

---

<p align="center">
  Made with ☕, 😭, and code by <a href="https://github.com/lynchzdev">lynchz</a>
</p>