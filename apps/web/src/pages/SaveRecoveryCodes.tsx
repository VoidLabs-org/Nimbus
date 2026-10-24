import { Button, Checkbox } from "@mantine/core";
import { copy } from "./copy";
import classes from "./TwoStepSetupDialog.module.css";

/**
 * A set of Recovery codes the User sees once (designs 32d and View new codes): the list, Copy, Download .txt and
 * "I've saved these codes", which the window's main button waits for.
 */
export function SaveRecoveryCodes({
  codes,
  saved,
  onSavedChange,
}: {
  codes: string[];
  saved: boolean;
  onSavedChange: (saved: boolean) => void;
}) {
  return (
    <>
      <ul className={classes.codes} aria-label="Recovery codes">
        {codes.map((recoveryCode) => (
          <li key={recoveryCode}>
            <code>{recoveryCode}</code>
          </li>
        ))}
      </ul>
      <div className={classes.codeActions}>
        <Button
          variant="default"
          className={classes.pillButton}
          onClick={() => void copy(codes.join("\n"), "Recovery codes copied.")}
        >
          Copy
        </Button>
        <Button variant="default" className={classes.pillButton} onClick={() => download(codes)}>
          Download .txt
        </Button>
      </div>
      <Checkbox
        label="I’ve saved these codes"
        radius="xl"
        checked={saved}
        onChange={(event) => onSavedChange(event.currentTarget.checked)}
      />
    </>
  );
}

function download(codes: string[]) {
  const text = `Nimbus recovery codes\nEach code signs you in once if you lose your phone.\n\n${codes.join("\n")}\n`;
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "nimbus-recovery-codes.txt";
  link.click();
  // Some browsers start the download after click() returns, so the address must outlive it for a while.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
