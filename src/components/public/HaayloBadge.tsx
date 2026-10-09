/** Quiet footer credit shown on public pages. */
export function HaayloBadge() {
  return (
    <footer
      style={{
        borderTop: "1px solid rgba(20,27,61,0.10)",
        padding: "16px 20px",
        textAlign: "center",
        fontSize: 12.5,
        color: "#6B7192",
        background: "transparent",
      }}
    >
      <a
        href="https://haaylo.com"
        target="_blank"
        rel="noreferrer noopener"
        style={{ color: "inherit", textDecoration: "none" }}
      >
        Powered by Haaylo — Build your own 90-day content and landing pages here.
      </a>
    </footer>
  );
}
