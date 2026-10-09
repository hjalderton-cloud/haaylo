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

const Email = () => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      You're on the Haaylo founding members list — here's what happens next.
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>You're on the list</Heading>
        <Text style={p}>Hi there,</Text>
        <Text style={p}>
          Thanks for joining the Haaylo founding members waitlist — you're
          officially on the list.
        </Text>
        <Text style={p}>
          Here's what happens next: founding member spots are limited to 25,
          given out first-come, first-served as they open. I'll email you
          personally the moment they're live, with a direct link to claim your
          spot.
        </Text>
        <Text style={p}>
          In the meantime, I'll occasionally send you a bit of what I'm
          building and why — no spam, just the real process.
        </Text>
        <Section style={callout}>
          <Text style={calloutTitle}>Quick reminder of what you're getting</Text>
          <Text style={calloutBody}>
            A full year of Pro access for <strong>£49</strong> as a founding
            member — only 25 spots. Here's what's already inside Haaylo:
          </Text>
          <Text style={calloutBody}>• The Strategy Profile — your brand voice, audience, and strategy in one place.</Text>
          <Text style={calloutBody}>• Competitor research — see what others are doing and where the gaps are.</Text>
          <Text style={calloutBody}>• A 90-day strategy — structured content pillars mapped to your business.</Text>
          <Text style={calloutBody}>• A content plan you can actually follow — organised and ready to execute.</Text>
          <Text style={calloutBody}>• Write for any platform — LinkedIn posts, newsletters, blogs, ads, and more.</Text>
          <Text style={calloutBody}>• SEO keywords — keyword ideas scanned for your brand.</Text>
          <Text style={calloutBody}>• Brainstorm chat — an AI assistant that already knows your strategy and voice.</Text>
          <Text style={calloutBody}>• Lead magnets, email sequences, and launch campaigns — built from your Brain.</Text>
          <Text style={calloutBody}>
            Plus first access to every new feature as it launches. In return, I
            just ask for your honest feedback as I keep improving it.
          </Text>
        </Section>
        <Text style={p}>Speak soon,</Text>
        <Text style={sig}>
          Hayley
          <br />
          <span style={sigMuted}>Founder, Haaylo</span>
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: "You're on the Haaylo founding members list",
  displayName: 'Waitlist welcome',
} satisfies TemplateEntry

const main: React.CSSProperties = {
  backgroundColor: '#ffffff',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
  padding: '24px 0',
}
const container: React.CSSProperties = {
  maxWidth: '560px',
  margin: '0 auto',
  padding: '32px 28px',
  backgroundColor: '#ffffff',
}
const h1: React.CSSProperties = {
  fontSize: '26px',
  lineHeight: 1.2,
  fontWeight: 800,
  color: '#141B3D',
  margin: '0 0 20px',
  letterSpacing: '-0.02em',
}
const p: React.CSSProperties = {
  fontSize: '16px',
  lineHeight: 1.6,
  color: '#2b2b3d',
  margin: '0 0 16px',
}
const callout: React.CSSProperties = {
  marginTop: '8px',
  marginBottom: '20px',
  padding: '18px 20px',
  borderRadius: '12px',
  backgroundColor: '#F5F2FF',
  border: '1px solid #E4DBFF',
}
const calloutTitle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#6E1FE0',
  margin: '0 0 10px',
}
const calloutBody: React.CSSProperties = {
  fontSize: '15px',
  lineHeight: 1.55,
  color: '#2b2b3d',
  margin: '0 0 10px',
}
const sig: React.CSSProperties = {
  fontSize: '16px',
  lineHeight: 1.5,
  color: '#141B3D',
  margin: '20px 0 0',
  fontWeight: 600,
}
const sigMuted: React.CSSProperties = { color: '#6b6b8a', fontWeight: 400 }
