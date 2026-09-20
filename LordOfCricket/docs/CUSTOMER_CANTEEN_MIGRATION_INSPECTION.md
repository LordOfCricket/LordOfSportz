# Customer Canteen Ordering — Migration Inspection

Inspection only — no code changed while producing this document.

## 1. Root cause, confirmed precisely

`client/src/services/canteenApi.js` is a fixed axios instance (`baseURL: '${VITE_API_URL}/canteen'`)
used by every customer-facing canteen hook. Every one of its endpoints hits the **transitional**
backend routes (`server/src/routes/canteenMenu.routes.js`/`canteenOrder.routes.js`'s
`transitionalRouter`), which resolve "the" canteen via `attachCurrentCanteen` →
`findSingleCanteen()` (`middlewares/groundAccess.js`). That function throws `AmbiguousCanteenError`
(→ a clean 409, not a crash) the instant more than one canteen exists platform-wide — already true
in this environment today.

The **real, already-built, already-tested** fix exists one layer over:
`server/src/routes/canteenMenu.routes.js`/`canteenOrder.routes.js` export a `groundScopedRouter`,
mounted at `/grounds/:publicGroundId/canteens/:publicCanteenId/menu` and `.../orders`, built from the
exact same `buildCanteenMenuRouter`/`buildCanteenOrderRouter` factory and the exact same controller
functions (`listMenu`, `createOrder`, `getActiveOrder`, `getOrderHistory`, `getOrder`,
`updateOrderStatus`) as the transitional router — resolved instead via `attachGroundCanteenContext`
+ `requireGroundCanteenRole`, which verify `canteen.ground_id === ground.id` from the URL (no
single-row assumption, no IDOR). **Response shapes are byte-identical between the two routers** —
this is a routing/URL migration, not a data-shape migration.

## 2. Where the customer should enter the canteen

`GroundHomePage.jsx` (`/grounds/:publicGroundId`) — the public ground detail page. It already
fetches `ground.canteens: [{ publicCanteenId, name, isActive }]` from `GET /grounds/:publicGroundId`
(`ground.controller.js#getGroundProfile`, unrelated to the broken legacy route) but currently renders
**zero** UI referencing food/canteen ordering anywhere in the file. This is the natural, already-
built "Ground" step of the required flow — confirmed no other public page currently links to canteen
ordering at all (exhaustively grepped `client/src` for `/canteen/menu` — the only real hits were the
route definition itself and the unrelated Ground *Owner* management page).

## 3. Which legacy page/component uses the broken resolution

- `client/src/services/canteenApi.js` — the fixed-base axios instance (root cause).
- `client/src/models/canteenMenu.model.js` + `client/src/hooks/useCanteenMenu.js` +
  `client/src/pages/canteen/menu/menu.jsx` — the customer menu/cart/order-placement page. Fully
  built, well-tested UX (loading/error/empty/active-order/history states, double-submit protection
  already added in an earlier pass) — only its API layer is broken.
- `client/src/models/canteenOrderStatus.model.js` + `client/src/hooks/useCanteenOrderStatus.js` +
  `client/src/pages/canteen/order-status/orderStatus.jsx` — the order-tracking page. Same situation:
  solid UX, broken API layer.
- `client/src/routes/AppRoutes.jsx` — registers these at bare `/canteen/menu` and
  `/canteen/order-status`, with no ground/canteen context in the URL at all.
- `client/src/models/navLinks.model.js:99` — the "Canteen" link in every logged-in user's account
  menu (shown to players too, not just staff) points at `/canteen`, which
  `CanteenEntryRedirect.jsx` resolves via `getPostAuthPath(user)` — `/player/dashboard` for a
  player, `/canteen/staff` for canteen staff. **For a player, this link is already dead today** —
  it silently redirects them to their own dashboard, never to any canteen page. Confirmed by reading
  `roleRedirect.model.js#getPostAuthPath` directly.

## 4. What is explicitly OUT OF SCOPE (touches the same legacy API, but is not the customer flow)

`client/src/models/canteenDashboard.model.js` + `client/src/hooks/useCanteenStaffDashboard.js` +
`client/src/pages/canteen/staff/dashboard.jsx` (the **staff** order-management dashboard,
`/canteen/staff`) **also** imports from the same `canteenApi.js` (`fetchTodaysMenuConfig`,
`fetchOrders`, `publishTodaysMenu`, `updateOrderStatus`, `fetchMasterMenu`,
`createMenuItem`/`updateMenuItem`/`deleteMenuItem`) and would **also** break once >1 canteen exists.
This is real, but it is the **staff** flow, not the **customer** flow this task is explicitly scoped
to. Per the brief's own "do not add unrelated features" rule, this is left untouched — noted here so
it is not silently rediscovered later, and so the fix below never touches or breaks it: none of
`canteenApi.js`'s existing exports the staff dashboard depends on are modified or removed, only new,
separate, ground-scoped functions are added alongside them.

`lookupOrderByUser` (`canteenApi.js`) is exported but grepped with zero importers anywhere in the
client — dead code, left alone (not this task's concern).

## 5. Which existing ground-scoped APIs replace the legacy calls

| Customer flow call (legacy, broken) | Ground-scoped replacement (already exists, already tested) |
|---|---|
| `GET /canteen/menu` | `GET /grounds/:publicGroundId/canteens/:publicCanteenId/menu` |
| `GET /canteen/orders/active/:userId` | `GET /grounds/:publicGroundId/canteens/:publicCanteenId/orders/active/:userId` |
| `GET /canteen/orders/history/:userId` | `GET /grounds/:publicGroundId/canteens/:publicCanteenId/orders/history/:userId` |
| `POST /canteen/orders` | `POST /grounds/:publicGroundId/canteens/:publicCanteenId/orders` |
| `GET /canteen/orders/:id` | `GET /grounds/:publicGroundId/canteens/:publicCanteenId/orders/:id` |

Order-creation payload shape is **unchanged** (`{ seatId, items: [{ id, qty }] }`) — confirmed the
shared `resolveOrderLines` (Phase 17.1, this session's own earlier work) only ever reads `id`/`qty`
per item, already ignoring any extra client-supplied fields; server-authoritative pricing is
untouched by this migration.

## 6. Which existing components/patterns are reused

- `menu.jsx`, `useCanteenMenu.js`'s existing state machine (cart, confirm modal, active-order banner,
  order history, error/loading/placing states, double-submit protection) — reused unchanged; only the
  API-call layer underneath it changes.
- `orderStatus.jsx`, `useCanteenOrderStatus.js`'s existing progress-tracker UI and Socket.IO
  reconnect-resync logic — reused unchanged (Socket.IO rooms are keyed by `userId`/`orderId` globally,
  not by canteen, so no realtime-layer change is needed at all).
- The existing `err.response?.data?.code`-branching error-message pattern already added to
  `useCanteenMenu.js` in an earlier pass (`CANTEEN_CLOSED`/`GROUND_CLOSED`/`ITEM_UNAVAILABLE`/
  `INSUFFICIENT_STOCK`) — reused unchanged; it already handles every one of Step 5's required states.
- `services/api.js` — the shared, credentialed axios instance every other ground-scoped feature in
  this app already uses (with the Phase 22 global 401 → session-expiry redirect). The new customer
  canteen API functions use this instead of `canteenApi.js`'s separate, older instance — a direct,
  in-scope improvement (this page currently has no session-expiry handling at all; every other
  ground-scoped page already does).
- `ground.canteens` data already returned by the existing, unrelated `GET /grounds/:publicGroundId`
  endpoint — reused as the source for the new entry-point UI, no new backend endpoint needed.

## 7. Planned change set (small, surgical)

1. **New** `client/src/services/customerCanteenApi.js` — ground/canteen-scoped functions
   (`fetchCanteenMenu`, `fetchMyActiveOrder`, `fetchMyOrderHistory`, `placeCanteenOrder`,
   `fetchCanteenOrder`), built on the shared `api` instance. `canteenApi.js` itself is **not
   modified** — the staff dashboard's existing imports from it are completely unaffected.
2. `client/src/hooks/useCanteenMenu.js` — read `publicGroundId`/`publicCanteenId` via `useParams()`,
   call the new ground-scoped functions instead of the old ones, navigate to the new ground-scoped
   order-status route. No change to cart/UX logic.
3. `client/src/hooks/useCanteenOrderStatus.js` — same pattern: read route params, call the new
   ground-scoped functions, navigate back to the new ground-scoped menu route.
4. `client/src/routes/AppRoutes.jsx` — replace `/canteen/menu` and `/canteen/order-status` with
   `/grounds/:publicGroundId/canteen/:publicCanteenId/menu` and `.../order-status`. `/canteen`,
   `/canteen/staff` untouched.
5. `client/src/pages/ground-homepage/GroundHomePage.jsx` — a small "Order Food" section, rendered
   only when `ground.canteens.length > 0`, listing each canteen with its own button (inactive
   canteens shown but not clickable) — this small list IS the "Ground → Canteen" step; a separate
   picker page would be over-engineering for what's already a short list on a page already loaded.
6. `client/src/models/navLinks.model.js` — the generic "Canteen" account-menu link is only meaningful
   for staff (`/canteen/staff`) now that customer ordering is ground-contextual; scoped to
   `isStaff` only, closing the dead-link-for-players issue found during inspection.

No backend file changes. No database changes. No changes to `canteenApi.js`'s existing exports, the
staff dashboard, pricing logic, stock validation, canteen/ground status enforcement, notifications,
or Socket.IO room authentication — all already correct and independently verified in earlier phases.
