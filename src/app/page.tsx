export default function Home() {
  return (
    <main className="min-h-screen" style={{ background: "#FAF2E4", color: "#2E1A0C", fontFamily: "var(--font-dm-sans, sans-serif)" }}>

      {/* ── NAVBAR ── */}
      <nav style={{ background: "#2E1A0C", borderBottom: "1px solid #4A2512", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1024, margin: "0 auto", padding: "0 24px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 26 }}>🦫</span>
            <span style={{ fontFamily: "var(--font-lora, serif)", fontWeight: 700, fontSize: 20, color: "#FAF2E4", letterSpacing: "-0.3px" }}>
              Crammable
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <a href="/login" style={{ fontSize: 14, color: "#C49A6C", textDecoration: "none" }}>
              Log in
            </a>
            <a
              href="/signup"
              style={{ fontSize: 14, background: "#C47A2E", color: "#FAF2E4", padding: "8px 18px", borderRadius: 9, textDecoration: "none", fontWeight: 600 }}
            >
              Get Started Free
            </a>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{ maxWidth: 1024, margin: "0 auto", padding: "80px 24px 60px", textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#E0C9A8", color: "#8A6E52", fontSize: 13, padding: "6px 16px", borderRadius: 999, marginBottom: 24 }}>
          <span>🎓</span>
          <span>Built for Filipino university students</span>
        </div>

        <h1 style={{ fontFamily: "var(--font-lora, serif)", fontSize: "clamp(2rem, 5vw, 3.5rem)", fontWeight: 700, color: "#2E1A0C", lineHeight: 1.2, marginBottom: 20 }}>
          Turn any document into a{" "}
          <span style={{ color: "#C47A2E" }}>flashcard deck</span>
          {" "}— in seconds.
        </h1>

        <p style={{ fontSize: 17, color: "#8A6E52", maxWidth: 600, margin: "0 auto 40px", lineHeight: 1.7 }}>
          Upload your PDF reviewer and Crammable&apos;s AI instantly generates
          flashcards and quizzes — even from scanned, photocopied handouts.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 14 }}>
          <a
            href="/signup"
            style={{ background: "#C47A2E", color: "#FAF2E4", padding: "14px 32px", borderRadius: 12, fontSize: 15, fontWeight: 600, textDecoration: "none" }}
          >
            Start for Free — 3 credits included
          </a>
          <a
            href="#how-it-works"
            style={{ border: "1.5px solid #E0C9A8", color: "#8A6E52", padding: "14px 32px", borderRadius: 12, fontSize: 15, textDecoration: "none" }}
          >
            See how it works
          </a>
        </div>

        <p style={{ marginTop: 16, fontSize: 13, color: "#8A6E52" }}>
          No credit card required · ₱150/month for Pro
        </p>
      </section>

      {/* ── CAPY MASCOT ── */}
      <section style={{ display: "flex", justifyContent: "center", paddingBottom: 64, padding: "0 24px 64px" }}>
        <div style={{ background: "#FFFCF7", border: "1.5px solid #E0C9A8", borderRadius: 20, padding: 32, textAlign: "center", maxWidth: 320 }}>
          <div style={{ fontSize: 72, marginBottom: 16 }}>🦫</div>
          <p style={{ color: "#8A6E52", fontSize: 14, fontStyle: "italic", margin: 0 }}>
            &quot;Upload a document and I&apos;ll make your first deck.&quot;
          </p>
          <p style={{ color: "#C47A2E", fontSize: 12, fontWeight: 600, marginTop: 8 }}>
            — Capy, your study buddy
          </p>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" style={{ background: "#FFFCF7", borderTop: "1px solid #E0C9A8", borderBottom: "1px solid #E0C9A8", padding: "80px 24px" }}>
        <div style={{ maxWidth: 1024, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "var(--font-lora, serif)", fontSize: 26, fontWeight: 700, textAlign: "center", marginBottom: 10 }}>
            How it works
          </h2>
          <p style={{ color: "#8A6E52", textAlign: "center", marginBottom: 52, fontSize: 15 }}>
            Three steps. No typing. No stress.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 36 }}>
            {[
              { icon: "📄", title: "Upload your PDF", desc: "Any format — text PDFs, scanned handouts, photocopied reviewers. Even the blurry ones." },
              { icon: "🤖", title: "AI generates your deck", desc: "DeepSeek AI reads your document and creates accurate flashcards and quiz questions in seconds." },
              { icon: "🧠", title: "Study smarter", desc: "Flip cards, take quizzes, and let Living Decks reinforce your weak areas automatically." },
            ].map((item) => (
              <div key={item.title} style={{ textAlign: "center" }}>
                <div style={{ width: 56, height: 56, background: "#FBF0E0", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                  <span style={{ fontSize: 26 }}>{item.icon}</span>
                </div>
                <h3 style={{ fontFamily: "var(--font-lora, serif)", fontWeight: 600, fontSize: 17, marginBottom: 8 }}>{item.title}</h3>
                <p style={{ color: "#8A6E52", fontSize: 14, lineHeight: 1.6 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section style={{ padding: "80px 24px" }}>
        <div style={{ maxWidth: 1024, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "var(--font-lora, serif)", fontSize: 26, fontWeight: 700, textAlign: "center", marginBottom: 10 }}>
            Everything you need to pass
          </h2>
          <p style={{ color: "#8A6E52", textAlign: "center", marginBottom: 48, fontSize: 15 }}>
            Built for Philippine university exam culture.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
            {[
              { icon: "📸", title: "OCR for scanned PDFs", desc: "Handles blurry, photocopied reviewers that other apps cannot read." },
              { icon: "🔄", title: "Living Decks", desc: "After every quiz, weak cards get new angles so you actually learn them. (Pro)" },
              { icon: "📝", title: "Multiple quiz modes", desc: "Multiple choice and identification — both common in Philippine board exams." },
              { icon: "💳", title: "Pay via GCash", desc: "No international card needed. ₱150/month, verified within 2 hours." },
              { icon: "🎯", title: "Deep-dive mode", desc: "Extracts counter-arguments and edge cases, not just surface definitions. (Pro)" },
              { icon: "👥", title: "Earn credits by sharing", desc: "Invite classmates, share decks, earn extra generations for free." },
            ].map((f) => (
              <div key={f.title} style={{ display: "flex", gap: 16, padding: 20, border: "1.5px solid #E0C9A8", borderRadius: 14, background: "#FFFCF7" }}>
                <span style={{ fontSize: 24, flexShrink: 0, marginTop: 2 }}>{f.icon}</span>
                <div>
                  <h3 style={{ fontWeight: 600, marginBottom: 4, fontSize: 15 }}>{f.title}</h3>
                  <p style={{ fontSize: 13, color: "#8A6E52", lineHeight: 1.6 }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section style={{ background: "#FFFCF7", borderTop: "1px solid #E0C9A8", borderBottom: "1px solid #E0C9A8", padding: "80px 24px" }}>
        <div style={{ maxWidth: 1024, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "var(--font-lora, serif)", fontSize: 26, fontWeight: 700, textAlign: "center", marginBottom: 10 }}>
            Simple pricing
          </h2>
          <p style={{ color: "#8A6E52", textAlign: "center", marginBottom: 52, fontSize: 15 }}>
            Start free. Upgrade when exam season hits.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, maxWidth: 720, margin: "0 auto" }}>

            {/* Free */}
            <div style={{ border: "1.5px solid #E0C9A8", borderRadius: 20, padding: 28 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "#8A6E52", marginBottom: 4 }}>Free</div>
              <div style={{ fontFamily: "var(--font-lora, serif)", fontSize: 40, fontWeight: 700, marginBottom: 4 }}>₱0</div>
              <div style={{ fontSize: 13, color: "#8A6E52", marginBottom: 24 }}>Forever free · No card required</div>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 28px", display: "flex", flexDirection: "column", gap: 12 }}>
                {["3 starter credits on signup", "Earn more by inviting classmates", "Up to 3 decks stored", "20 cards per deck", "15 pages per upload", "Full quiz engine", "OCR for scanned PDFs"].map((f) => (
                  <li key={f} style={{ fontSize: 14, color: "#8A6E52", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "#5C7A35", fontWeight: 700 }}>✓</span> {f}
                  </li>
                ))}
              </ul>
              <a href="/signup" style={{ display: "block", textAlign: "center", border: "1.5px solid #C47A2E", color: "#C47A2E", padding: "10px 0", borderRadius: 10, fontWeight: 600, fontSize: 14, textDecoration: "none" }}>
                Get started free
              </a>
            </div>

            {/* Pro */}
            <div style={{ border: "2px solid #C47A2E", borderRadius: 20, padding: 28, position: "relative" }}>
              <div style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", background: "#C47A2E", color: "#FAF2E4", fontSize: 12, padding: "4px 14px", borderRadius: 999, fontWeight: 600, whiteSpace: "nowrap" }}>
                Most popular
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "#C47A2E", marginBottom: 4 }}>Pro</div>
              <div style={{ fontFamily: "var(--font-lora, serif)", fontSize: 40, fontWeight: 700, marginBottom: 4 }}>₱150</div>
              <div style={{ fontSize: 13, color: "#8A6E52", marginBottom: 24 }}>per month · Pay via GCash</div>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 28px", display: "flex", flexDirection: "column", gap: 12 }}>
                {["30 credits every month", "Unlimited decks", "Unlimited cards per deck", "50 pages per upload", "Deep-dive analysis mode", "Living Decks (auto-refresh)", "PDF export"].map((f) => (
                  <li key={f} style={{ fontSize: 14, color: "#2E1A0C", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "#5C7A35", fontWeight: 700 }}>✓</span> {f}
                  </li>
                ))}
              </ul>
              <a href="/signup" style={{ display: "block", textAlign: "center", background: "#C47A2E", color: "#FAF2E4", padding: "10px 0", borderRadius: 10, fontWeight: 600, fontSize: 14, textDecoration: "none" }}>
                Upgrade to Pro
              </a>
            </div>

          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ padding: "40px 24px", textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 22 }}>🦫</span>
          <span style={{ fontFamily: "var(--font-lora, serif)", fontWeight: 700, color: "#C47A2E", fontSize: 17 }}>Crammable</span>
        </div>
        <p style={{ fontSize: 14, color: "#8A6E52" }}>
          Turn any document into a flashcard deck — in seconds.
        </p>
        <p style={{ fontSize: 12, color: "#8A6E52", marginTop: 14 }}>
          © 2026 Crammable · Built for Filipino students ·{" "}
          <a href="mailto:support@crammable.ph" style={{ color: "#C47A2E" }}>
            support@crammable.ph
          </a>
        </p>
        <p style={{ fontSize: 12, color: "#8A6E52", marginTop: 8, maxWidth: 480, margin: "8px auto 0" }}>
          AI-generated content may contain errors. Always verify against your official course materials and textbooks.
        </p>
      </footer>

    </main>
  );
}
