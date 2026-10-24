import { toast } from "@repo/ui/toast";

/** Puts {@code text} on the clipboard and says {@code done}, or asks the User to copy it themselves. */
export async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error("Couldn’t copy. Select the text and copy it yourself.");
  }
}
