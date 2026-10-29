import { Outlet } from "react-router";
import { SiteHeader } from "~/features/layout/SiteHeader";
import { SiteFooter } from "~/features/layout/SiteFooter";
import { MobileCartBar } from "~/features/layout/MobileCartBar";

export default function PublicLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <SiteFooter />
      <MobileCartBar />
    </div>
  );
}
