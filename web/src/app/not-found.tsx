import { ButtonLink, EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <EmptyState title="Not found">
      <p>That page, signal or metric doesn&apos;t exist.</p>
      <ButtonLink href="/" variant="ghost">
        Back to the brief
      </ButtonLink>
    </EmptyState>
  );
}
