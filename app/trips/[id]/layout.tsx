export const dynamic = "force-dynamic";
import { serverDb } from "@/lib/supabase";
import TripBackground from "@/components/TripBackground";
import DevPanel from "@/components/DevPanel";
import AIAssistant from "@/components/AIAssistant";
import AnomalyWatcher from "@/components/AnomalyWatcher";
import { isSuperAdmin } from "@/lib/admin";

export default async function TripLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  let imageUrl: string | null = null;
  try {
    const { data } = await serverDb()
      .from("trips")
      .select("background_image_url")
      .eq("id", params.id)
      .single();
    imageUrl = data?.background_image_url ?? null;
  } catch {
    // background is cosmetic — silently ignore errors
  }

  // The floating API log panel is a developer tool — only the project owner sees it.
  const showDevPanel = await isSuperAdmin();

  return (
    <TripBackground imageUrl={imageUrl}>
      {children}
      <AIAssistant />
      <AnomalyWatcher />
      {showDevPanel && <DevPanel />}
    </TripBackground>
  );
}
