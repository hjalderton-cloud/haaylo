import { createEmailWebhookHandler } from '@lovable.dev/email-js'
import { createClient } from '@supabase/supabase-js'
import { createFileRoute } from '@tanstack/react-router'

type Outcome = 'bounce' | 'complaint' | 'unsubscribe'

const LOG_STATUS: Record<Outcome, 'bounced' | 'complained' | 'suppressed'> = {
  bounce: 'bounced',
  complaint: 'complained',
  unsubscribe: 'suppressed',
}

const LOG_MESSAGE: Record<Outcome, string> = {
  bounce: 'Permanent bounce — email address is invalid or rejected',
  complaint: 'Spam complaint — recipient marked email as spam',
  unsubscribe: 'Recipient unsubscribed',
}

export const Route = createFileRoute("/lovable/email/events")({
  server: {
    handlers: {
      POST: ({ request }) => {
        const apiKey = process.env['LOVABLE_API_KEY']
        const supabaseUrl = import.meta.env['VITE_SUPABASE_URL']
        const supabaseServiceKey = process.env['SUPABASE_SERVICE_ROLE_KEY']
        if (!apiKey || !supabaseUrl || !supabaseServiceKey) {
          console.error('Missing required environment variables')
          return Response.json({ error: 'Server configuration error' }, { status: 500 })
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        const record = async (
          eventId: string,
          recipient: string | undefined,
          outcome: Outcome,
        ) => {
          if (!recipient) return
          const email = recipient.toLowerCase()

          const { error: suppressError } = await supabase
            .from('suppressed_emails')
            .upsert({ email, reason: outcome, metadata: null }, { onConflict: 'email' })
          if (suppressError) {
            console.error('Failed to record suppression', {
              event_id: eventId,
              code: suppressError.code,
              message: suppressError.message,
            })
            throw new Error('Failed to record suppression')
          }

          const { error: logError } = await supabase.from('email_send_log').insert({
            message_id: null,
            template_name: 'system',
            recipient_email: email,
            status: LOG_STATUS[outcome],
            error_message: LOG_MESSAGE[outcome],
            metadata: null,
          })
          if (logError) {
            console.error('Failed to write email send log', {
              event_id: eventId,
              code: logError.code,
              message: logError.message,
            })
            throw new Error('Failed to write email send log')
          }
        }

        const handler = createEmailWebhookHandler({
          apiKey,
          on: {
            'email.bounced': async (event) => {
              await record(event.event_id, event.data.recipient, 'bounce')
            },
            'email.complaint': async (event) => {
              await record(event.event_id, event.data.recipient, 'complaint')
            },
            'email.unsubscribed': async (event) => {
              await record(event.event_id, event.data.recipient, 'unsubscribe')
            },
          },
        })
        return handler(request)
      },
    },
  },
})
