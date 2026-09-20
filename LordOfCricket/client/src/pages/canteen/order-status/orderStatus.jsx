import Button from '../../../components/ui/Button.jsx'
import { useOrderStatus } from '../../../hooks/useCanteenOrderStatus.js'

export default function OrderStatusPage() {
  const { order, error, steps, activeIndex, currentStep, handleBackToMenu } = useOrderStatus()

  return (
    <main
      className="min-h-screen bg-cover bg-center bg-no-repeat px-4 py-10 sm:px-6 lg:px-8"
      style={{
        backgroundImage: `
          linear-gradient(
            rgba(2,6,23,0.78),
            rgba(2,6,23,0.78)
          ),
          url('/images/cricket-stadium.jpg')
        `,
      }}
    >
      <div className="mx-auto max-w-4xl overflow-hidden rounded-[2rem] border border-white/15 bg-slate-900/50 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.8)] backdrop-blur-2xl">
        <div className="border-b border-white/10 bg-slate-950/70 px-6 py-6 text-white sm:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-200">Order Status</p>
              <h1 className="mt-2 text-3xl font-bold sm:text-4xl">{order?.id || 'Order'}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-full bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-200">{order?.status || 'Pending'}</div>
              <Button onClick={handleBackToMenu}>Back to Menu</Button>
            </div>
          </div>
        </div>

        <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-6">
            <div className="rounded-[1.5rem] border border-white/10 bg-white/10 p-5 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-slate-300">Customer</p>
                  <p className="mt-2 text-2xl font-bold text-white">{order?.customerName || '—'}</p>
                </div>
                <div className="rounded-2xl bg-slate-950/70 px-4 py-3 text-right text-white ring-1 ring-white/10">
                  <div className="text-xs uppercase tracking-wide text-slate-300">Order ID</div>
                  <div className="mt-1 text-sm font-semibold">{order?.id || '—'}</div>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-5 shadow-sm backdrop-blur-sm">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-white">Progress</h2>
                <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-semibold text-emerald-200">{order?.status || 'Pending'}</span>
              </div>

              {currentStep && (
                <div className="mb-6 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">Live Update</p>
                  <p className="mt-2 text-lg font-bold text-white">{currentStep.detail}</p>
                </div>
              )}

              <div className="space-y-4">
                {steps.map((step, index) => {
                  const completed = index <= activeIndex
                  return (
                    <div key={step.status} className="flex items-start gap-4">
                      <div className={`mt-0.5 flex h-10 w-10 flex-none items-center justify-center rounded-full text-sm font-bold text-slate-950 ${completed ? 'bg-emerald-300' : 'bg-slate-500'}`}>
                        {index + 1}
                      </div>
                      <div className="flex-1 rounded-2xl border border-white/10 bg-white/5 p-3">
                        <p className={`font-semibold ${completed ? 'text-white' : 'text-slate-400'}`}>{step.title}</p>
                        <p className="mt-1 text-sm text-slate-300">{index === activeIndex ? step.detail : 'Waiting for this stage'}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {order?.status === 'Cancelled' && (
              <div className="rounded-[1.5rem] border border-red-400/30 bg-red-500/10 p-5 text-red-100">
                This order was cancelled.
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/50 p-5 shadow-sm backdrop-blur-sm">
              <h2 className="text-xl font-semibold text-white">Order Items</h2>
              <div className="mt-4 space-y-3">
                {order?.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3 text-slate-200">
                    <span>{item.name} × {item.qty}</span>
                    <span className="font-semibold text-white">₹{item.price * item.qty}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4 text-white">
                <strong>Total</strong>
                <strong className="text-xl text-emerald-300">₹{order?.total}</strong>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-white/10 p-5 text-white shadow-sm backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.26em] text-emerald-200">Status Summary</p>
              <p className="mt-2 text-lg font-semibold">Your order is currently <span className="text-emerald-300">{order?.status || 'Pending'}</span>.</p>
            </div>
          </div>
        </div>

        {error && <p className="px-6 pb-6 text-sm text-rose-300 sm:px-8">{error}</p>}
      </div>
    </main>
  )
}
