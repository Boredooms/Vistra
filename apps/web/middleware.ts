import { clerkMiddleware } from "@clerk/nextjs/server";

// Clerk Core 3: middleware only attaches auth state. Each protected resource checks auth itself
// (app/dashboard/layout.tsx calls auth.protect(); route handlers call auth()).
export default clerkMiddleware();

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/(api|trpc)(.*)"],
};
