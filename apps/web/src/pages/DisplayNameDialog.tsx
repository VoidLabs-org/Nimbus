import { Button, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { toast } from "@repo/ui/toast";
import { WindowFrame } from "../access/WindowFrame";
import { ApiError, displayNameError, tooManyAttemptsMessage } from "@repo/api";
import { useSession } from "../auth/useSession";
import dialogs from "./DisconnectDialogs.module.css";
import email from "./ChangeEmailDialog.module.css";

/** Edit on Profile's Display name row: the same window as Change password (39m), with the name in it. */
export function DisplayNameDialog({
  opened,
  current,
  onClose,
}: {
  opened: boolean;
  current: string;
  onClose: () => void;
}) {
  return (
    <WindowFrame
      opened={opened}
      onClose={onClose}
      title="Edit display name"
      subtitle="How you appear to your team."
    >
      {/* Inside the window, so each time it opens the form starts from the saved name. */}
      <DisplayNameForm current={current} onDone={onClose} />
    </WindowFrame>
  );
}

function DisplayNameForm({ current, onDone }: { current: string; onDone: () => void }) {
  const { updateDisplayName } = useSession();
  const form = useForm({
    initialValues: { displayName: current },
    validate: { displayName: displayNameError },
  });

  async function submit({ displayName }: { displayName: string }) {
    try {
      await updateDisplayName(displayName.trim());
      toast.success("Display name saved.");
      onDone();
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors.displayName) {
        form.setFieldError("displayName", error.fieldErrors.displayName);
      } else if (error instanceof ApiError && error.status === 429) {
        form.setFieldError("displayName", tooManyAttemptsMessage(error.retryAfterSeconds));
      } else {
        form.setFieldError("displayName", "Couldn't save your name. Please try again.");
      }
    }
  }

  return (
    <form className={email.body} onSubmit={form.onSubmit(submit)}>
      <TextInput
        label="Display name"
        autoComplete="name"
        data-autofocus
        {...form.getInputProps("displayName")}
      />
      <div className={dialogs.footer}>
        <Button variant="default" onClick={onDone} disabled={form.submitting}>
          Cancel
        </Button>
        <Button type="submit" loading={form.submitting} disabled={!form.isDirty()}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
