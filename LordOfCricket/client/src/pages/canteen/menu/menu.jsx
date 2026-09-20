import Button from '../../../components/ui/Button.jsx'
import { formatOrderDate, formatOrderTime, statusClass } from '../../../models/canteenMenu.model.js'
import { useMenu } from '../../../hooks/useCanteenMenu.js'

export default function MenuPage() {
  const {
    menu,
    cart,
    confirmOpen,
    setConfirmOpen,
    activeOrder,
    orderHistory,
    showHistory,
    setShowHistory,
    detailsOrder,
    setDetailsOrder,
    loadingDetails,
    error,
    placing,
    orderCount,
    groupedHistory,
    addItem,
    removeItem,
    handlePlaceOrder,
    handleTrackOrder,
    handleViewDetails,
  } = useMenu()

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-4xl font-extrabold text-slate-900 sm:text-5xl">Today's Menu</h1>
          <p className="mt-3 text-lg text-slate-500">Freshly prepared meals for today's players.</p>
        </div>

        {activeOrder && (
          <section className="mb-8 rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">Active Order</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-900">You already have an active order.</h2>
                <p className="mt-2 text-slate-700">
                  {activeOrder.items?.map((item) => `${item.name} x${item.qty}`).join(', ')} · Rs.{activeOrder.total} · {activeOrder.status}
                </p>
              </div>
              <Button onClick={handleTrackOrder}>Track Current Order</Button>
            </div>
          </section>
        )}

        <div className="grid gap-10 lg:grid-cols-[1.8fr_0.8fr]">
          <section className="space-y-6">
            <h2 className="text-3xl font-bold text-slate-900">Food Menu</h2>

            <div className="grid gap-6 lg:grid-cols-2">
              {menu
                .filter((item) => item.available)
                .map((item) => {
                  const quantity = cart.items.find((x) => x.id === item.id)?.qty || 0
                  const disabled = Boolean(activeOrder)

                  return (
                    <article key={item.id} className="flex flex-col gap-6 rounded-3xl bg-white p-5 shadow-md transition hover:shadow-xl">
                      <img src={item.image} alt={item.name} className="h-44 w-full rounded-2xl object-cover" />

                      <div className="flex flex-1 flex-col justify-between">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h3 className="text-2xl font-bold text-slate-900">{item.name}</h3>
                            <p className="mt-2 text-slate-500">{item.description}</p>
                          </div>
                          <span className="text-2xl font-bold text-green-700">Rs.{item.price}</span>
                        </div>

                        <div className="mt-6 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <button disabled={disabled} onClick={() => removeItem(item)} className="flex h-10 w-10 items-center justify-center rounded-full border disabled:opacity-40">
                              -
                            </button>
                            <span className="w-8 text-center text-xl font-bold">{quantity}</span>
                            <button disabled={disabled} onClick={() => addItem(item)} className="flex h-10 w-10 items-center justify-center rounded-full border disabled:opacity-40">
                              +
                            </button>
                          </div>

                          <Button disabled={disabled} onClick={() => addItem(item)}>Add</Button>
                        </div>
                      </div>
                    </article>
                  )
                })}
            </div>
          </section>

          <aside>
            <div className="sticky top-8 rounded-3xl bg-white p-7 shadow-xl">
              <h2 className="text-2xl font-bold text-slate-900">Cart Summary</h2>

              <div className="mt-6 space-y-4">
                {activeOrder && (
                  <p className="rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-800">You already have an active order.</p>
                )}

                {cart.items.length === 0 && <p className="text-slate-500">No items added yet.</p>}

                {cart.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between border-b pb-3">
                    <div>
                      <p className="font-semibold">{item.name}</p>
                      <p className="text-sm text-slate-500">Qty: {item.qty}</p>
                    </div>
                    <p className="font-semibold">Rs.{item.qty * item.price}</p>
                  </div>
                ))}
              </div>

              <div className="mt-8 border-t pt-5">
                <div className="flex items-center justify-between">
                  <span>Total</span>
                  <span className="text-3xl font-bold">Rs.{cart.total}</span>
                </div>

                <Button className="mt-5 w-full" disabled={!orderCount || Boolean(activeOrder)} onClick={() => setConfirmOpen(true)}>
                  Proceed to Order
                </Button>

                {activeOrder && (
                  <Button className="mt-3 w-full" onClick={handleTrackOrder}>
                    Track Current Order
                  </Button>
                )}

                {error && <p className="mt-3 text-red-600">{error}</p>}
              </div>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Previous Order History</h3>
                    <p className="text-xs text-slate-500">Latest orders appear first.</p>
                  </div>
                  <Button onClick={() => setShowHistory((current) => !current)}>
                    {showHistory ? 'Hide History' : 'Show History'}
                  </Button>
                </div>

                {showHistory && (
                  orderHistory.length === 0 ? (
                    <p className="mt-4 rounded-2xl bg-white p-3 text-sm text-slate-500">No previous orders found.</p>
                  ) : (
                    <div className="mt-4 space-y-4">
                      {Object.entries(groupedHistory).map(([date, orders]) => (
                        <div key={date}>
                          <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{date}</h4>
                          <div className="space-y-3">
                            {orders.map((order) => (
                              <article key={order.id} className="rounded-2xl bg-white p-3 shadow-sm">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-semibold text-slate-900">{order.id}</p>
                                    <p className="text-xs text-slate-500">{formatOrderTime(order.orderedAt || order.createdAt)}</p>
                                  </div>
                                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${statusClass(order.status)}`}>{order.status}</span>
                                </div>
                                <div className="mt-2 space-y-1 text-xs text-slate-700">
                                  {order.items?.slice(0, 2).map((item) => (
                                    <p key={`${order.id}-${item.id || item.foodId || item.name}`}>{item.name} x{item.qty}</p>
                                  ))}
                                </div>
                                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                                  <strong className="text-sm text-slate-900">Rs.{order.total}</strong>
                                  <button className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={() => handleViewDetails(order.id)}>
                                    View
                                  </button>
                                </div>
                              </article>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            </div>
          </aside>
        </div>

        {confirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-lg rounded-3xl bg-white p-8 shadow-2xl">
              <h2 className="text-3xl font-bold text-slate-900">Confirm Your Order</h2>
              <p className="mt-2 text-slate-500">Please review your order before placing it.</p>

              <div className="mt-8 space-y-4">
                {cart.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <p className="font-semibold text-slate-900">{item.name}</p>
                      <p className="text-sm text-slate-500">Qty x {item.qty}</p>
                    </div>
                    <p className="font-semibold text-slate-900">Rs.{item.price * item.qty}</p>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-5">
                <span className="text-lg font-semibold">Total</span>
                <span className="text-3xl font-bold text-green-700">Rs.{cart.total}</span>
              </div>

              <div className="mt-8 flex gap-4">
                <button onClick={() => setConfirmOpen(false)} className="flex-1 rounded-2xl border border-slate-300 px-6 py-3 font-semibold transition hover:bg-slate-100">
                  Cancel
                </button>

                <Button className="flex-1" disabled={placing} onClick={handlePlaceOrder}>
                  {placing ? 'Placing Order…' : 'Place Order'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {(detailsOrder || loadingDetails) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-xl rounded-3xl bg-white p-8 shadow-2xl">
              {loadingDetails ? (
                <p className="text-slate-600">Loading order details...</p>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm text-slate-500">Order Details</p>
                      <h2 className="text-2xl font-bold text-slate-900">{detailsOrder.id}</h2>
                      <p className="mt-1 text-sm text-slate-500">{formatOrderDate(detailsOrder.orderedAt || detailsOrder.createdAt)} · {formatOrderTime(detailsOrder.orderedAt || detailsOrder.createdAt)}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusClass(detailsOrder.status)}`}>{detailsOrder.status}</span>
                  </div>

                  <div className="mt-6 space-y-3">
                    {detailsOrder.items?.map((item) => (
                      <div key={`${item.id || item.foodId || item.name}-${item.qty}`} className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <div>
                          <p className="font-semibold text-slate-900">{item.name}</p>
                          <p className="text-sm text-slate-500">Qty: {item.qty} · Rs.{item.price} each</p>
                        </div>
                        <p className="font-semibold text-slate-900">Rs.{item.qty * item.price}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 space-y-2 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                    <p>Ordered: {formatOrderDate(detailsOrder.orderedAt || detailsOrder.createdAt)} {formatOrderTime(detailsOrder.orderedAt || detailsOrder.createdAt)}</p>
                    {detailsOrder.completedAt && <p>Completed: {formatOrderDate(detailsOrder.completedAt)} {formatOrderTime(detailsOrder.completedAt)}</p>}
                  </div>

                  <div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-5">
                    <strong>Total</strong>
                    <strong className="text-2xl text-green-700">Rs.{detailsOrder.total}</strong>
                  </div>
                </>
              )}

              <div className="mt-8 flex justify-end">
                <button className="rounded-2xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setDetailsOrder(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
