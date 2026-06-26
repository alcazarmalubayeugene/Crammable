import { AppProfileProvider } from "./AppProfileContext";

/**
 * Authenticated route-group layout. Wraps every signed-in page (dashboard,
 * decks, quiz, settings, rewards, upgrade, admin, onboarding) so the auth check
 * and profile fetch run once here — via <AppProfileProvider> / useAppProfile() —
 * instead of being duplicated in each page. Route groups don't affect URLs, so
 * paths like /dashboard are unchanged.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppProfileProvider>{children}</AppProfileProvider>;
}
