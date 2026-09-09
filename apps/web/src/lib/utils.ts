// shadcn/ui class-name helper. STUB — real impl pulls in clsx + tailwind-merge.
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
