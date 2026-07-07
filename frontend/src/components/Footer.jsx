import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="links">
        <Link to="/">Home</Link>
        <Link to="/about">About us</Link>
        <Link to="/why-us">Why this product</Link>
      </div>
      <p>© Gestural — practice your on-camera presence</p>
    </footer>
  )
}
