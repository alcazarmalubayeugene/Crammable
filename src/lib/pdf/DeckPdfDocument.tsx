import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { App, type Deck, type Flashcard } from "@/lib/contracts";

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 11,
    fontFamily: "Helvetica",
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    color: "#8A6E52",
    marginBottom: 16,
  },
  category: {
    fontSize: 13,
    fontWeight: 700,
    marginTop: 14,
    marginBottom: 6,
    color: "#C47A2E",
  },
  card: {
    border: "1pt solid #E0C9A8",
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
  },
  front: {
    fontWeight: 700,
    marginBottom: 4,
  },
  back: {
    color: "#2E1A0C",
  },
});

function groupByCategory(cards: Flashcard[]): Map<string, Flashcard[]> {
  const groups = new Map<string, Flashcard[]>();
  for (const card of cards) {
    const key = card.category || "General";
    const list = groups.get(key);
    if (list) {
      list.push(card);
    } else {
      groups.set(key, [card]);
    }
  }
  return groups;
}

export function DeckPdfDocument({ deck, cards }: { deck: Deck; cards: Flashcard[] }) {
  const groups = groupByCategory(cards);

  return (
    <Document title={deck.title} author={App.name}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{deck.title}</Text>
        <Text style={styles.subtitle}>
          {cards.length} {cards.length === 1 ? "card" : "cards"} · exported from {App.name}
        </Text>

        {Array.from(groups.entries()).map(([category, categoryCards]) => (
          <View key={category} wrap={false}>
            <Text style={styles.category}>{category}</Text>
            {categoryCards.map((card) => (
              <View key={card.id} style={styles.card} wrap={false}>
                <Text style={styles.front}>Q: {card.front}</Text>
                <Text style={styles.back}>A: {card.back}</Text>
              </View>
            ))}
          </View>
        ))}
      </Page>
    </Document>
  );
}
