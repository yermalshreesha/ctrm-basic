# Intent: Basic agricultural CTRM (learning project)
Author: Yermal Udaya Shreesha. Status: draft.

## Problem
A small agricultural trading desk buying and selling grains, coffee and
sugar tracks trades, shipments and warehouse stock in separate
spreadsheets. Nobody can quickly answer: "How much of each commodity
have we bought vs sold, where is it now, and what is on the way?"

## Proposed outcome
A single web application where one user can:
- Record physical buy and sell trades at a fixed price
- Link trades to shipments and track their movement
- See warehouse inventory update as goods arrive and leave
- View a dashboard of net positions, stock levels and active shipments

## Modules
- Trade: commodity, direction (buy/sell), counterparty, quantity (MT),
  fixed price, currency, delivery period, status
  (draft / confirmed / completed / cancelled)
- Logistics: shipments linked to a trade; origin, destination, transport
  mode (truck / rail / vessel), planned and actual dates, status
  (planned / in transit / delivered)
- Inventory: stock per commodity per warehouse; increases when a purchase
  shipment is delivered, decreases when a sale shipment departs
- Dashboard: net position per commodity (bought minus sold), inventory
  by warehouse, shipments in progress

## Users
One user acting as trader and operator. No login.

## Constraints
- Single user, no authentication
- Fixed-price trades only
- Quantities in metric tons (MT)
- Inventory must never go negative
- Runs locally on a developer laptop

## Out of scope
Authentication and roles, futures or basis pricing, P&L and market
prices, invoicing and payments, live market data, multi-currency
conversion, partial deliveries.

## Success looks like
- A trade can be created, confirmed and completed end to end
- Delivering a purchase shipment increases the right warehouse's stock
- The dashboard position matches the sum of confirmed trades
- Core business rules are covered by automated tests

## Open questions
- One currency for all trades (e.g. USD), or store currency per trade?
- Can one trade have multiple shipments, or exactly one?
- Should counterparties and warehouses be editable lists or fixed seed data?