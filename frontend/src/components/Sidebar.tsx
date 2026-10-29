import { NavLink } from "react-router-dom";
import "./Sidebar.css";

const links = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/trades", label: "Trades" },
  { to: "/logistics", label: "Logistics" },
  { to: "/inventory", label: "Inventory" },
];

export function Sidebar() {
  return (
    <nav className="sidebar">
      <div className="sidebar-title">CTRM</div>
      <ul>
        {links.map((link) => (
          <li key={link.to}>
            <NavLink to={link.to} end={link.end} className={({ isActive }) => (isActive ? "active" : undefined)}>
              {link.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
