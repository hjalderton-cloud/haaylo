import type { ComponentType } from 'react'
import { template as waitlistWelcome } from './waitlist-welcome'
import { template as foundingRenewal } from './founding-renewal'
import { template as membershipWelcome } from './membership-welcome'
import { template as paymentFailed } from './payment-failed'



export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  'waitlist-welcome': waitlistWelcome,
  'founding-renewal': foundingRenewal,
  'membership-welcome': membershipWelcome,
  'payment-failed': paymentFailed,
}

