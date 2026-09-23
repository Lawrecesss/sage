"use client";

import { EmptyState } from "@/components/ui";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <EmptyState title="Something went wrong">
      <p>{error.message}</p>
      <button onClick={reset}>Try again</button>
    </EmptyState>
  );
}
