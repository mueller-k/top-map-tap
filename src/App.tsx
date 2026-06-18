import { lazy, Suspense } from 'react'
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import './App.css'

const HomePage = lazy(() =>
  import('./pages/HomePage').then((module) => ({ default: module.HomePage })),
)
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })),
)

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <header className="site-header">
          <Link className="brand" to="/" aria-label="Top Map Tap home">
            <span className="brand-mark" aria-hidden="true">◎</span>
            <span>Top Map Tap</span>
          </Link>
        </header>
        <main>
          <Suspense fallback={<div className="page-loader">Loading…</div>}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/d/:dashboardId" element={<DashboardPage />} />
              <Route path="*" element={<Unavailable />} />
            </Routes>
          </Suspense>
        </main>
        <footer>
          Unofficial companion for{' '}
          <a href="https://maptap.gg" target="_blank" rel="noreferrer">maptap.gg</a>
        </footer>
      </div>
    </BrowserRouter>
  )
}

function Unavailable() {
  return (
    <section className="center-card">
      <p className="eyebrow">Dashboard unavailable</p>
      <h1>That link doesn’t go anywhere.</h1>
      <p className="muted">Check the shared URL, or head back home.</p>
      <Link className="button primary" to="/">Back home</Link>
    </section>
  )
}
