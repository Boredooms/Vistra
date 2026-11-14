import { SignUp } from "@clerk/nextjs";
import { Wordmark } from "@/components/home/Chrome";

export default function Page() {
  return (
    <main className="grid min-h-screen place-items-center px-5 py-10">
      <div className="flex flex-col items-center gap-8">
        <Wordmark />
        <SignUp />
      </div>
    </main>
  );
}
