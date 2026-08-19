import { LoginForm } from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function Login(props: PageProps<"/login">) {
  const { next } = await props.searchParams;
  // Only ever bounce back to a path on this site, so the redirect cannot be
  // pointed at someone else's domain.
  const target = typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
    ? next
    : "/";

  return (
    <main className="flex min-h-full flex-1 items-center justify-center px-6 py-16">
      <LoginForm next={target} />
    </main>
  );
}
