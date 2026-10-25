import { Button, Slider } from "@mantine/core";
import { useState } from "react";
import Cropper from "react-easy-crop";
import { WindowFrame } from "../access/WindowFrame";
import { croppedPicture, previewStyle, type CropArea } from "../settings/profilePicture";
import dialogs from "./DisconnectDialogs.module.css";
import classes from "./PositionPhotoDialog.module.css";

const MAX_ZOOM = 3;

/**
 * "Position your photo" (design 35c): the chosen file in a round crop to drag and zoom (slider, wheel or pinch), with
 * 40px and 28px previews. "Save photo" hands the cropped square to `onSave`, which uploads it; while `saving`, nothing
 * closes the window. Full screen on a phone.
 */
export function PositionPhotoDialog({
  photo,
  saving,
  onSave,
  onClose,
}: {
  /** The file the User chose and its object URL; null keeps the window closed. */
  photo: { file: File; src: string } | null;
  saving: boolean;
  onSave: (picture: Blob) => Promise<void>;
  /** Also called for the ✕, Escape and a click outside; the caller ignores it while saving. */
  onClose: () => void;
}) {
  return (
    <WindowFrame
      opened={photo !== null}
      onClose={onClose}
      title="Position your photo"
      subtitle="Drag to move, use the slider to zoom."
      fullScreenOnPhone
      withCloseButton={!saving}
    >
      {/* Inside the window, so each photo starts centred at no zoom. */}
      {photo && <PositionPhoto photo={photo} saving={saving} onSave={onSave} onCancel={onClose} />}
    </WindowFrame>
  );
}

function PositionPhoto({
  photo,
  saving,
  onSave,
  onCancel,
}: {
  photo: { file: File; src: string };
  saving: boolean;
  onSave: (picture: Blob) => Promise<void>;
  onCancel: () => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [shown, setShown] = useState<CropArea | null>(null);
  const [pixels, setPixels] = useState<CropArea | null>(null);
  // Cropping takes a moment before the upload starts; the buttons are busy from the click.
  const [cropping, setCropping] = useState(false);
  const busy = saving || cropping;

  async function save() {
    setCropping(true);
    try {
      await onSave(await croppedPicture(photo.file, photo.src, pixels));
    } finally {
      setCropping(false);
    }
  }

  const preview = previewStyle(photo.src, shown);
  return (
    <div className={classes.body}>
      <div className={classes.stage}>
        <Cropper
          image={photo.src}
          crop={crop}
          zoom={zoom}
          maxZoom={MAX_ZOOM}
          aspect={1}
          cropShape="round"
          showGrid={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(area, areaPixels) => {
            setShown(area);
            setPixels(areaPixels);
          }}
        />
      </div>
      <div className={classes.zoom}>
        <span aria-hidden>−</span>
        <Slider
          className={classes.slider}
          value={zoom}
          onChange={setZoom}
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          label={null}
          thumbLabel="Zoom"
        />
        <span aria-hidden>+</span>
      </div>
      <div className={classes.footer}>
        <div className={classes.preview}>
          Preview
          <span className={classes.round} style={{ ...preview, width: 40, height: 40 }} />
          <span className={classes.round} style={{ ...preview, width: 28, height: 28 }} />
        </div>
        <div className={dialogs.footer}>
          <Button variant="default" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            Save photo
          </Button>
        </div>
      </div>
    </div>
  );
}
