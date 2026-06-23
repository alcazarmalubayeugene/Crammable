export default function Home() {
  return (
    <main className="min-h-screen" style={{ background: "var(--bg)", color: "var(--text)", fontFamily: "var(--font-body, sans-serif)" }}>

      {/* ── NAVBAR ── */}
      <nav style={{ background: "var(--nav-bg)", borderBottom: "1px solid var(--nav-border)", position: "sticky", top: 0, zIndex: 50 }}>
        <div className="nav-row" style={{ maxWidth: "100%", margin: "0 auto", padding: "0 24px", minHeight: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: "var(--font-display, serif)", fontWeight: 700, fontSize: "calc(20px * var(--font-scale))", color: "var(--nav-text)", letterSpacing: "-0.3px" }}>
              Crammable
            </span>
          </div>
          <div className="nav-cluster" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <a href="/login" className="nav-link" style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--text-faint)", textDecoration: "none" }}>
              Log in
            </a>
            <a
              href="/signup"
              style={{ fontSize: "calc(14px * var(--font-scale))", background: "var(--primary)", color: "var(--nav-text)", padding: "8px 18px", borderRadius: 9, textDecoration: "none", fontWeight: 600 }}
            >
              Get Started Free
            </a>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{ maxWidth: 1024, margin: "0 auto", padding: "80px 24px 60px", textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--border)", color: "var(--text-muted)", fontSize: "calc(13px * var(--font-scale))", padding: "6px 16px", borderRadius: 999, marginBottom: 24 }}>
          <span>🎓</span>
          <span>Built for Filipino university students</span>
        </div>

        <h1 style={{ fontFamily: "var(--font-display, serif)", fontSize: "clamp(2rem, 5vw, 3.5rem)", fontWeight: 700, color: "var(--text)", lineHeight: 1.2, marginBottom: 20 }}>
          Turn any document into a{" "}
          <span style={{ color: "var(--primary)" }}>flashcard deck</span>
          {" "}— in seconds.
        </h1>

        <p style={{ fontSize: "calc(17px * var(--font-scale))", color: "var(--text-muted)", maxWidth: 600, margin: "0 auto 40px", lineHeight: 1.7 }}>
          Upload your PDF reviewer and Crammable&apos;s AI instantly generates
          flashcards and quizzes — even from scanned, photocopied handouts.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 14 }}>
          <a
            href="/signup"
            style={{ background: "var(--primary)", color: "var(--nav-text)", padding: "14px 32px", borderRadius: 12, fontSize: "calc(15px * var(--font-scale))", fontWeight: 600, textDecoration: "none" }}
          >
            Start for Free — 3 Capycoins included
          </a>
          <a
            href="#how-it-works"
            style={{ border: "1.5px solid var(--border)", color: "var(--text-muted)", padding: "14px 32px", borderRadius: 12, fontSize: "calc(15px * var(--font-scale))", textDecoration: "none" }}
          >
            See how it works
          </a>
        </div>

        <p style={{ marginTop: 16, fontSize: "calc(13px * var(--font-scale))", color: "var(--text-muted)" }}>
          No credit card required · ₱150/month for Pro
        </p>
      </section>

      {/* ── CAPY MASCOT ── */}
      <section style={{ display: "flex", justifyContent: "center", paddingBottom: 64, padding: "0 24px 64px" }}>
        <div style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)", borderRadius: 20, padding: 32, textAlign: "center", maxWidth: 320 }}>
          <p style={{ color: "var(--text-muted)", fontSize: "calc(14px * var(--font-scale))", fontStyle: "italic", margin: 0 }}>
            &quot;Upload a document and I&apos;ll make your first deck.&quot;
          </p>
          <p style={{ color: "var(--primary)", fontSize: "calc(12px * var(--font-scale))", fontWeight: 600, marginTop: 8 }}>
            — Capy, your study buddy
          </p>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" style={{ background: "var(--bg-card)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", padding: "80px 24px" }}>
        <div style={{ maxWidth: 1024, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "var(--font-display, serif)", fontSize: "calc(26px * var(--font-scale))", fontWeight: 700, textAlign: "center", marginBottom: 10 }}>
            How it works
          </h2>
          <p style={{ color: "var(--text-muted)", textAlign: "center", marginBottom: 52, fontSize: "calc(15px * var(--font-scale))" }}>
            Three steps. No typing. No stress.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 36 }}>
            {[
              { icon: "📄", title: "Upload your PDF", desc: "Any format — text PDFs, scanned handouts, photocopied reviewers. Even the blurry ones." },
              { icon: "🤖", title: "AI generates your deck", desc: "DeepSeek AI reads your document and creates accurate flashcards and quiz questions in seconds." },
              { icon: "🧠", title: "Study smarter", desc: "Flip cards, take quizzes, and let Living Decks reinforce your weak areas automatically." },
            ].map((item) => (
              <div key={item.title} style={{ textAlign: "center" }}>
                <div style={{ width: 56, height: 56, background: "var(--bg-subtle)", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                  <span style={{ fontSize: "calc(26px * var(--font-scale))" }}>{item.icon}</span>
                </div>
                <h3 style={{ fontFamily: "var(--font-display, serif)", fontWeight: 600, fontSize: "calc(17px * var(--font-scale))", marginBottom: 8 }}>{item.title}</h3>
                <p style={{ color: "var(--text-muted)", fontSize: "calc(14px * var(--font-scale))", lineHeight: 1.6 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section style={{ padding: "80px 24px" }}>
        <div style={{ maxWidth: 1024, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "var(--font-display, serif)", fontSize: "calc(26px * var(--font-scale))", fontWeight: 700, textAlign: "center", marginBottom: 10 }}>
            Everything you need to pass
          </h2>
          <p style={{ color: "var(--text-muted)", textAlign: "center", marginBottom: 48, fontSize: "calc(15px * var(--font-scale))" }}>
            Built for Philippine university exam culture.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
            {[
              { icon: "📸", title: "OCR for scanned PDFs", desc: "Handles blurry, photocopied reviewers that other apps cannot read." },
              { icon: "🔄", title: "Living Decks", desc: "After every quiz, weak cards get new angles so you actually learn them. (Pro)" },
              { icon: "📝", title: "Multiple quiz modes", desc: "Multiple choice and identification — both common in Philippine board exams." },
              { icon: "💳", title: "Pay via GCash", desc: "No international card needed. ₱150/month, verified within 2 hours." },
              { icon: "🎯", title: "Deep-dive mode", desc: "Extracts counter-arguments and edge cases, not just surface definitions. (Pro)" },
              { icon: "👥", title: "Earn Capycoins by sharing", desc: "Invite classmates, share decks, earn extra generations for free." },
            ].map((f) => (
              <div key={f.title} style={{ display: "flex", gap: 16, padding: 20, border: "1.5px solid var(--border)", borderRadius: 14, background: "var(--bg-card)" }}>
                <span style={{ fontSize: "calc(24px * var(--font-scale))", flexShrink: 0, marginTop: 2 }}>{f.icon}</span>
                <div>
                  <h3 style={{ fontWeight: 600, marginBottom: 4, fontSize: "calc(15px * var(--font-scale))" }}>{f.title}</h3>
                  <p style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--text-muted)", lineHeight: 1.6 }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section style={{ background: "var(--bg-card)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", padding: "80px 24px" }}>
        <div style={{ maxWidth: 1024, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "var(--font-display, serif)", fontSize: "calc(26px * var(--font-scale))", fontWeight: 700, textAlign: "center", marginBottom: 10 }}>
            Simple pricing
          </h2>
          <p style={{ color: "var(--text-muted)", textAlign: "center", marginBottom: 52, fontSize: "calc(15px * var(--font-scale))" }}>
            Start free. Upgrade when exam season hits.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, maxWidth: 720, margin: "0 auto" }}>

            {/* Free */}
            <div style={{ border: "1.5px solid var(--border)", borderRadius: 20, padding: 28 }}>
              <div style={{ fontSize: "calc(13px * var(--font-scale))", fontWeight: 500, color: "var(--text-muted)", marginBottom: 4 }}>Free</div>
              <div style={{ fontFamily: "var(--font-display, serif)", fontSize: "calc(40px * var(--font-scale))", fontWeight: 700, marginBottom: 4 }}>₱0</div>
              <div style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--text-muted)", marginBottom: 24 }}>Forever free · No card required</div>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 28px", display: "flex", flexDirection: "column", gap: 12 }}>
                {["3 starter Capycoins on signup", "Earn more by inviting classmates", "Up to 3 decks stored", "20 cards per deck", "15 pages per upload", "Full quiz engine", "OCR for scanned PDFs"].map((f) => (
                  <li key={f} style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "var(--success)", fontWeight: 700 }}>✓</span> {f}
                  </li>
                ))}
              </ul>
              <a href="/signup" style={{ display: "block", textAlign: "center", border: "1.5px solid var(--primary)", color: "var(--primary)", padding: "10px 0", borderRadius: 10, fontWeight: 600, fontSize: "calc(14px * var(--font-scale))", textDecoration: "none" }}>
                Get started free
              </a>
            </div>

            {/* Pro */}
            <div style={{ border: "2px solid var(--primary)", borderRadius: 20, padding: 28, position: "relative" }}>
              <div style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", background: "var(--primary)", color: "var(--nav-text)", fontSize: "calc(12px * var(--font-scale))", padding: "4px 14px", borderRadius: 999, fontWeight: 600, whiteSpace: "nowrap" }}>
                Most popular
              </div>
              <div style={{ fontSize: "calc(13px * var(--font-scale))", fontWeight: 500, color: "var(--primary)", marginBottom: 4 }}>Pro</div>
              <div style={{ fontFamily: "var(--font-display, serif)", fontSize: "calc(40px * var(--font-scale))", fontWeight: 700, marginBottom: 4 }}>₱150</div>
              <div style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--text-muted)", marginBottom: 24 }}>per month · Pay via GCash</div>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 28px", display: "flex", flexDirection: "column", gap: 12 }}>
                {["30 Capycoins every month", "Unlimited decks", "Unlimited cards per deck", "50 pages per upload", "Deep-dive analysis mode", "Living Decks (auto-refresh)", "PDF export"].map((f) => (
                  <li key={f} style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--text)", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "var(--success)", fontWeight: 700 }}>✓</span> {f}
                  </li>
                ))}
              </ul>
              <a href="/signup" style={{ display: "block", textAlign: "center", background: "var(--primary)", color: "var(--nav-text)", padding: "10px 0", borderRadius: 10, fontWeight: 600, fontSize: "calc(14px * var(--font-scale))", textDecoration: "none" }}>
                Upgrade to Pro
              </a>
            </div>

          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ padding: "40px 24px", textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontFamily: "var(--font-display, serif)", fontWeight: 700, color: "var(--primary)", fontSize: "calc(17px * var(--font-scale))" }}>Crammable</span>
        </div>
        <p style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--text-muted)" }}>
          Turn any document into a flashcard deck — in seconds.
        </p>
        <p style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--text-muted)", marginTop: 14 }}>
          © 2026 Crammable · Built for Filipino students ·{" "}
          <a href="mailto:support@crammable.ph" style={{ color: "var(--primary)" }}>
            support@crammable.ph
          </a>
        </p>
        <p style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--text-muted)", marginTop: 8, maxWidth: 480, margin: "8px auto 0" }}>
          AI-generated content may contain errors. Always verify against your official course materials and textbooks.
        </p>
      </footer>

    </main>
  );
}
