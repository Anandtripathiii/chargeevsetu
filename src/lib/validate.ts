// Input validation (zod) for everything a visitor sends. The database repeats these limits as CHECK constraints.
import { z } from 'zod'

// shortcut: a short list of the most common leaked passwords; Supabase's leaked-password protection (dashboard) covers the rest
const COMMON = new Set(['password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwerty123', 'qwertyuiop', '11111111',
  'iloveyou', 'admin123', 'welcome1', 'abc12345', 'letmein1', 'india123', 'india@123', 'Password@123', 'passw0rd', '00000000', '87654321'])

export const email = z.string().trim().toLowerCase().email('Please enter a valid email address.').max(254)
export const loginPassword = z.string().min(1, 'Please enter your password.').max(128)
export const newPassword = z.string()
  .min(8, 'Password must be at least 8 characters.')
  .max(128, 'Password is too long.')
  .refine((p) => !COMMON.has(p) && !COMMON.has(p.toLowerCase()), 'This password is too common. Please choose another.')
  .refine((p) => /[a-zA-Z]/.test(p) && /[^a-zA-Z]/.test(p), 'Use letters and at least one number or symbol.')
export const personName = z.string().trim().max(100, 'Name must be 100 characters or less.')

export const review = z.object({
  station_id: z.string().min(1).max(64),
  rating: z.number().int().min(1, 'Please choose 1 to 5 stars.').max(5, 'Please choose 1 to 5 stars.'),
  body: z.string().trim().max(1000, 'Review must be 1000 characters or less.'),
})
export const report = z.object({
  station_id: z.string().min(1).max(64),
  kind: z.enum(['broken', 'wrong_location', 'blocked', 'other']),
  note: z.string().trim().max(1000, 'Note must be 1000 characters or less.'),
})
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const photo = z.custom<File>((f) => f instanceof File && IMAGE_TYPES.includes(f.type) && f.size <= 5 * 1024 * 1024,
  'Photos must be JPG, PNG or WebP images under 5 MB.')

export const homeCharger = z.object({
  title: z.string().trim().min(3, 'Please add a short title.').max(120),
  area: z.string().trim().min(2, 'Please enter the area.').max(120),
  type: z.enum(['AC', 'DC']),
  power_kw: z.number().positive('Power must be above 0 kW.').max(150, 'Power must be 150 kW or less.'),
  connector: z.enum(['Type 2', '15A socket', 'CCS2', 'Bharat AC-001', 'Bharat DC-001', 'CHAdeMO']),
  price_kwh: z.number().min(5, 'Price must be ₹5–30 per kWh.').max(30, 'Price must be ₹5–30 per kWh.'),
  hours: z.string().trim().max(60),
  lon: z.number().min(68).max(98),
  lat: z.number().min(6).max(37.5),
})
export const address = z.string().trim().min(5, 'Please enter the full address.').max(300)
export const booking = z.object({
  start_at: z.string().datetime({ offset: true }).refine((s) => Date.parse(s) > Date.now() - 10 * 60e3, 'Please pick a time in the future.'),
  hours: z.number().positive().max(12, 'A booking can be at most 12 hours.'),
})
export const install = z.object({
  name: z.string().trim().min(1, 'Please enter your name.').max(100),
  phone: z.string().trim().regex(/^[\d +-]{8,15}$/, 'Please enter a valid phone number.'),
  city: z.string().trim().min(2, 'Please enter your city.').max(80),
  kind: z.enum(['home_ac', 'high_power']),
  notes: z.string().trim().max(1000),
})

/** Parse or throw an Error with the first friendly message. */
export function check<T>(schema: z.ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data)
  if (!r.success) throw new Error(r.error.issues[0]?.message ?? 'Please check your input.')
  return r.data
}
