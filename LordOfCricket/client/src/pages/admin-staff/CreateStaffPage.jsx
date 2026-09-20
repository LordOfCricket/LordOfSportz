import AdminLayout from '../../components/admin/AdminLayout.jsx'
import Button from '../../components/ui/Button.jsx'
import Input from '../../components/ui/Input.jsx'
import StepUpModal from '../../components/security/StepUpModal.jsx'
import { useCreateStaff } from '../../hooks/useCreateStaff.js'

export default function CreateStaffPage() {
  const { form, setField, handleSubmit, submitting, error, successMessage, stepUpModal, submitStepUp, cancelStepUp } = useCreateStaff()

  return (
    <AdminLayout title="Create Staff" subtitle="Create Admin, Canteen Staff, or Super Admin accounts. Staff sign in with email and password.">
      <form onSubmit={handleSubmit} className="max-w-xl space-y-5 rounded-[32px] border border-white/15 bg-slate-900/45 p-8 shadow-2xl backdrop-blur-2xl">
        <Input label="Staff Name" value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="Full name" />
        <Input label="Email" type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} placeholder="staff@example.com" />
        <Input label="Staff ID (optional)" value={form.staffId} onChange={(e) => setField('staffId', e.target.value)} placeholder="e.g. LOC-014" />
        <Input label="Password" type="password" value={form.password} onChange={(e) => setField('password', e.target.value)} placeholder="At least 8 characters" />

        <label className="block">
          <span className="mb-3 block text-sm font-semibold tracking-wide text-slate-200">Role</span>
          <select
            value={form.role}
            onChange={(e) => setField('role', e.target.value)}
            className="w-full rounded-2xl border border-white/15 bg-white/5 px-5 py-4 text-base text-white outline-none focus:border-green-400 focus:bg-white/10 focus:ring-4 focus:ring-green-500/20"
          >
            <option className="bg-slate-900" value="admin">Admin</option>
            <option className="bg-slate-900" value="canteen_staff">Canteen Staff</option>
            <option className="bg-slate-900" value="super_admin">Super Admin</option>
          </select>
        </label>

        {error && <p className="text-sm text-rose-300">{error}</p>}
        {successMessage && <p className="text-sm text-emerald-300">{successMessage}</p>}

        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? 'Creating…' : 'Create Staff'}
        </Button>
      </form>

      <StepUpModal pending={stepUpModal} onSubmit={submitStepUp} onCancel={cancelStepUp} />
    </AdminLayout>
  )
}
