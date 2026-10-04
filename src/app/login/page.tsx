import LoginForm from "@/components/LoginForm";

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <main className="narrow">
      <h1>Threads Analytics</h1>
      <p className="muted">Sign in to create and view post-performance reports. Reports are private to your account.</p>
      <LoginForm initialError={searchParams.error ? "Sign-in link was invalid or expired. Please try again." : undefined} />
    </main>
  );
}
