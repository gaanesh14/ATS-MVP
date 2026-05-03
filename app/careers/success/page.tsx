import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ApplicationSuccessPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-16">
      <div className="max-w-md space-y-4 text-center">
        <CheckCircle2 className="mx-auto h-16 w-16 text-green-600" />
        <h1 className="text-3xl font-bold tracking-tight">Application received!</h1>
        <p className="text-muted-foreground">
          We will review your application and get back to you within 5 working days.
        </p>
        <div className="pt-4">
          <Button asChild variant="outline">
            <Link href="/careers">View other openings</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
