import { Route, Routes } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./pages/Dashboard";
import { Inventory } from "./pages/Inventory";
import { Logistics } from "./pages/Logistics";
import { ShipmentDetail } from "./pages/ShipmentDetail";
import { Trades } from "./pages/Trades";
import { TradeDetail } from "./pages/TradeDetail";
import "./App.css";

function App() {
  return (
    <div className="layout">
      <Sidebar />
      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/trades" element={<Trades />} />
          <Route path="/trades/new" element={<TradeDetail />} />
          <Route path="/trades/:id" element={<TradeDetail />} />
          <Route path="/logistics" element={<Logistics />} />
          <Route path="/logistics/new" element={<ShipmentDetail />} />
          <Route path="/logistics/:id" element={<ShipmentDetail />} />
          <Route path="/inventory" element={<Inventory />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
