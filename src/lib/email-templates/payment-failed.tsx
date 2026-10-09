import React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  amountLabel?: string
  billingUrl?: string
}

const Email = ({ amountLabel, billingUrl }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>We couldn't take your haaylo payment — update your card to keep access.</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Your payment didn't go through</Heading>
        <Text style={p}>Hi there,</Text>
        <Text style={p}>
          We tried to take your haaylo membership payment
          {amountLabel ? ` of ${amountLabel}` : ''} and your card was declined.
          Nothing is lost — your Brain, plans and content are all still there.
        </Text>
        <Text style={p}>
          Update your card and we'll retry straight away. If it stays unpaid,
          access pauses until it's sorted.
        </Text>
        <Button style={btn} href={billingUrl || 'https://haaylo.com/account'}>
          Update payment details
        </Button>
        <Text style={p}>
          If you think this is a mistake, just reply to this email and we'll take
          a look.
        </Text>
        <Text style={sig}>
          Hayley
          <br />
          haaylo
        </Text>
      </Container>
    </Body>
  </Html>
)

const main = { backgroundColor: '#ffffff', fontFamily: 'system-ui, sans-serif' }
const container = { margin: '0 auto', padding: '32px 24px', maxWidth: '560px' }
const h1 = { color: '#141B3D', fontSize: '24px', margin: '0 0 16px' }
const p = { color: '#3b3f5c', fontSize: '15px', lineHeight: '1.6' }
const btn = {
  background: '#FF5C93',
  color: '#ffffff',
  borderRadius: '10px',
  padding: '12px 20px',
  fontSize: '15px',
  fontWeight: 700,
  textDecoration: 'none',
  display: 'inline-block',
  margin: '8px 0 18px',
}
const sig = { color: '#141B3D', fontSize: '15px', marginTop: '20px' }

export const template: TemplateEntry = {
  component: Email,
  subject: "Your haaylo payment didn't go through",
  displayName: 'Payment failed',
  previewData: { amountLabel: '£49.00', billingUrl: 'https://haaylo.com/account' },
}
