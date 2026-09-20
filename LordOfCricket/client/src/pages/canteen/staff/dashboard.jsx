import Button from '../../../components/ui/Button.jsx'
import { STAGE_ACTIONS, statusBadgeClass } from '../../../models/canteenDashboard.model.js'
import { useStaffDashboard } from '../../../hooks/useCanteenStaffDashboard.js'

export default function StaffDashboardPage() {
  const {
    isCanteenStaffOnly,
    tab,
    setTab,
    todayItems,
    masterItems,
    page,
    setPage,
    total,
    selectedOrder,
    setSelectedOrder,
    publishStatus,
    error,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    isRefreshing,
    refreshDashboard,
    statusIndex,
    handleStatusUpdate,
    handleToggleAvailability,
    handleAddToToday,
    newFood,
    setNewFood,
    previewImage,
    editingItem,
    editFood,
    setEditFood,
    editPreviewImage,
    handleCreateFood,
    startEditFood,
    closeEditModal,
    handleUpdateFood,
    handleDeleteFood,
    handlePublishMenu,
    handleNewFoodImageChange,
    handleEditFoodImageChange,
    totalPages,
    filteredOrders,
    historyPage,
    setHistoryPage,
    historyTotalPages,
    historyStatusFilter,
    setHistoryStatusFilter,
    filteredHistoryOrders,
  } = useStaffDashboard()

  return (
    <main
      className="min-h-screen bg-cover bg-center bg-no-repeat text-white"
      style={{
        backgroundImage: `
          linear-gradient(
            rgba(2,6,23,0.74),
            rgba(2,6,23,0.74)
          ),
          url('/images/cricket-stadium.jpg')
        `,
      }}
    >
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <section className="rounded-[32px] border border-white/15 bg-slate-900/40 p-8 shadow-2xl backdrop-blur-2xl sm:p-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>

              <h1 className="mt-3 text-4xl font-extrabold text-white sm:text-5xl">Canteen Staff Dashboard</h1>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-300">Active Orders</p>
                <p className="mt-2 text-3xl font-bold text-white">{total}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-300">Today's Items</p>
                <p className="mt-2 text-3xl font-bold text-white">{todayItems.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-300">Master Menu</p>
                <p className="mt-2 text-3xl font-bold text-white">{masterItems.length}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[32px] border border-white/15 bg-slate-900/45 p-6 shadow-2xl backdrop-blur-2xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

            <div className="flex flex-wrap gap-3">
              {!isCanteenStaffOnly && (
                <Button className={`h-12 px-4 ${tab === 'manage' ? 'bg-green-600' : 'bg-slate-200 text-slate-900'}`} onClick={() => setTab('manage')}>Manage Today</Button>
              )}
              {!isCanteenStaffOnly && (
                <Button className={`h-12 px-4 ${tab === 'all' ? 'bg-green-600' : 'bg-slate-200 text-slate-900'}`} onClick={() => setTab('all')}>All Food</Button>
              )}
              <Button className={`h-12 px-4 ${tab === 'orders' ? 'bg-green-600' : 'bg-slate-200 text-slate-900'}`} onClick={() => setTab('orders')}>Orders</Button>
              <Button className={`h-12 px-4 ${tab === 'history' ? 'bg-green-600' : 'bg-slate-200 text-slate-900'}`} onClick={() => setTab('history')}>Order History</Button>
              {!isCanteenStaffOnly && (
                <Button className={`h-12 px-4 ${tab === 'add' ? 'bg-emerald-600' : 'bg-emerald-200 text-slate-900'}`} onClick={() => setTab('add')}>Add Food</Button>
              )}
              <Button className="h-12 bg-white/10 px-4 text-sm text-white" onClick={() => void refreshDashboard()}>
                {isRefreshing ? 'Refreshing…' : 'Refresh Live'}
              </Button>
            </div>
          </div>

          {tab === 'manage' ? (
            <>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {todayItems.map((item) => (
                  <article key={item.id} className="rounded-[28px] border border-white/10 bg-white/10 p-5 shadow-lg shadow-slate-950/20 backdrop-blur-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-semibold text-white">{item.name}</h3>
                        <p className="mt-1 text-sm text-slate-300">{item.category}</p>
                        <p className="mt-2 text-sm text-slate-300">{item.description}</p>
                        <p className="mt-3 text-lg font-bold text-green-300">₹{item.dailyPrice}</p>
                      </div>
                      <div className={`rounded-full px-3 py-1 text-sm font-semibold ${item.available ? 'bg-emerald-400/20 text-emerald-200' : 'bg-slate-200/20 text-slate-200'}`}>
                        {item.available ? 'Available' : 'Hidden'}
                      </div>
                    </div>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <label className="flex items-center gap-2 text-sm text-slate-200">
                        <input
                          type="checkbox"
                          checked={item.available}
                          onChange={() => handleToggleAvailability(item.id)}
                          className="h-4 w-4 rounded border-slate-300 text-green-500 focus:ring-green-400"
                        />
                        Available today
                      </label>
                    </div>
                  </article>
                ))}
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Button onClick={handlePublishMenu}>Publish Menu</Button>
                {publishStatus && <span className="text-sm text-emerald-200">{publishStatus}</span>}
              </div>
            </>
          ) : tab === 'orders' ? (
            <>
              <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-1 flex-col gap-3 md:flex-row">
                  <input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by order ID, seat or customer name"
                    className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-slate-950/30 px-4 py-3 text-sm text-white placeholder:text-slate-400"
                  />
                  <div className="flex flex-wrap gap-2">
                    {['all', 'Pending', 'Accepted', 'Preparing', 'Ready'].map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => setStatusFilter(filter)}
                        className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                          statusFilter === filter
                            ? 'bg-green-400 text-slate-950'
                            : 'border border-white/10 bg-white/10 text-slate-200 hover:bg-white/20'
                        }`}
                      >
                        {filter === 'all' ? 'All Status' : filter}
                      </button>
                    ))}
                  </div>
                </div>
                <span className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white">{total} active</span>
              </div>

              <div className="mt-4 overflow-x-auto rounded-[24px] border border-white/10 bg-slate-950/10">
                <table className="min-w-full divide-y divide-white/10 text-left text-sm text-white">
                  <thead className="bg-white/10 text-slate-200">
                    <tr>
                      <th className="px-4 py-3">Order ID</th>
                      <th className="px-4 py-3">Seat / Mobile</th>
                      <th className="px-4 py-3">Items</th>
                      <th className="px-4 py-3">Total</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {filteredOrders.map((order) => (
                      <tr
                        key={order.id}
                        onClick={() => setSelectedOrder(order)}
                        className={`cursor-pointer transition hover:bg-white/10 ${selectedOrder?.id === order.id ? 'bg-green-500/10' : ''}`}
                      >
                        <td className="px-4 py-4 font-medium text-white">{order.id}</td>
                        <td className="px-4 py-4 text-slate-200">{order.seatId} / {order.customerName}</td>
                        <td className="px-4 py-4 text-slate-200">
                          {order.items.map((item) => `${item.name}×${item.qty}`).join(', ')}
                        </td>
                        <td className="px-4 py-4 text-slate-200">₹{order.total}</td>
                        <td className="px-4 py-4">
                          <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusBadgeClass(order.status)}`}>{order.status}</span>
                        </td>
                        <td className="px-4 py-4">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              setSelectedOrder(order)
                            }}
                            className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white"
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredOrders.length === 0 && (
                <p className="mt-5 rounded-2xl bg-white/10 p-5 text-slate-300">No orders match the current search or status filter.</p>
              )}

              {selectedOrder && (
                <div className="mt-6 rounded-[28px] border border-white/10 bg-white/10 p-6 shadow-lg backdrop-blur-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-sm text-slate-300">Selected Order</p>
                      <h3 className="text-2xl font-bold text-white">{selectedOrder.id}</h3>
                      <p className="mt-2 text-slate-200">{selectedOrder.seatId} / {selectedOrder.customerName}</p>
                    </div>
                    <span className={`w-fit rounded-full px-4 py-2 text-sm font-bold ${statusBadgeClass(selectedOrder.status)}`}>{selectedOrder.status}</span>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    {selectedOrder.items.map((item) => (
                      <div key={`${selectedOrder.id}-${item.id || item.foodId || item.name}`} className="rounded-2xl bg-slate-900/40 p-4 shadow-sm">
                        <p className="font-semibold text-white">{item.name}</p>
                        <p className="text-sm text-slate-300">Qty: {item.qty} - Rs.{item.price} each</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
                    <span className="font-semibold text-slate-200">Total</span>
                    <strong className="text-2xl text-green-300">Rs.{selectedOrder.total}</strong>
                  </div>

                  <div className="mt-6 grid gap-3 md:grid-cols-3">
                    {STAGE_ACTIONS.map((stage) => {
                      const currentIndex = statusIndex(selectedOrder.status)
                      const stageIndex = statusIndex(stage.status)
                      const reached = stageIndex <= currentIndex

                      return (
                        <button
                          key={stage.status}
                          disabled={stage.status === selectedOrder.status}
                          onClick={() => handleStatusUpdate(selectedOrder, stage.status)}
                          className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition disabled:cursor-default ${
                            reached
                              ? 'border-green-300/50 bg-green-500/10 text-green-100'
                              : 'border-white/15 bg-slate-900/40 text-slate-100 hover:border-green-300/40 hover:bg-green-500/10'
                          }`}
                        >
                          {stage.label}
                        </button>
                      )
                    })}
                    <button
                      onClick={() => handleStatusUpdate(selectedOrder, 'Cancelled')}
                      className="rounded-2xl border border-red-400/40 bg-slate-900/40 px-4 py-3 text-left text-sm font-semibold text-red-200 hover:bg-red-500/10"
                    >
                      Cancel Order
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-6 flex items-center justify-between">
                <p className="text-sm text-slate-300">Page {page} of {totalPages}</p>
                <div className="flex items-center gap-3">
                  <button disabled={page <= 1} className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-white disabled:opacity-50" onClick={() => setPage(page - 1)}>Previous</button>
                  <button disabled={page >= totalPages} className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-white disabled:opacity-50" onClick={() => setPage(page + 1)}>Next</button>
                </div>
              </div>
            </>
          ) : tab === 'history' ? (
            <>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  {['all', 'Completed', 'Cancelled', 'Pending', 'Accepted', 'Preparing', 'Ready'].map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setHistoryStatusFilter(filter)}
                      className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                        historyStatusFilter === filter
                          ? 'bg-green-400 text-slate-950'
                          : 'border border-white/10 bg-white/10 text-slate-200 hover:bg-white/20'
                      }`}
                    >
                      {filter === 'all' ? 'All Status' : filter}
                    </button>
                  ))}
                </div>
                <span className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white">{historyTotalPages > 1 ? `Page ${historyPage} of ${historyTotalPages}` : `${filteredHistoryOrders.length} orders`}</span>
              </div>

              <div className="mt-4 overflow-x-auto rounded-[24px] border border-white/10 bg-slate-950/10">
                <table className="min-w-full divide-y divide-white/10 text-left text-sm text-white">
                  <thead className="bg-white/10 text-slate-200">
                    <tr>
                      <th className="px-4 py-3">Order ID</th>
                      <th className="px-4 py-3">Seat / Mobile</th>
                      <th className="px-4 py-3">Items</th>
                      <th className="px-4 py-3">Total</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {filteredHistoryOrders.map((order) => (
                      <tr key={order.id}>
                        <td className="px-4 py-4 font-medium text-white">{order.id}</td>
                        <td className="px-4 py-4 text-slate-200">{order.seatId} / {order.customerName}</td>
                        <td className="px-4 py-4 text-slate-200">
                          {order.items.map((item) => `${item.name}×${item.qty}`).join(', ')}
                        </td>
                        <td className="px-4 py-4 text-slate-200">₹{order.total}</td>
                        <td className="px-4 py-4">
                          <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusBadgeClass(order.status)}`}>{order.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredHistoryOrders.length === 0 && (
                <p className="mt-5 rounded-2xl bg-white/10 p-5 text-slate-300">No orders match the current filter.</p>
              )}

              <div className="mt-6 flex items-center justify-between">
                <p className="text-sm text-slate-300">Page {historyPage} of {historyTotalPages}</p>
                <div className="flex items-center gap-3">
                  <button disabled={historyPage <= 1} className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-white disabled:opacity-50" onClick={() => setHistoryPage(historyPage - 1)}>Previous</button>
                  <button disabled={historyPage >= historyTotalPages} className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-white disabled:opacity-50" onClick={() => setHistoryPage(historyPage + 1)}>Next</button>
                </div>
              </div>
            </>
          ) : null}
          {tab === 'all' && (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {masterItems.map((item) => (
                <article key={item.id} className="rounded-[28px] border border-white/10 bg-white/10 p-4 shadow-lg shadow-slate-950/20 backdrop-blur-sm">
                  <div className="space-y-3">
                    {item.image && <img src={item.image} alt={item.name} className="h-44 w-full rounded-3xl object-cover" />}
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-white">{item.name}</h3>
                        <p className="mt-1 text-sm text-slate-300">{item.category}</p>
                        <p className="mt-1 text-sm text-slate-300">{item.description}</p>
                        <p className="mt-2 text-sm font-semibold text-green-300">₹{item.price}</p>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button className="h-11 px-4 text-sm" onClick={() => handleAddToToday(item)}>Add to Today's Menu</Button>
                        <Button className="h-11 bg-slate-200 px-4 text-sm text-slate-900" onClick={() => startEditFood(item)}>Edit</Button>
                        <Button className="h-11 bg-red-600 px-4 text-sm" onClick={() => handleDeleteFood(item)}>Delete</Button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {tab === 'add' && (
            <div className="mt-6 rounded-[28px] border border-white/10 bg-white/10 p-6 shadow-lg backdrop-blur-sm">
              <div className="grid gap-3 md:grid-cols-2">
                <input className="rounded-2xl border border-white/10 bg-slate-950/30 p-3 text-white placeholder:text-slate-400" placeholder="Name" value={newFood.name} onChange={(e) => setNewFood({ ...newFood, name: e.target.value })} />
                <input className="rounded-2xl border border-white/10 bg-slate-950/30 p-3 text-white placeholder:text-slate-400" placeholder="Category" value={newFood.category} onChange={(e) => setNewFood({ ...newFood, category: e.target.value })} />
                <input
                  className="rounded-2xl border border-white/10 bg-slate-950/30 p-3 text-white"
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleNewFoodImageChange(e.target.files?.[0] || null)}
                />
                <input className="rounded-2xl border border-white/10 bg-slate-950/30 p-3 text-white placeholder:text-slate-400" placeholder="Price" value={newFood.price} onChange={(e) => setNewFood({ ...newFood, price: e.target.value })} />
                <textarea className="rounded-2xl border border-white/10 bg-slate-950/30 p-3 text-white placeholder:text-slate-400 md:col-span-2" placeholder="Description" value={newFood.description} onChange={(e) => setNewFood({ ...newFood, description: e.target.value })} />
              </div>
              {previewImage && (
                <div className="mt-4">
                  <p className="text-sm text-slate-300">Preview</p>
                  <img src={previewImage} alt="Preview" className="mt-2 max-h-48 rounded-3xl object-cover" />
                </div>
              )}
              <div className="mt-4">
                <Button onClick={handleCreateFood}>Add Food</Button>
              </div>
            </div>
          )}

          {editingItem && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="w-full max-w-2xl rounded-[2rem] border border-white/10 bg-slate-900/90 p-6 text-white shadow-2xl backdrop-blur-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold text-white">Edit Menu Item</h2>
                    <p className="text-sm text-slate-300">Update the food item and photo.</p>
                  </div>
                  <button className="text-slate-300" onClick={closeEditModal}>Close</button>
                </div>
                <div className="mt-6 grid gap-3 md:grid-cols-2">
                  <input className="rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-white" value={editFood.name} onChange={(e) => setEditFood({ ...editFood, name: e.target.value })} />
                  <input className="rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-white" value={editFood.category} onChange={(e) => setEditFood({ ...editFood, category: e.target.value })} />
                  <input
                    className="rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-white"
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleEditFoodImageChange(e.target.files?.[0] || null)}
                  />
                  <input className="rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-white" value={editFood.price} onChange={(e) => setEditFood({ ...editFood, price: e.target.value })} />
                  <textarea className="rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-white md:col-span-2" value={editFood.description} onChange={(e) => setEditFood({ ...editFood, description: e.target.value })} />
                </div>
                {editPreviewImage && (
                  <div className="mt-4">
                    <p className="text-sm text-slate-300">Preview</p>
                    <img src={editPreviewImage} alt="Preview" className="mt-2 max-h-48 rounded-3xl object-cover" />
                  </div>
                )}
                <div className="mt-4 flex gap-3">
                  <Button onClick={handleUpdateFood}>Save changes</Button>
                  <Button className="bg-red-600" onClick={() => handleDeleteFood(editingItem)}>Delete</Button>
                  <button className="rounded-2xl border border-white/15 px-4 py-2 text-slate-100" onClick={closeEditModal}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}
        </section>
      </div>
    </main>
  )
}
