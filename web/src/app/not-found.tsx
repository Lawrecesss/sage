import { ArrowLeft, FileQuestion } from "lucide-react";
import shell from "@/components/shell/shell.module.css";
import { ButtonLink, EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <div className={shell.page}>
      <EmptyState
        title="Not found"
        icon={FileQuestion}
        action={
          <ButtonLink href="/" variant="secondary" icon={ArrowLeft}>
            Back to chat
          </ButtonLink>
        }
      >
        <p>That page, signal or metric doesn&apos;t exist.</p>
      </EmptyState>
    </div>
  );
}
