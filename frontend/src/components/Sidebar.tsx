import { NavLink, useLocation } from "react-router-dom";
import "./Sidebar.css";

interface NavChild {
  to: string;
  label: string;
}

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  children?: NavChild[];
}

const links: NavItem[] = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/trades", label: "Trades" },
  {
    to: "/logistics",
    label: "Logistics",
    children: [
      { to: "/logistics/shipment-listing", label: "Shipment listing" },
      { to: "/logistics/sales-fulfillment", label: "Sales fulfillment" },
    ],
  },
  { to: "/inventory", label: "Inventory" },
];

export function Sidebar() {
  const location = useLocation();

  return (
    <nav className="sidebar">
      <div className="sidebar-title">CTRM</div>
      <ul>
        {links.map((link) => (
          <li key={link.to}>
            <NavLink to={link.to} end={link.end} className={({ isActive }) => (isActive ? "active" : undefined)}>
              {link.label}
            </NavLink>
            {/* Sub-items show only while the current page is under this
                section (e.g. /logistics/...) — derived from the route, not
                a separate click-to-toggle state, so a direct link or
                refresh into a sub-page shows them correctly too. */}
            {link.children && location.pathname.startsWith(link.to) && (
              <ul className="sidebar-sublist">
                {link.children.map((child) => (
                  <li key={child.to}>
                    <NavLink to={child.to} className={({ isActive }) => (isActive ? "active" : undefined)}>
                      {child.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
