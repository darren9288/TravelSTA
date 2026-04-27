import DevPanel from "@/components/DevPanel";

export default function TripLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <DevPanel />
    </>
  );
}
