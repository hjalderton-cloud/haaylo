import React from 'react'
import {
  Body,
  Button,
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
  planLabel?: string
  priceLabel?: string
  renewalDate?: string
  startUrl?: string
}

const Email = ({ planLabel, priceLabel, renewalDate, startUrl }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You're in — here's how to get your first content out today.</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Welcome to haaylo</Heading>
        <Text style={p}>Hi there,</Text>
        <Text style={p}>
          Your payment went through and your membership is live. Thanks for
          joining.
        </Text>
        <Section style={callout}>
          <Text style={calloutBody}>
            <strong>Plan:</strong> {planLabel || 'haaylo membership'}
            <br />
            <strong>Price:</strong> {priceLabel || '£49'}
            {renewalDate ? (
              <>
                <br />
                <strong>Renews:</strong> {renewalDate}
              </>
            ) : null}
          </Text>
        </Section>
        <Text style={p}>
          The one thing to do next is set up your Strategy Profile. It takes a few
          minutes and everything haaylo writes for you — your brand voice, your
          90-day plan, every caption — comes out of it.
        </Text>
        <Button style={btn} href={startUrl || 'https://haaylo.com/brain'}>
          Set up your Strategy Profile
        </Button>
        <Text style={p}>
          You can manage or cancel your membership any time from Account &amp;
          billing inside haaylo.
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
const callout = {
  background: '#f4f5fb',
  borderRadius: '12px',
  padding: '16px',
  margin: '16px 0',
}
const calloutBody = { color: '#141B3D', fontSize: '14px', lineHeight: '1.7', margin: 0 }
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
  subject: "You're in — welcome to haaylo",
  displayName: 'Membership welcome',
  previewData: {
    planLabel: 'Founding Member',
    priceLabel: '£49 for your first year',
    renewalDate: '1 November 2027',
    startUrl: 'https://haaylo.com/brain',
  },
}
