import React from 'react'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  renewalDate?: string
}

const Email = ({ renewalDate }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your haaylo founding year ends soon — here's what changes.</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Your founding year is ending</Heading>
        <Text style={p}>Hi there,</Text>
        <Text style={p}>
          A quick heads-up: your haaylo Founding Member year ends on{' '}
          <strong>{renewalDate || 'your renewal date'}</strong>.
        </Text>
        <Section style={callout}>
          <Text style={calloutBody}>
            From that date your membership continues automatically at{' '}
            <strong>£49/month</strong>. Nothing else changes — you keep the
            Strategy Profile, the Engine, your 90-day strategy, the content
            planner, competitor radar and every new feature we ship.
          </Text>
        </Section>
        <Text style={p}>
          If you'd like to change or cancel your membership, you can do that any
          time from Account &amp; billing inside haaylo.
        </Text>
        <Text style={p}>Thanks for being one of the first.</Text>
        <Text style={sig}>
          Hayley
          <br />
          haaylo
        </Text>
      </Container>
    </Body>
  </Html>
)

const main = { backgroundColor: '#0f1330', fontFamily: 'system-ui, sans-serif' }
const container = { margin: '0 auto', padding: '32px 24px', maxWidth: '560px' }
const h1 = { color: '#ffffff', fontSize: '24px', margin: '0 0 16px' }
const p = { color: '#d7d7ea', fontSize: '15px', lineHeight: '1.6' }
const callout = {
  background: '#1a2050',
  borderRadius: '12px',
  padding: '16px',
  margin: '16px 0',
}
const calloutBody = { color: '#e9e9f7', fontSize: '14px', lineHeight: '1.6', margin: 0 }
const sig = { color: '#ffffff', fontSize: '15px', marginTop: '20px' }

export const template: TemplateEntry = {
  component: Email,
  subject: 'Your haaylo founding year ends soon',
  displayName: 'Founding renewal reminder',
  previewData: { renewalDate: '1 November 2027' },
}
