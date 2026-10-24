import { useEffect, useState } from 'react'
import { KeyRound, LogOut, ShieldCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from './Account'
import { DEMO, deleteAccount, friendly, mfaDisable, mfaEnroll, mfaStatus, mfaVerify, signOut } from '../lib/backend'

/** "Security & privacy": 2-step login (TOTP), log out everywhere, delete my account and data. */
export default function AccountSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mfa, setMfa] = useState<{ on: boolean } | null>(null)
  const [enrol, setEnrol] = useState<{ factorId: string; qr: string; secret: string } | null>(null)
  const [code, setCode] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setEnrol(null); setCode(''); setConfirm(''); mfaStatus().then(setMfa, () => setMfa({ on: false })) } }, [open])
  const run = async (f: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try { await f(); toast.success(ok) } catch (e) { toast.error(friendly(e)) } finally { setBusy(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title="Security & privacy">
      <div className="space-y-5 text-sm">
        <section>
          <h3 className="font-semibold flex items-center gap-2"><KeyRound size={15} className="text-accent" />2-step login</h3>
          <p className="text-muted mt-1">Recommended for Plugsy hosts. After your password, you also enter a 6-digit code from an authenticator app (Google Authenticator, Authy, Microsoft Authenticator).</p>
          {DEMO ? <p className="text-xs text-warn mt-2">Available when the live service is connected.</p>
            : mfa?.on ? (
              <div className="mt-2 flex items-center gap-3"><span className="chip text-ok border-ok/30 bg-ok/10"><ShieldCheck size={12} />On</span>
                <button className="pill" disabled={busy} onClick={() => run(async () => { await mfaDisable(); setMfa({ on: false }) }, '2-step login turned off')}>Turn off</button></div>
            ) : enrol ? (
              <div className="mt-2 space-y-2">
                <p>1. Scan this QR code in your authenticator app:</p>
                <img src={enrol.qr} alt="QR code for your authenticator app" className="w-44 h-44 bg-white rounded-lg p-2" />
                <p className="text-xs text-muted">Can’t scan? Type this key: <code className="tnum break-all">{enrol.secret}</code></p>
                <p>2. Enter the 6-digit code it shows:</p>
                <div className="flex gap-2">
                  <input className="input tnum" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} aria-label="6-digit code" />
                  <button className="btn btn-primary" disabled={busy || code.length !== 6} onClick={() => run(async () => { await mfaVerify(code, enrol.factorId); setEnrol(null); setMfa({ on: true }) }, '2-step login is on')}>Turn on</button>
                </div>
              </div>
            ) : <button className="btn btn-ghost mt-2" disabled={busy || !mfa} onClick={() => run(async () => setEnrol(await mfaEnroll()), 'Scan the QR code to continue')}>Set up 2-step login</button>}
        </section>

        <section>
          <h3 className="font-semibold flex items-center gap-2"><LogOut size={15} className="text-accent" />Log out everywhere</h3>
          <p className="text-muted mt-1">Ends your session on every phone and computer, for example if you lost a device.</p>
          <button className="btn btn-ghost mt-2" disabled={busy} onClick={() => run(async () => { await signOut(true); onClose() }, 'Logged out on all devices')}>Log out everywhere</button>
        </section>

        <section className="rounded-xl border border-crit/30 bg-crit/5 p-3">
          <h3 className="font-semibold flex items-center gap-2 text-crit"><Trash2 size={15} />Delete my account and data</h3>
          <p className="text-muted mt-1">Permanently deletes your account, reviews, reports, bookings, listed chargers and photos. This cannot be undone.</p>
          <div className="mt-2 flex gap-2">
            <input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Type DELETE to confirm" aria-label="Type DELETE to confirm" />
            <button className="btn bg-crit text-white" disabled={busy || confirm !== 'DELETE'} onClick={() => run(async () => { await deleteAccount(); onClose() }, 'Your account and data were deleted')}>Delete</button>
          </div>
        </section>
      </div>
    </Modal>
  )
}
