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
  /** false means this entry has no page of its own — render it as a
   *  plain section header instead of a link. Its `to` is still used as
   *  the route prefix that decides when to show `children`. */
  linkable?: boolean;
  children?: NavChild[];
}

const links: NavItem[] = [
  { to: "/", label: "Dashboard", end: true },
  {
    to: "/trades",
    label: "Trades",
    linkable: false,
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
          const isWithinSection = location.pathname.startsWith(link.to);

          return (
            <li key={link.to}>
              {link.linkable === false ? (
                <span className={isWithinSection ? "sidebar-section-label active" : "sidebar-section-label"}>
                  {link.label}
                </span>
              ) : (
                <NavLink to={link.to} end={link.end} className={({ isActive }) => (isActive ? "active" : undefined)}>
                  {link.label}
                </NavLink>
              )}
              {/* Sub-items show only while the current page is under this
                  section (e.g. /logistics/..., /trades/...) — derived from
                  the route, not a separate click-to-toggle state, so a
                  direct link or refresh into a sub-page (or, for Trades, the
                  existing unlinked list/detail pages) shows them correctly
                  too. */}
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
