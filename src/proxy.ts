import { auth } from "@/lib/auth/server";

// Only the signed-in screens run through the auth check; landing and /masuk stay public.
export default auth.middleware({ loginUrl: "/masuk" });

export const config = {
  matcher: ["/dashboard/:path*", "/pengaturan/:path*", "/rakit/:path*"],
};
