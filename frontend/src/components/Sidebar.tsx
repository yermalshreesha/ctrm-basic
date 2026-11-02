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
  /** Route prefix that shows `children` and applies the section
   *  highlight; defaults to `to`. Kept separate from `to` for Contracts,
   *  whose own link target (`/trades/trades`) is narrower than the
   *  section it belongs to (`/trades`, which also covers the Trade
   *  detail/create pages, `/trades/:id` and `/trades/new`). */
  matchPrefix?: string;
  children?: NavChild[];
}

const links: NavItem[] = [
  { to: "/", label: "Dashboard", end: true },
  {
    to: "/trades/trades",
    label: "Contracts",
    matchPrefix: "/trades",
    children: [
      { to: "/trades/trades", label: "Trades" },
      { to: "/trades/approvals", label: "Approvals" },
    ],
  },
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
        {links.map((link) => {
          const prefix = link.matchPrefix ?? link.to;
          const isWithinSection = location.pathname.startsWith(prefix);

          return (
            <li key={link.to}>
              <NavLink to={link.to} end={link.end} className={({ isActive }) => (isActive ? "active" : undefined)}>
                {link.label}
              </NavLink>
              {/* Sub-items show only while the current page is under this
                  section (e.g. /logistics/..., /trades/...) — derived from
                  the route, not a separate click-to-toggle state, so a
                  direct link or refresh into a sub-page (e.g. a Trade
                  detail/create page) shows them correctly too. */}
              {link.children && isWithinSection && (
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
          );
        })}
      </ul>
    </nav>
  );
}
